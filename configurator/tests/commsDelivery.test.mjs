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

test('a successful 2xx response resolves without throwing', async () => {
  await withEnv(CONFIGURED, () => withFetch(
    async () => ({ ok: true, status: 201, json: async () => ({ sid: 'SM123' }) }),
    async () => {
      const deliverers = buildDeliverers();
      await assert.doesNotReject(deliverers.sms({ message: 'hi' }, '+15873777663'));
    },
  ));
});
