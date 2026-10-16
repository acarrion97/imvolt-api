// services/higgsfield.service.ts
// Adaptador de Higgsfield para generación de imagen y video con IA.
// Documento maestro §09.
//
// El navegador NUNCA recibe la clave privada del proveedor: la llamada sale
// siempre del backend. La API expone tres operaciones:
//
//   quote(modelo, configuración) → costo estimado en créditos
//   createJob(entrada)           → { request_id, status_url }
//   getStatus(request_id)        → queued | processing | completed | failed
//
// Sin HIGGSFIELD_API_KEY (o con HIGGSFIELD_SIMULATE=true) el adaptador
// SIMULA el proveedor: crea un job con latencia y devuelve un resultado de
// demostración. Así el MVP es desarrollable y testeable sin credenciales.

import axios from 'axios';
import { config } from '../config/global';
import { MediaType } from '../models/creative/media.model';

export interface HiggsfieldQuote {
  creditos: number;
  proveedor: string;
  modelo: string;
}

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
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result_url?: string;
  error?: string;
}

interface SimulatedJob {
  createdAt: number;
  request: HiggsfieldJobRequest;
}

/** Jobs simulados en memoria (solo existe en modo simulación). */
const simulatedJobs = new Map<string, SimulatedJob>();
const SIMULATED_LATENCY_MS = 8000;
const BASE_CREDITS = { image: 1, video: 3 } as const;

const client = axios.create({
  baseURL: config.higgsfield.baseUrl,
  timeout: 30000,
});

/** Tarifa base por tipo de medio; el multiplicador comercial se aplica en credits.service. */
function quote(
  request: Pick<HiggsfieldJobRequest, 'media_type' | 'duration' | 'provider_model_id' | 'prompt'>,
): HiggsfieldQuote {
  const base = BASE_CREDITS[request.media_type];
  const durationExtra =
    request.media_type === 'video' && request.duration
      ? Math.max(0, Math.ceil(request.duration / 5) - 1)
      : 0;

  return {
    creditos: base + durationExtra,
    proveedor: 'higgsfield',
    modelo: request.provider_model_id,
  };
}

async function createJob(request: HiggsfieldJobRequest): Promise<HiggsfieldJobStatus> {
  if (config.higgsfield.simulate) {
    const requestId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    simulatedJobs.set(requestId, { createdAt: Date.now(), request });
    return { request_id: requestId, status: 'queued' };
  }

  const { data } = await client.post(
    '/v1/generations',
    {
      model: request.provider_model_id,
      type: request.media_type === 'video' ? 'text-to-video' : 'txt2img',
      params: {
        prompt: request.prompt,
        image_url: request.image_url,
        duration: request.duration,
        ratio: request.ratio,
        resolution: request.resolution,
      },
    },
    { headers: { Authorization: `Key ${config.higgsfield.apiKey}` } },
  );

  return { request_id: data.request_id, status: 'queued' };
}

async function getStatus(requestId: string): Promise<HiggsfieldJobStatus> {
  if (config.higgsfield.simulate) {
    const job = simulatedJobs.get(requestId);
    if (!job) return { request_id: requestId, status: 'failed', error: 'Job simulado desconocido' };

    const elapsed = Date.now() - job.createdAt;
    if (elapsed < 2000) return { request_id: requestId, status: 'queued' };
    if (elapsed < SIMULATED_LATENCY_MS) return { request_id: requestId, status: 'processing' };

    const kind = job.request.media_type === 'video' ? 'video' : 'image';
    return {
      request_id: requestId,
      status: 'completed',
      // Placeholder estable: en producción se reemplaza por la descarga a
      // storage propio (§09, paso 6).
      result_url: `https://placehold.co/1200x675/101719/00D94B?text=IMVOLT+${kind.toUpperCase()}+demo`,
    };
  }

  const { data } = await client.get(`/v1/generations/${requestId}`, {
    headers: { Authorization: `Key ${config.higgsfield.apiKey}` },
  });

  return {
    request_id: requestId,
    status: data.status,
    result_url: data.result_url,
    error: data.error,
  };
}

export const higgsfieldService = { quote, createJob, getStatus };
