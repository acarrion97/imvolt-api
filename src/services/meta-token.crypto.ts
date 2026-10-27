import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { HttpError } from '../core/errors';
import { config } from '../config/global';

const ENCODING = 'hex';

function encryptionKey(): Buffer {
  const value = config.meta.tokenEncryptionKey;
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new HttpError(503, 'La clave de cifrado OAuth de Meta no está configurada correctamente');
  }
  return Buffer.from(value, ENCODING);
}

export function encryptMetaToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString(ENCODING), cipher.getAuthTag().toString(ENCODING), ciphertext.toString(ENCODING)].join(':');
}

export function decryptMetaToken(value: string): string {
  const [version, ivHex, tagHex, ciphertextHex, ...extra] = value.split(':');
  if (version !== 'v1' || !ivHex || !tagHex || !ciphertextHex || extra.length > 0) {
    throw new HttpError(500, 'El token de Meta almacenado tiene un formato inválido');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, ENCODING));
    decipher.setAuthTag(Buffer.from(tagHex, ENCODING));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, ENCODING)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new HttpError(500, 'No se pudo descifrar el token de Meta; verifica META_TOKEN_ENCRYPTION_KEY');
  }
}
