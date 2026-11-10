import type { EstrategaInput, EstrategaOutput } from './strategist.service';

const GENERATOR_VERSION = 'openrouter-gpt-4o-v1';
const MAX_INPUT_CHARS = 8000;
const MAX_OUTPUT_CHARS = 20000;
const MAX_LIST_ITEMS = 12;
const MAX_TEXT_CHARS = 2000;

function boundedText(value: unknown, field: string, max = MAX_TEXT_CHARS): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new Error(`OPENROUTER_INVALID_${field}`);
  }
  return value.trim();
}

function boundedList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) throw new Error(`OPENROUTER_INVALID_${field}`);
  return value.map((item) => boundedText(item, field, 500));
}

function validateOutput(value: Partial<EstrategaOutput>): Partial<EstrategaOutput> {
  if (!Array.isArray(value.angulos) || value.angulos.length < 1 || value.angulos.length > MAX_LIST_ITEMS ||
      !Array.isArray(value.variantes_ab) || value.variantes_ab.length !== 2) {
    throw new Error('OPENROUTER_INVALID_RESPONSE');
  }
  const angulos = value.angulos.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('OPENROUTER_INVALID_RESPONSE');
    return {
      id: boundedText(item.id, 'RESPONSE', 80),
      nombre: boundedText(item.nombre, 'RESPONSE', 120),
      enfoque: boundedText(item.enfoque, 'RESPONSE'),
      copy_sugerido: boundedText(item.copy_sugerido, 'RESPONSE'),
    };
  });
  const variantes_ab = value.variantes_ab.map((item, index) => {
    if (!item || item.variante !== (index === 0 ? 'A' : 'B')) throw new Error('OPENROUTER_INVALID_RESPONSE');
    return {
      variante: item.variante,
      enfoque: boundedText(item.enfoque, 'RESPONSE'),
      titular: boundedText(item.titular, 'RESPONSE', 300),
      copy_corto: boundedText(item.copy_corto, 'RESPONSE'),
      copy_largo: boundedText(item.copy_largo, 'RESPONSE'),
      cta: boundedText(item.cta, 'RESPONSE', 120),
    };
  });
  return {
    angulos, variantes_ab,
    titular: boundedText(value.titular, 'RESPONSE', 300),
    copy_corto: boundedText(value.copy_corto, 'RESPONSE'),
    copy_largo: boundedText(value.copy_largo, 'RESPONSE'),
    cta: boundedText(value.cta, 'RESPONSE', 120),
    guion_audiovisual: boundedText(value.guion_audiovisual, 'RESPONSE'),
    guion_15s: boundedText(value.guion_15s, 'RESPONSE'),
    guion_30s: boundedText(value.guion_30s, 'RESPONSE'),
    formatos_recomendados: boundedList(value.formatos_recomendados, 'RESPONSE'),
    checklist_editorial: boundedList(value.checklist_editorial, 'RESPONSE'),
    advertencias: boundedList(value.advertencias, 'RESPONSE'),
  };
}

function extractJson(content: string): Partial<EstrategaOutput> {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value: unknown = JSON.parse(cleaned);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid model response');
  return value as Partial<EstrategaOutput>;
}

export interface OpenRouterStrategyResult {
  strategy: Partial<EstrategaOutput>;
  provider: string;
  model: string;
  durationMs: number;
  estimatedCostUsd: number | null;
}

export async function generarEstrategiaConOpenRouter(input: EstrategaInput, presupuesto: number, publico: string): Promise<OpenRouterStrategyResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_UNAVAILABLE');
  const model = process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free';
  const timeoutMs = Math.min(60000, Math.max(1000, Number(process.env.OPENROUTER_TIMEOUT_MS) || 20000));
  const inputJson = JSON.stringify({ objetivo: input.objetivo, presupuesto_diario_usd: presupuesto, publico_objetivo: publico, propiedad_confirmada: input.propiedad, campos_ausentes: Object.entries(input.propiedad).filter(([, value]) => value === null || value === '').map(([key]) => key) });
  if (inputJson.length > MAX_INPUT_CHARS) throw new Error('OPENROUTER_INPUT_TOO_LARGE');
  const startedAt = Date.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.PUBLIC_API_URL || 'https://imvolt.app',
      'X-Title': 'Imvolt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'Eres estratega de marketing inmobiliario. Usa exclusivamente datos confirmados entregados en el contexto. Nunca inventes características, precios, ubicación, disponibilidad, amenidades, financiamiento ni resultados. Identifica datos faltantes y agrega advertencias. El público y presupuesto son criterios de campaña, no hechos de la propiedad. Devuelve solo JSON válido con claves angulos (array de {id,nombre,enfoque,copy_sugerido}), variantes_ab (array de {variante,enfoque,titular,copy_corto,copy_largo,cta}), titular, copy_corto, copy_largo, cta, guion_audiovisual, guion_15s, guion_30s, formatos_recomendados (array), checklist_editorial (array), advertencias (array).' },
        { role: 'user', content: inputJson },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error('OPENROUTER_PROVIDER_ERROR');
  const payload: unknown = await response.json();
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length > MAX_OUTPUT_CHARS) throw new Error('OPENROUTER_INVALID_RESPONSE');
  const strategy = validateOutput(extractJson(content));
  const usage = (payload as { usage?: { cost?: unknown } })?.usage;
  const cost = typeof usage?.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : null;
  return { strategy, provider: 'openrouter', model, durationMs: Date.now() - startedAt, estimatedCostUsd: cost };
}

export { GENERATOR_VERSION };
