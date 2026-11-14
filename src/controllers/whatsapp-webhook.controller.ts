import { RequestHandler, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { errorResponse, HttpError } from '../core/errors';
import { verifyMetaSignature } from '../services/meta-leads.service';
import { config } from '../config/global';
import supabase from '../config/supabaseClient';
import { requireOrg } from '../middlewares/sessionAuth';

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

    void persistIncomingMessages(payload).catch((error) => {
      console.error('[whatsapp] no se pudieron guardar los mensajes recibidos', error);
    });

    res.status(200).json({ received: true });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

interface WhatsAppPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

async function persistIncomingMessages(payload: unknown): Promise<void> {
  const empresaId = Number(config.defaultOrganizationId);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) return;

  const body = payload as WhatsAppPayload;
  const rows = (body.entry ?? []).flatMap((entry) =>
    (entry.changes ?? []).flatMap((change) => {
      const value = change.value;
      return (value?.messages ?? []).flatMap((message) => {
        if (!message.id || !message.from) return [];
        const contact = value?.contacts?.find((item) => item.wa_id === message.from);
        return [{
          empresa_id: empresaId,
          meta_message_id: message.id,
          phone_number_id: value?.metadata?.phone_number_id ?? null,
          sender_phone: message.from,
          sender_name: contact?.profile?.name ?? null,
          message_type: message.type ?? 'unknown',
          message_text: message.text?.body ?? null,
          meta_timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : null,
          payload: message,
        }];
      });
    }),
  );

  if (!rows.length) return;
  const { error } = await supabase.from('whatsapp_messages').upsert(rows, {
    onConflict: 'empresa_id,meta_message_id',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);
}

export const whatsappWebhookRouter = Router();

/** Estado no sensible para el panel de configuración del frontend. */
whatsappWebhookRouter.get('/status', (_req, res) => {
  const webhookConfigured = Boolean(config.whatsappWebhookVerifyToken);
  const signatureValidation = Boolean(config.metaOAuth.appSecret);

  res.json({
    webhook_configured: webhookConfigured,
    signature_validation: signatureValidation,
    receives_events: webhookConfigured && signatureValidation,
    stores_messages: Boolean(config.defaultOrganizationId),
    processes_messages: false,
  });
});

whatsappWebhookRouter.get('/', verify);
whatsappWebhookRouter.post('/', receive);

export const whatsappMessagesRouter = Router();
whatsappMessagesRouter.get('/', ...requireOrg, async (req, res) => {
  try {
    const empresaId = Number(req.organizationId);
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('message_id, meta_message_id, sender_phone, sender_name, message_type, message_text, meta_timestamp, recibido_en')
      .eq('empresa_id', empresaId)
      .order('recibido_en', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    res.json(data ?? []);
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
});
