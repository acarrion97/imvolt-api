import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config/global';
import { HttpError } from '../core/errors';

const ENCRYPTED_PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const key = config.integrationCredentialsEncryptionKey;
  if (!/^[\da-fA-F]{64}$/.test(key)) {
    throw new HttpError(
      503,
      'Configura INTEGRATION_CREDENTIALS_ENCRYPTION_KEY en el backend para guardar credenciales de integración.',
    );
  }
  return Buffer.from(key, 'hex');
}

export function isEncryptedIntegrationSecret(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptIntegrationSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return [
    'enc',
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptIntegrationSecret(value: string): string {
  if (!isEncryptedIntegrationSecret(value)) return value;

  const [prefix, version, ivText, tagText, ciphertextText, ...extra] = value.split(':');
  if (
    prefix !== 'enc' ||
    version !== 'v1' ||
    !ivText ||
    !tagText ||
    !ciphertextText ||
    extra.length
  ) {
    throw new HttpError(503, 'La credencial cifrada de la integración tiene un formato inválido.');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivText, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new HttpError(
      503,
      'No se pudo descifrar la credencial. Verifica INTEGRATION_CREDENTIALS_ENCRYPTION_KEY.',
    );
  }
}
