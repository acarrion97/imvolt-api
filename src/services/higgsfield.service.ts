// services/higgsfield.service.ts
// Adaptador de Higgsfield para generación de imagen y video con IA.
// Documento maestro §09.
//
// El navegador NUNCA recibe la clave privada del proveedor: la llamada sale
// siempre del backend. La API expone tres operaciones:
//
//   createJob(entrada)           → { request_id, status }
//   getStatus(request_id)        → estado normalizado + URL del resultado
//
// Las credenciales de Higgsfield se resuelven desde la conexión activa de la
// empresa. Sin conexión, el adaptador simula el proveedor.

import axios from 'axios';
import { HttpError } from '../core/errors';
import { MediaType } from '../models/creative/media.model';

export interface HiggsfieldJobRequest {
  provider_model_id: string;
  media_type: MediaType;
  prompt: string;
  image_url?: string;
  duration?: number;
  ratio?: string;
  resolution?: string;
}

export interface HiggsfieldJobStatus {
  request_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  result_url?: string;
  result_urls?: string[];
  error?: string;
  simulated?: boolean;
}

export interface HiggsfieldCredentials {
  baseUrl: string;
  apiKeyId: string;
  apiKeySecret: string;
}

interface ProviderStatusResponse {
  request_id: string;
  status: string;
  error?: string | null;
  images?: Array<{ url: string }>;
  video?: { url: string };
}

interface SimulatedJob {
  createdAt: number;
  request: HiggsfieldJobRequest;
}

/** Jobs simulados en memoria (solo existe en modo simulación). */
const simulatedJobs = new Map<string, SimulatedJob>();
const SIMULATED_LATENCY_MS = 8000;
const MODEL_WORKFLOWS: Record<string, { endpoint: string; mediaType: MediaType }> = {
  'higgsfield-ai/soul/v2/standard': {
    endpoint: 'higgsfield-ai/soul/v2/standard',
    mediaType: 'image',
  },
  // Existing deployments may still have the pre-migration catalog identifier.
  'higgsfield/soul-4-image': {
    endpoint: 'higgsfield-ai/soul/v2/standard',
    mediaType: 'image',
  },
  'kling-video/v2.6/pro/text-to-video': {
    endpoint: 'kling-video/v2.6/pro/text-to-video',
    mediaType: 'video',
  },
  'higgsfield/veo3-video': {
    endpoint: 'kling-video/v2.6/pro/text-to-video',
    mediaType: 'video',
  },
};

function providerHeaders(credentials: HiggsfieldCredentials, idempotencyKey?: string) {
  return {
    Authorization: `Key ${credentials.apiKeyId}:${credentials.apiKeySecret}`,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

function providerError(error: unknown, operation: string): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data as { detail?: unknown } | undefined;
    const detail = typeof responseData?.detail === 'string'
      ? responseData.detail
      : error.message;
    throw new Error(`Higgsfield ${operation} falló${status ? ` (${status})` : ''}: ${detail}`);
  }
  throw error;
}

async function createJob(
  request: HiggsfieldJobRequest,
  idempotencyKey?: string,
  credentials?: HiggsfieldCredentials,
): Promise<HiggsfieldJobStatus> {
  if (!credentials) {
    const requestId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    simulatedJobs.set(requestId, { createdAt: Date.now(), request });
    return { request_id: requestId, status: 'queued', simulated: true };
  }

  const workflow = MODEL_WORKFLOWS[request.provider_model_id];
  if (!workflow || workflow.mediaType !== request.media_type) {
    throw new Error(`Workflow Higgsfield no configurado para el modelo "${request.provider_model_id}".`);
  }

  const payload: Record<string, unknown> = {
    prompt: request.prompt,
  };
  if (request.ratio) payload.aspect_ratio = request.ratio;
  if (request.media_type === 'image' && request.resolution) {
    payload.resolution = request.resolution;
  }
  if (request.media_type === 'video' && request.duration !== undefined) {
    if (request.duration !== 5 && request.duration !== 10) {
      throw new Error('Kling 2.6 solo admite duración de 5 o 10 segundos.');
    }
    payload.duration = request.duration;
  }

  try {
    const { data } = await axios.post<{ request_id: string; status: string }>(
      `${credentials.baseUrl.replace(/\/+$/, '')}/${workflow.endpoint}`,
      payload,
      {
        timeout: 30000,
        headers: { ...providerHeaders(credentials, idempotencyKey), 'Content-Type': 'application/json' },
      },
    );
    if (!data.request_id) throw new Error('Higgsfield no devolvió request_id al aceptar la generación.');
    return { request_id: data.request_id, status: 'queued', simulated: false };
  } catch (error) {
    providerError(error, 'createJob');
  }
}

async function getStatus(
  requestId: string,
  credentials?: HiggsfieldCredentials,
): Promise<HiggsfieldJobStatus> {
  if (requestId.startsWith('sim_')) {
    const job = simulatedJobs.get(requestId);
    if (!job) return { request_id: requestId, status: 'failed', error: 'Job simulado desconocido' };

    const elapsed = Date.now() - job.createdAt;
    if (elapsed < 2000) return { request_id: requestId, status: 'queued' };
    if (elapsed < SIMULATED_LATENCY_MS) return { request_id: requestId, status: 'processing' };

    const kind = job.request.media_type === 'video' ? 'video' : 'image';
    return {
      request_id: requestId,
      status: 'completed',
      simulated: true,
      // Placeholder estable: en producción se reemplaza por la descarga a
      // storage propio (§09, paso 6).
      result_url: `https://placehold.co/1200x675/101719/00D94B?text=IMVOLT+${kind.toUpperCase()}+demo`,
      result_urls: [`https://placehold.co/1200x675/101719/00D94B?text=IMVOLT+${kind.toUpperCase()}+demo`],
    };
  }

  if (!credentials) {
    throw new HttpError(503, 'La conexión de Higgsfield de esta empresa no está configurada o activa.');
  }

  try {
    const { data } = await axios.get<ProviderStatusResponse>(
      `${credentials.baseUrl.replace(/\/+$/, '')}/requests/${encodeURIComponent(requestId)}/status`,
      { timeout: 30000, headers: providerHeaders(credentials) },
    );
    const statusMap: Record<string, HiggsfieldJobStatus['status']> = {
      queued: 'queued',
      in_progress: 'processing',
      completed: 'completed',
      failed: 'failed',
      nsfw: 'failed',
      canceled: 'canceled',
    };
    const status = statusMap[data.status];
    if (!status) throw new Error(`Estado Higgsfield desconocido: "${data.status}".`);
    const resultUrls = data.video?.url
      ? [data.video.url]
      : (data.images ?? []).map(({ url }) => url).filter(Boolean);
    return {
      request_id: requestId,
      status,
      result_url: resultUrls[0],
      result_urls: resultUrls,
      error: data.error ?? (data.status === 'nsfw' ? 'El proveedor rechazó el contenido.' : undefined),
    };
  } catch (error) {
    providerError(error, 'getStatus');
  }
}

export const higgsfieldService = { createJob, getStatus };
