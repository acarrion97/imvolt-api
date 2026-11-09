import { RequestHandler, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { errorResponse, HttpError } from '../core/errors';
import { processMetaLeadWebhook, verifyMetaSignature } from '../services/meta-leads.service';
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

  if (!config.metaWebhookVerifyToken) {
    res.status(503).send('Webhook de Meta no configurado.');
    return;
  }
  if (mode !== 'subscribe' || !challenge || !sameSecret(token, config.metaWebhookVerifyToken)) {
    res.sendStatus(403);
    return;
  }
  res.type('text/plain').status(200).send(challenge);
};

const receive: RequestHandler = async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!rawBody.length || !verifyMetaSignature(rawBody, req.get('x-hub-signature-256'))) {
      throw new HttpError(401, 'Firma del webhook de Meta inválida.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new HttpError(400, 'El JSON del webhook de Meta no es válido.');
    }
    const processed = await processMetaLeadWebhook(payload);
    res.status(200).json({ received: true, processed });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

export const metaWebhookRouter = Router();
metaWebhookRouter.get('/', verify);
metaWebhookRouter.post('/', receive);
