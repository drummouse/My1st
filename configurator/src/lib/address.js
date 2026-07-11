// Reformats a postal/zip code typed in any casing/spacing/punctuation into
// the standard display form for its country — Canadian "A0A 0A0", US
// "12345" or "12345-6789". Best-effort: a value that doesn't fit either
// pattern (a partial entry mid-typing, or a country this app doesn't yet
// know) is returned trimmed-and-uppercased rather than rejected, so it never
// blocks the field — validation of "is this address real" is out of scope.
export function formatPostalOrZip(raw, countryCode) {
  const value = String(raw || '').trim();
  if (!value) return '';

  if (countryCode === 'US') {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 9) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
    if (digits.length >= 5) return digits.slice(0, 5);
    return digits;
  }

  // Canada (and the default if countryCode is absent/unrecognized) — six
  // alphanumeric characters, letter-digit-letter-digit-letter-digit.
  const alnum = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (alnum.length >= 6) return `${alnum.slice(0, 3)} ${alnum.slice(3, 6)}`;
  return alnum;
}
