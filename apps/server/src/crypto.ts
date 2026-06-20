import crypto from 'node:crypto';
import { config } from './config';

/**
 * Шифрование секретов интеграций at-rest (AES-256-GCM). Токен донат-сервиса даёт доступ
 * к истории донатов стримера — храним только в зашифрованном виде, клиенту не отдаём.
 *
 * Ключ: INTEGRATION_ENC_KEY из env (любой длины — нормализуем через sha256 к 32 байтам),
 * dev-fallback — производный от cookieSecret. Формат строки: iv:tag:ciphertext (hex).
 */
function key(): Buffer {
  const raw = process.env.INTEGRATION_ENC_KEY || config.cookieSecret;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

export function decryptSecret(blob: string): string {
  const [ivHex, tagHex, dataHex] = blob.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('bad ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}
