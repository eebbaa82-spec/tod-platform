import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'crypto';
import { config } from './config';

// AES-256-GCM field encryption for payout accounts and other restricted fields (NFR-SEC-01).
export function encryptField(plain: string): string {
  const key = Buffer.from(config.fieldKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptField(blob: string): string {
  const [ver, iv, tag, enc] = blob.split(':');
  if (ver !== 'v1') throw new Error('Unknown field encryption version');
  const key = Buffer.from(config.fieldKey, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8');
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function numericCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

// Show only the first four and last four characters, e.g. "6302 XXXX XXXX 9718".
export function maskIdentifier(id: string): string {
  const d = id.replace(/\s+/g, '');
  if (d.length <= 8) return d.replace(/./g, 'X');
  const middle = 'X'.repeat(d.length - 8);
  const grouped = (d.slice(0, 4) + middle + d.slice(-4)).replace(/(.{4})/g, '$1 ').trim();
  return grouped;
}

export function maskAccount(acc: string): string {
  const d = acc.replace(/\s+/g, '');
  return d.length <= 4 ? '****' : '*'.repeat(Math.min(d.length - 4, 8)) + d.slice(-4);
}
