import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeliverers, DeliveryError } from '../api/_lib/commsDelivery.js';

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

function withFetch(impl, fn) {
  const previous = global.fetch;
  let called = false;
  global.fetch = async (...args) => { called = true; return impl(...args); };
  return Promise.resolve(fn(() => called)).finally(() => { global.fetch = previous; });
}

function abortError() {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

// A fetch that never resolves on its own — only rejects if/when its signal
// is aborted, so a test using this proves a real deadline is enforced
// rather than the mock just resolving quickly regardless.
function withHangingFetch(fn) {
  const previous = global.fetch;
  global.fetch = (url, options) => new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(abortError()); return; }
    options.signal?.addEventListener('abort', () => reject(abortError()));
  });
  return Promise.resolve(fn()).finally(() => { global.fetch = previous; });
}

// D-072 regression: fetch() itself resolves immediately (headers arrive
// right away) — the bug was that the deadline timer got cleared at that
// point, before the body was ever read. `hangOn` picks which body method
// (json/text) hangs until the same signal passed to fetch() is aborted;
// the other method resolves instantly, so only the intended one is what's
// actually under test.
function withBodyHangingFetch({ ok, status, hangOn }, fn) {
  const previous = global.fetch;
  global.fetch = async (url, options) => {
    const hangingBody = () => new Promise((resolve, reject) => {
      if (options.signal?.aborted) { reject(abortError()); return; }
      options.signal?.addEventListener('abort', () => reject(abortError()));
    });
    return {
      ok,
      status,
      json: hangOn === 'json' ? hangingBody : async () => ({ sid: 'SM123' }),
      text: hangOn === 'text' ? hangingBody : async () => '',
    };
  };
  return Promise.resolve(fn()).finally(() => { global.fetch = previous; });
}

const CONFIGURED = {
  TWILIO_ACCOUNT_SID: 'sid', TWILIO_AUTH_TOKEN: 'token', PLATFORM_DEFAULT_PHONE: '+15005550006',
  SENDGRID_API_KEY: 'key', SENDGRID_FROM_EMAIL: 'notify@example.com',
};

test('an invalid SMS destination is rejected before any network call (validation category, no provider cost)', async () => {
  await withEnv(CONFIGURED, () => withFetch(() => { throw new Error('should not be called'); }, async (wasCalled) => {
    const deliverers = buildDeliverers();
    await assert.rejects(
      deliverers.sms({ message: 'hi' }, '58777502024'),
      (err) => err instanceof DeliveryError && err.category === 'validation',
    );
    assert.equal(wasCalled(), false);
  }));
});

test('an invalid email destination is rejected before any network call', async () => {
  await withEnv(CONFIGURED, () => withFetch(() => { throw new Error('should not be called'); }, async (wasCalled) => {
    const deliverers = buildDeliverers();
    await assert.rejects(
      deliverers.email({ message: 'hi', subject: 'hi' }, 'not-an-email'),
      (err) => err instanceof DeliveryError && err.category === 'validation',
    );
    assert.equal(wasCalled(), false);
  }));
});

test('missing provider credentials classify as not_configured, not a recipient failure', async () => {
  await withEnv({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' }, async () => {
    const deliverers = buildDeliverers();
    await assert.rejects(
      deliverers.sms({ message: 'hi' }, '+15873777663'),
      (err) => err instanceof DeliveryError && err.category === 'not_configured',
    );
  });
});

test('a 4xx provider response classifies as permanent', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: false, status: 400, text: async () => '{"code":21211,"message":"Invalid To Phone Number"}' }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.sms({ message: 'hi' }, '+15873777663'),
        (err) => err instanceof DeliveryError && err.category === 'permanent',
      );
    },
  ));
});

test('a 5xx provider response classifies as transient', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: false, status: 503, text: async () => 'temporarily unavailable' }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.email({ message: 'hi', subject: 'hi' }, 'someone@example.com'),
        (err) => err instanceof DeliveryError && err.category === 'transient',
      );
    },
  ));
});

test('a real network failure (fetch throws) classifies as transient', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => { throw new Error('ECONNRESET'); },
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.sms({ message: 'hi' }, '+15873777663'),
        (err) => err instanceof DeliveryError && err.category === 'transient',
      );
    },
  ));
});

// D-071 regression: HTTP 429/408 were previously misclassified as
// 'permanent' (anything below 500), which made a rate-limited row
// terminal on the very first attempt instead of retrying it.
test('Twilio HTTP 429 (rate limited) classifies as transient, not permanent', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: false, status: 429, text: async () => '{"code":20429,"message":"Too Many Requests"}' }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.sms({ message: 'hi' }, '+15873777663'),
        (err) => err instanceof DeliveryError && err.category === 'transient',
      );
    },
  ));
});

test('SendGrid HTTP 429 (rate limited) classifies as transient, not permanent', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: false, status: 429, text: async () => 'rate limit exceeded' }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.email({ message: 'hi', subject: 'hi' }, 'someone@example.com'),
        (err) => err instanceof DeliveryError && err.category === 'transient',
      );
    },
  ));
});

