export type GenerationOutputMediaType = 'image' | 'video';

/** Persisted provider output for a generation job. */
export interface GenerationOutput {
  generation_output_id: number;
  generation_id: number;
  output_index: number;
  media_type: GenerationOutputMediaType;
  output_url: string;
  mime_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Public API representation of a persisted generation output. */
export interface GenerationOutputView {
  output_id: string;
  generation_id: string;
  output_index: number;
  media_type: GenerationOutputMediaType;
  url: string;
  mime_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
