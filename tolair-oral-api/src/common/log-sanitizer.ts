import { createHash } from 'crypto';

/**
 * Hash an email for safe logging. Returns first 8 chars of SHA-256.
 * Example: "user@example.com" → "a1b2c3d4..."
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').substring(0, 8);
}

/**
 * Mask an NPI for logging. Shows first 3 digits only.
 * Example: "1234567890" → "123***7890"
 */
export function maskNpi(npi: string): string {
  if (npi.length !== 10) return '***';
  return `${npi.substring(0, 3)}***${npi.substring(7)}`;
}
