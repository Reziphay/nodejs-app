import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;

const normalizeBase32 = (value: string): string =>
  value.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');

export const encodeBase32 = (buffer: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

export const decodeBase32 = (value: string): Buffer => {
  const normalized = normalizeBase32(value);
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);

    if (index === -1) {
      throw new Error('Invalid base32 secret');
    }

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

export const generateTotpSecret = (): string =>
  encodeBase32(randomBytes(20));

const getCounterBuffer = (counter: number): Buffer => {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter % 0x100000000, 4);
  return buffer;
};

export const generateTotpCode = (
  secret: string,
  now = Date.now(),
  digits = DEFAULT_DIGITS,
  periodSeconds = DEFAULT_PERIOD_SECONDS,
): string => {
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 1000 / periodSeconds);
  const hmac = createHmac('sha1', key).update(getCounterBuffer(counter)).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] ?? 0) & 127) << 24
    | ((hmac[offset + 1] ?? 0) & 255) << 16
    | ((hmac[offset + 2] ?? 0) & 255) << 8
    | ((hmac[offset + 3] ?? 0) & 255);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
};

const safeEqualStrings = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyTotpCode = (
  secret: string,
  code: string,
  now = Date.now(),
  window = 1,
  digits = DEFAULT_DIGITS,
  periodSeconds = DEFAULT_PERIOD_SECONDS,
): boolean => {
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotpCode(
      secret,
      now + offset * periodSeconds * 1000,
      digits,
      periodSeconds,
    );

    if (safeEqualStrings(expected, code)) {
      return true;
    }
  }

  return false;
};

export const buildOtpAuthUrl = ({
  accountName,
  issuer,
  secret,
}: {
  accountName: string;
  issuer: string;
  secret: string;
}): string => {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
};
