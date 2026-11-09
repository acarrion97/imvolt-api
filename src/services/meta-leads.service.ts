import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import axios from 'axios';
import supabase from '../config/supabaseClient';
import { config } from '../config/global';
import { HttpError } from '../core/errors';
import { decryptMetaToken } from './meta-oauth.service';

const graphUrl = `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;

interface LeadgenChange {
  field?: string;
  value?: {
    leadgen_id?: string | number;
    page_id?: string | number;
    form_id?: string | number;
  };
}

interface LeadField {
  name?: string;
  values?: string[];
}

function hash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function verifyMetaSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature || !/^sha256=[\da-f]{64}$/i.test(signature) || !config.metaOAuth.appSecret) {
    return false;
  }
  const expected = createHmac('sha256', config.metaOAuth.appSecret).update(rawBody).digest();
  const received = Buffer.from(signature.slice('sha256='.length), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function leadField(fields: LeadField[], ...names: string[]): string {
  const field = fields.find((candidate) => names.includes(String(candidate.name ?? '').toLowerCase()));
  return String(field?.values?.[0] ?? '').trim();
}

async function fetchLeadData(leadId: string, pageId: string, userToken: string): Promise<LeadField[]> {
  try {
    const { data: page } = await axios.get<{ access_token?: string }>(`${graphUrl}/${pageId}`, {
      params: { fields: 'access_token', access_token: userToken },
      timeout: 15000,
    });
    if (!page.access_token) throw new Error('Meta no devolvió un token de página');
    const { data: lead } = await axios.get<{ field_data?: LeadField[] }>(`${graphUrl}/${leadId}`, {
      params: {
        fields: 'id,created_time,field_data,ad_id,form_id',
        access_token: page.access_token,
      },
      timeout: 15000,
    });
    return Array.isArray(lead.field_data) ? lead.field_data : [];
  } catch {
    throw new HttpError(502, 'Meta no permitió consultar el lead del formulario. Revisa permisos y acceso a la página.');
  }
}

async function ingestLead(change: LeadgenChange): Promise<void> {
  const value = change.value;
  const leadId = String(value?.leadgen_id ?? '');
  const pageId = String(value?.page_id ?? '');
  const formId = String(value?.form_id ?? '');
  if (!leadId || !pageId || !formId) return;

  const { data: campaigns, error: campaignError } = await supabase
    .from('campanias_publicitarias')
    .select('campania_publicitaria_id, empresa_id, conexion_id, meta_page_id, meta_lead_form_id')
    .eq('meta_page_id', pageId)
    .eq('meta_lead_form_id', formId)
    .eq('estado_flujo', 'published_paused')
    .limit(2);
  if (campaignError) throw new HttpError(503, 'No se pudo asociar el formulario recibido a una campaña.');
  if (!campaigns?.length) return;
  if (campaigns.length !== 1) {
    throw new HttpError(409, 'El formulario de Meta está asociado a más de una empresa o campaña.');
  }

  const campaign = campaigns[0];
  if (!campaign.empresa_id || !campaign.conexion_id) {
    throw new HttpError(503, 'La campaña del formulario no tiene empresa o conexión Meta asociada.');
  }
  const { data: connection, error: connectionError } = await supabase
    .from('conexiones')
    .select('access_token_enc, token_expira_en, estado')
    .eq('conexion_id', campaign.conexion_id)
    .eq('empresa_id', campaign.empresa_id)
    .eq('estado', 'conectada')
    .maybeSingle();
  if (connectionError || !connection?.access_token_enc) {
    throw new HttpError(503, 'No hay una conexión Meta activa para leer este formulario.');
  }
  if (connection.token_expira_en && new Date(connection.token_expira_en).getTime() <= Date.now()) {
    throw new HttpError(503, 'La conexión Meta expiró. Vuelve a conectar la cuenta.');
  }

  const fields = await fetchLeadData(leadId, pageId, decryptMetaToken(connection.access_token_enc));
  const email = leadField(fields, 'email', 'correo');
  const phone = leadField(fields, 'phone_number', 'phone', 'telefono');
  const fullName = leadField(fields, 'full_name', 'name');
  const firstName = leadField(fields, 'first_name', 'firstname', 'nombres') || fullName.split(/\s+/)[0] || 'Lead';
  const lastName = leadField(fields, 'last_name', 'lastname', 'apellidos') ||
    fullName.split(/\s+/).slice(1).join(' ');

  if (!email && !phone) {
    throw new HttpError(422, 'El formulario de Meta no incluyó email ni teléfono para deduplicar el prospecto.');
  }

  const { error: ingestError } = await supabase.rpc('ingest_meta_lead', {
    p_empresa_id: Number(campaign.empresa_id),
    p_campania_id: Number(campaign.campania_publicitaria_id),
    p_provider_lead_id: leadId,
    p_nombres: firstName,
    p_apellidos: lastName,
    p_correo: email || null,
    p_telefono: phone || null,
  });
  if (ingestError) {
    throw new HttpError(503, 'No se pudo guardar o deduplicar el lead de Meta.');
  }
}

export async function processMetaLeadWebhook(payload: unknown): Promise<number> {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(400, 'El cuerpo del webhook de Meta no es válido.');
  }
  const entries = (payload as { entry?: Array<{ changes?: LeadgenChange[] }> }).entry;
  if (!Array.isArray(entries)) throw new HttpError(400, 'El webhook no contiene eventos.');

  let processed = 0;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen' || !change.value?.leadgen_id) continue;
      await ingestLead(change);
      processed += 1;
    }
  }
  return processed;
}

async function deliverConversion(input: {
  empresaId: number;
  contactId: number;
  eventId: string;
  eventName: 'Schedule' | 'Purchase';
  eventTime: number;
  email: string | null;
  phone: string | null;
  pixelId: string;
  accessToken: string;
}): Promise<void> {
  const userData: Record<string, string[]> = {};
  if (input.email) userData.em = [hash(input.email)];
  if (input.phone) userData.ph = [hash(input.phone.replace(/\D/g, ''))];
  if (!userData.em && !userData.ph) {
    throw new HttpError(422, 'No hay email ni teléfono para enviar la conversión a Meta.');
  }

  try {
    const { data } = await axios.post<{ events_received?: number; error?: { code?: number } }>(
      `${graphUrl}/${encodeURIComponent(input.pixelId)}/events`,
      {
        data: [{
          event_name: input.eventName,
          event_time: input.eventTime,
          event_id: input.eventId,
          action_source: 'system_generated',
          user_data: userData,
        }],
      },
      { params: { access_token: input.accessToken }, timeout: 15000 },
    );
    if (!data || Number(data.events_received) < 1) {
      throw new HttpError(502, 'Meta no confirmó la recepción del evento CAPI.');
    }
  } catch (error) {
    const errorCode = axios.isAxiosError(error) && typeof error.response?.data?.error?.code === 'number'
      ? String(error.response.data.error.code)
      : 'delivery_failed';
    await supabase.from('meta_capi_events').update({
      estado: 'failed',
      error_code: errorCode,
    }).eq('event_id', input.eventId);
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'No se pudo entregar el evento de conversión a Meta.');
  }

  const { error } = await supabase.from('meta_capi_events').update({
    estado: 'sent',
    error_code: null,
    enviado_en: new Date().toISOString(),
  }).eq('event_id', input.eventId);
  if (error) throw new HttpError(503, 'Meta recibió la conversión, pero no se pudo registrar su entrega.');
}

export async function sendLeadConversion(empresaId: string | number, contactId: string | number): Promise<void> {
  const parsedEmpresaId = Number(empresaId);
  const parsedContactId = Number(contactId);
  const { data: contact, error: contactError } = await supabase
    .from('contactos')
    .select('contacto_id, empresa_id, campania_id, correo, telefono, etapa, actualizado_en')
    .eq('contacto_id', parsedContactId)
    .eq('empresa_id', parsedEmpresaId)
    .maybeSingle();
  if (contactError) throw new HttpError(503, 'No se pudo consultar el prospecto para CAPI.');
  if (!contact || !contact.campania_id) return;

  const eventName = contact.etapa === 'visitado'
    ? 'Schedule'
    : contact.etapa === 'cerrado'
      ? 'Purchase'
      : null;
  if (!eventName) return;

  const { data: campaign, error: campaignError } = await supabase
    .from('campanias_publicitarias')
    .select('meta_pixel_id, conexion_id')
    .eq('campania_publicitaria_id', contact.campania_id)
    .eq('empresa_id', parsedEmpresaId)
    .maybeSingle();
  if (campaignError) throw new HttpError(503, 'No se pudo consultar la campaña para CAPI.');
  if (!campaign?.meta_pixel_id || !campaign.conexion_id) return;

  const { data: connection, error: connectionError } = await supabase
    .from('conexiones')
    .select('access_token_enc, token_expira_en')
    .eq('conexion_id', campaign.conexion_id)
    .eq('empresa_id', parsedEmpresaId)
    .eq('estado', 'conectada')
    .maybeSingle();
  if (connectionError || !connection?.access_token_enc) {
    throw new HttpError(503, 'No hay una conexión Meta activa para enviar la conversión.');
  }
  if (connection.token_expira_en && new Date(connection.token_expira_en).getTime() <= Date.now()) {
    throw new HttpError(503, 'La conexión Meta expiró. Vuelve a conectar la cuenta.');
  }

  const eventId = randomUUID();
  const eventTime = Math.floor(Date.now() / 1000);
  const { error: insertError } = await supabase.from('meta_capi_events').insert({
    empresa_id: parsedEmpresaId,
    contacto_id: parsedContactId,
    event_id: eventId,
    event_name: eventName,
  });
  if (insertError) throw new HttpError(503, 'No se pudo registrar el evento de conversión para Meta.');

  await deliverConversion({
    empresaId: parsedEmpresaId,
    contactId: parsedContactId,
    eventId,
    eventName,
    eventTime,
    email: contact.correo,
    phone: contact.telefono,
    pixelId: campaign.meta_pixel_id,
    accessToken: decryptMetaToken(connection.access_token_enc),
  });
}

export async function retryFailedConversion(empresaId: string | number, contactId: string | number): Promise<void> {
  const parsedEmpresaId = Number(empresaId);
  const parsedContactId = Number(contactId);
  const { data: event, error: eventError } = await supabase
    .from('meta_capi_events')
    .select('event_id, event_name, creado_en')
    .eq('empresa_id', parsedEmpresaId)
    .eq('contacto_id', parsedContactId)
    .eq('estado', 'failed')
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eventError) throw new HttpError(503, 'No se pudo consultar el evento fallido de Meta.');
  if (!event) throw new HttpError(404, 'No hay conversiones fallidas para este prospecto.');

  const { data: contact } = await supabase
    .from('contactos')
    .select('correo, telefono, campania_id')
    .eq('contacto_id', parsedContactId)
    .eq('empresa_id', parsedEmpresaId)
    .maybeSingle();
  if (!contact?.campania_id) throw new HttpError(404, 'No se encontró la campaña del prospecto.');
  const { data: campaign } = await supabase
    .from('campanias_publicitarias')
    .select('meta_pixel_id, conexion_id')
    .eq('campania_publicitaria_id', contact.campania_id)
    .eq('empresa_id', parsedEmpresaId)
    .maybeSingle();
  if (!campaign?.meta_pixel_id || !campaign.conexion_id) {
    throw new HttpError(503, 'La campaña no tiene Pixel de Meta o conexión configurados.');
  }
  const { data: connection } = await supabase
    .from('conexiones')
    .select('access_token_enc, token_expira_en')
    .eq('conexion_id', campaign.conexion_id)
    .eq('empresa_id', parsedEmpresaId)
    .eq('estado', 'conectada')
    .maybeSingle();
  if (!connection?.access_token_enc) throw new HttpError(503, 'La conexión Meta no está activa.');
  if (connection.token_expira_en && new Date(connection.token_expira_en).getTime() <= Date.now()) {
    throw new HttpError(503, 'La conexión Meta expiró. Vuelve a conectar la cuenta.');
  }

  await supabase.from('meta_capi_events').update({ estado: 'pending', error_code: null })
    .eq('event_id', event.event_id);
  await deliverConversion({
    empresaId: parsedEmpresaId,
    contactId: parsedContactId,
    eventId: event.event_id,
    eventName: event.event_name,
    eventTime: Math.floor(new Date(event.creado_en).getTime() / 1000),
    email: contact.correo,
    phone: contact.telefono,
    pixelId: campaign.meta_pixel_id,
    accessToken: decryptMetaToken(connection.access_token_enc),
  });
}
