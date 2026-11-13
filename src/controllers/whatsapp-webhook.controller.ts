import { RequestHandler, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { errorResponse, HttpError } from '../core/errors';
import { verifyMetaSignature } from '../services/meta-leads.service';
import { config } from '../config/global';

function sameSecret(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

const verify: RequestHandler = (req, res) => {
  const mode = typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : '';
  const token = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : '';
  const challenge = typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : '';
  const expected = config.whatsappWebhookVerifyToken;

  if (!expected) {
    res.status(503).send('Webhook de WhatsApp no configurado.');
    return;
  }
  if (mode !== 'subscribe' || !challenge || !sameSecret(token, expected)) {
    res.sendStatus(403);
    return;
  }
  res.type('text/plain').status(200).send(challenge);
};

const receive: RequestHandler = (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!rawBody.length || !verifyMetaSignature(rawBody, req.get('x-hub-signature-256'))) {
      throw new HttpError(401, 'Firma del webhook de WhatsApp inválida.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new HttpError(400, 'El JSON del webhook de WhatsApp no es válido.');
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      (payload as { object?: unknown }).object !== 'whatsapp_business_account' ||
      !Array.isArray((payload as { entry?: unknown }).entry)
    ) {
      throw new HttpError(400, 'El webhook no contiene eventos de WhatsApp Business.');
    }

    // Acknowledge valid events without logging message contents or personal data.
    res.status(200).json({ received: true });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

export const whatsappWebhookRouter = Router();
whatsappWebhookRouter.get('/', verify);
whatsappWebhookRouter.post('/', receive);
