// models/creative.model.ts
// Tipos compartidos del módulo creativo (estudio IA / Higgsfield).

/** Tipo de medio que genera el proveedor de IA. */
export type MediaType = 'image' | 'video';

/** Formato de salida soportado por el estudio. */
export type MediaFormat = '16:9' | '9:16' | '1:1' | '4:5';

/** Estados de un job creativo encolado hacia el proveedor. */
export type GenerationStatus = 'created' | 'credits_reserved' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