test('Twilio HTTP 408 (request timeout) classifies as transient', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: false, status: 408, text: async () => 'request timeout' }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.sms({ message: 'hi' }, '+15873777663'),
        (err) => err instanceof DeliveryError && err.category === 'transient',
      );
    },
  ));
});

test('SendGrid HTTP 408 (request timeout) classifies as transient', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: false, status: 408, text: async () => 'request timeout' }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.email({ message: 'hi', subject: 'hi' }, 'someone@example.com'),
        (err) => err instanceof DeliveryError && err.category === 'transient',
      );
    },
  ));
});

test('a genuine recipient/configuration 4xx (not 429/408) still classifies as permanent', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: false, status: 422, text: async () => 'unprocessable' }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.rejects(
        deliverers.sms({ message: 'hi' }, '+15873777663'),
        (err) => err instanceof DeliveryError && err.category === 'permanent',
      );
    },
  ));
});

// D-071 regression: the provider fetch previously had no timeout at all —
// a hung request could run indefinitely. This proves an AbortController
// deadline is actually wired to the fetch call, using a small explicit
// timeoutMs so the test doesn't wait for the real 5s default.
test('a hung Twilio request is aborted at the deadline and classifies as transient', async () => {
  await withEnv(CONFIGURED, () => withHangingFetch(async () => {
    const deliverers = buildDeliverers();
    const started = Date.now();
    await assert.rejects(
      deliverers.sms({ message: 'hi' }, '+15873777663', null, 50),
      (err) => err instanceof DeliveryError && err.category === 'transient' && /timed out/.test(err.message),
    );
    assert.ok(Date.now() - started < 2000, 'aborted at the 50ms deadline, not left hanging');
  }));
});

test('a hung SendGrid request is aborted at the deadline and classifies as transient', async () => {
  await withEnv(CONFIGURED, () => withHangingFetch(async () => {
    const deliverers = buildDeliverers();
    await assert.rejects(
      deliverers.email({ message: 'hi', subject: 'hi' }, 'someone@example.com', null, 50),
      (err) => err instanceof DeliveryError && err.category === 'transient' && /timed out/.test(err.message),
    );
  }));
});

// D-072 regression: fetchWithDeadline previously cleared its timer the
// instant fetch() resolved (i.e. once headers arrived), not once the body
// had actually been read — an independent reproduction showed a hung
// Twilio success-JSON body remained pending well past the deadline. These
// three prove the deadline now stays armed through body consumption too.
test('a hung Twilio success JSON body is aborted at the deadline and classifies as transient (not treated as sent)', async () => {
  await withEnv(CONFIGURED, () => withBodyHangingFetch({ ok: true, status: 201, hangOn: 'json' }, async () => {
    const deliverers = buildDeliverers();
    const started = Date.now();
    await assert.rejects(
      deliverers.sms({ message: 'hi' }, '+15873777663', null, 50),
      (err) => err instanceof DeliveryError && err.category === 'transient' && /timed out/.test(err.message),
    );
    assert.ok(Date.now() - started < 2000, 'aborted at the 50ms deadline during the body read, not left hanging');
  }));
});

test('a hung Twilio error-response body (.text()) is aborted at the deadline and classifies as transient, not the original HTTP status', async () => {
  await withEnv(CONFIGURED, () => withBodyHangingFetch({ ok: false, status: 400, hangOn: 'text' }, async () => {
    const deliverers = buildDeliverers();
    const started = Date.now();
    // Status 400 alone would classify 'permanent' (see classifyProviderStatus)
    // — proving 'transient' here proves the abort actually interrupted the
    // body read rather than the classification just falling through to the
    // pre-abort status once the read eventually (or never) settled.
    await assert.rejects(
      deliverers.sms({ message: 'hi' }, '+15873777663', null, 50),
      (err) => err instanceof DeliveryError && err.category === 'transient' && /timed out/.test(err.message),
    );
    assert.ok(Date.now() - started < 2000, 'aborted at the 50ms deadline during the error-body read, not left hanging');
  }));
});

test('a hung SendGrid error-response body (.text()) is aborted at the deadline and classifies as transient', async () => {
  await withEnv(CONFIGURED, () => withBodyHangingFetch({ ok: false, status: 400, hangOn: 'text' }, async () => {
    const deliverers = buildDeliverers();
    const started = Date.now();
    await assert.rejects(
      deliverers.email({ message: 'hi', subject: 'hi' }, 'someone@example.com', null, 50),
      (err) => err instanceof DeliveryError && err.category === 'transient' && /timed out/.test(err.message),
    );
    assert.ok(Date.now() - started < 2000, 'aborted at the 50ms deadline during the error-body read, not left hanging');
  }));
});

test('a successful 2xx response resolves without throwing', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: true, status: 201, json: async () => ({ sid: 'SM123' }) }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.doesNotReject(deliverers.sms({ message: 'hi' }, '+15873777663'));
    },
  ));
});
