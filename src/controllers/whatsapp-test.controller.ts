// controllers/whatsapp-test.controller.ts
// Servicio de PRUEBA de WhatsApp Cloud API + generación de anuncios con
// OpenRouter. Pensado para validar el flujo completo:
//
//   propiedad → copy del anuncio → imagen IA → plantilla → imagen por WhatsApp
//
// Todas las rutas viven bajo /api/v1/whatsapp/test, requieren sesión de empresa
// y rol propietario/administrador/marketing. Se pueden desactivar por completo
// con WHATSAPP_TEST_ENABLED=false.

import { RequestHandler, Response, Router } from 'express';
import supabase from '../config/supabaseClient';
import { config } from '../config/global';
import { errorResponse, HttpError, NotFoundError, ValidationError } from '../core/errors';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByMarketing } from '../middlewares/requireRole';
import {
  assertWhatsAppTestEnabled,
  enviarImagen,
  enviarPlantilla,
  enviarTexto,
  estadoWhatsApp,
  normalizarDestino,
  subirMedia,
} from '../services/whatsapp.service';
import {
  generarImagenConOpenRouter,
  OpenRouterImageResult,
} from '../services/openrouter-image.service';
import { urlFirmada } from '../services/media.storage';

interface PropiedadAnuncio {
  nombre: string;
  ubicacion: string | null;
  precio: number | null;
  disponibilidad: string | null;
  descripcion: string | null;
}

function responderError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }
  const { status, body } = errorResponse(error);
  res.status(status).json(body);
}

function texto(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new ValidationError(`El campo "${field}" no es válido.`);
  }
  return value.trim();
}

function booleano(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

async function propiedadDeEmpresa(
  propiedadId: number,
  empresaId: string,
): Promise<PropiedadAnuncio> {
  const { data, error } = await supabase
    .from('propiedades')
    .select('nombre, ubicacion, precio, disponibilidad, descripcion, estado')
    .eq('propiedad_id', propiedadId)
    .eq('empresa_id', Number(empresaId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError('Propiedad');
  if (data.estado === 'inactivo') {
    throw new ValidationError('La propiedad está inactiva; actívala antes de generar el anuncio.');
  }
  return {
    nombre: String(data.nombre ?? '').trim(),
    ubicacion: data.ubicacion == null ? null : String(data.ubicacion).trim(),
    precio:
      data.precio == null || !Number.isFinite(Number(data.precio))
        ? null
        : Number(data.precio),
    disponibilidad: data.disponibilidad == null ? null : String(data.disponibilidad),
    descripcion: data.descripcion == null ? null : String(data.descripcion).trim(),
  };
}

function precioLegible(precio: number | null): string | null {
  if (precio === null) return null;
  return `USD ${precio.toLocaleString('es-EC', { maximumFractionDigits: 2 })}`;
}

function construirPrompt(propiedad: PropiedadAnuncio | null, extra?: string): string {
  if (!propiedad) {
    const demo =
      extra?.trim() ||
      'Anuncio inmobiliario de demostración: apartamento moderno con luz natural, sala luminosa, cocina integrada y vista urbana.';
    return [
      demo,
      'Fotografía publicitaria inmobiliaria fotorrealista, composición profesional, luz natural cálida, alta calidad.',
      'Sin texto, sin logotipos, sin marcas de agua, sin personas identificables.',
      'No agregues amenidades ni características que no se hayan indicado.',
    ].join(' ');
  }

  const datos = [
    `Propiedad: ${propiedad.nombre}`,
    propiedad.ubicacion ? `Ubicación: ${propiedad.ubicacion}` : null,
    propiedad.precio !== null ? `Precio: ${precioLegible(propiedad.precio)}` : null,
    propiedad.disponibilidad ? `Disponibilidad: ${propiedad.disponibilidad}` : null,
    propiedad.descripcion ? `Descripción: ${propiedad.descripcion}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  const indicacion = extra?.trim() || 'Creativo publicitario inmobiliario fotorrealista y aspiracional.';
  return [
    indicacion,
    datos,
    'Usa EXCLUSIVAMENTE los datos confirmados anteriores. No inventes ubicación, precio, áreas, amenidades, financiamiento ni disponibilidad.',
    'Fotografía arquitectónica profesional, luz natural, composición limpia, alta calidad.',
    'Sin texto, sin logotipos, sin marcas de agua, sin personas identificables.',
  ].join(' ');
}

function construirCaption(propiedad: PropiedadAnuncio | null, extra?: string): string {
  if (extra?.trim()) return extra.trim().slice(0, 1024);

  if (!propiedad) {
    return [
      '🏡 [DEMO] Anuncio inmobiliario IMVOLT',
      'Descubre este espacio diseñado para disfrutar cada día.',
      'Escríbenos por WhatsApp para agendar una visita.',
      '#IMVOLT #Inmobiliaria',
    ].join('\n');
  }

  const lineas = [`🏡 ${propiedad.nombre}`];
  if (propiedad.ubicacion) lineas.push(`📍 ${propiedad.ubicacion}`);
  if (propiedad.precio !== null) lineas.push(`💵 ${precioLegible(propiedad.precio)}`);
  if (propiedad.disponibilidad) lineas.push(`✅ Disponibilidad: ${propiedad.disponibilidad}`);
  if (propiedad.descripcion) lineas.push(propiedad.descripcion);
  lineas.push('Escríbenos por WhatsApp para agendar una visita.');
  return lineas.join('\n').slice(0, 1024);
}

function resumenImagen(result: OpenRouterImageResult) {
  return {
    model: result.model,
    simulated: result.simulated,
    mime: result.mime,
    bytes: result.image.length,
    duration_ms: result.durationMs,
    estimated_cost_usd: result.estimatedCostUsd,
    warning: result.warning ?? null,
  };
}

// ── GET /status ─────────────────────────────────────────────────────────────
const estado: RequestHandler = (req, res) => {
  res.json({
    whatsapp: estadoWhatsApp(),
    openrouter_image: {
      configured: Boolean(config.openRouterImage.apiKey),
      model: config.openRouterImage.model,
      simulate: config.openRouterImage.simulate,
      fallback: config.openRouterImage.fallback,
      timeout_ms: config.openRouterImage.timeoutMs,
    },
  });
};

// ── POST /template ──────────────────────────────────────────────────────────
const enviarPlantillaPrueba: RequestHandler = async (req, res) => {
  try {
    assertWhatsAppTestEnabled();
    const body = req.body ?? {};
    const result = await enviarPlantilla({
      to: texto(body.to, 'to', 30),
      name: texto(body.template, 'template', 512),
      language: texto(body.language, 'language', 20),
      components: Array.isArray(body.components) ? body.components : undefined,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    responderError(res, error);
  }
};

// ── POST /text ──────────────────────────────────────────────────────────────
const enviarTextoPrueba: RequestHandler = async (req, res) => {
  try {
    assertWhatsAppTestEnabled();
    const body = req.body ?? {};
    const message = texto(body.message ?? body.body, 'message', 4096);
    if (!message) throw new ValidationError('Escribe el mensaje de texto a enviar.');
    const result = await enviarTexto({ to: texto(body.to, 'to', 30), body: message });
    res.json({ ok: true, ...result });
  } catch (error) {
    responderError(res, error);
  }
};

// ── POST /image ─────────────────────────────────────────────────────────────
const enviarImagenPrueba: RequestHandler = async (req, res) => {
  try {
    assertWhatsAppTestEnabled();
    const body = req.body ?? {};
    const to = texto(body.to, 'to', 30);
    const caption = texto(body.caption, 'caption', 1024);
    const imageUrl = texto(body.image_url, 'image_url', 2000);
    const prompt = texto(body.prompt, 'prompt', 4000);
    const generationIdRaw = body.generation_id;

    let link = imageUrl;
    let mediaId: string | undefined;
    let generacion: OpenRouterImageResult | null = null;

    if (generationIdRaw !== undefined && generationIdRaw !== null && generationIdRaw !== '') {
      const generationId = Number(generationIdRaw);
      if (!Number.isSafeInteger(generationId) || generationId <= 0) {
        throw new ValidationError('El campo "generation_id" no es válido.');
      }
      const { data: generation, error: generationError } = await supabase
        .from('generaciones')
        .select('generacion_id, empresa_id')
        .eq('generacion_id', generationId)
        .maybeSingle();
      if (generationError) throw new Error(generationError.message);
      if (!generation || String(generation.empresa_id) !== req.organizationId) {
        throw new NotFoundError('Generación');
      }
      const { data: output, error: outputError } = await supabase
        .from('generation_outputs')
        .select('output_url, media_type, metadata')
        .eq('generation_id', generationId)
        .order('output_index', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (outputError) throw new Error(outputError.message);
      if (!output) throw new NotFoundError('Resultado de la generación');
      if (output.media_type !== 'image') {
        throw new ValidationError('La generación seleccionada no es una imagen.');
      }
      const storagePath = (output.metadata as { storage_path?: unknown } | null)?.storage_path;
      link =
        typeof storagePath === 'string' && storagePath
          ? await urlFirmada(storagePath, 600)
          : String(output.output_url);
    } else if (body.image_base64) {
      if (typeof body.image_base64 !== 'string') {
        throw new ValidationError('El campo "image_base64" no es válido.');
      }
      const match = /^data:(image\/(?:png|jpeg));base64,([\s\S]+)$/i.exec(
        body.image_base64.trim(),
      );
      const mime = match ? match[1].toLowerCase() : 'image/png';
      const raw = match ? match[2] : body.image_base64;
      const buffer = Buffer.from(raw.replace(/\s+/g, ''), 'base64');
      mediaId = await subirMedia({ buffer, mime, filename: 'anuncio.png' });
    } else {
      generacion = await generarImagenConOpenRouter({
        prompt:
          prompt ||
          'Creativo publicitario inmobiliario de demostración, fotografía arquitectónica profesional, sin texto.',
        aspectRatio: texto(body.aspect_ratio, 'aspect_ratio', 10) || '1:1',
      });
      mediaId = await subirMedia({
        buffer: generacion.image,
        mime: generacion.mime,
        filename: generacion.mime === 'image/jpeg' ? 'anuncio.jpg' : 'anuncio.png',
      });
    }

    if (!link && !mediaId) {
      throw new ValidationError('Indica image_url, generation_id, image_base64 o un prompt.');
    }

    const result = await enviarImagen({ to, mediaId, link, caption });
    res.json({
      ok: true,
      ...result,
      ...(generacion ? { image_generation: resumenImagen(generacion) } : {}),
    });
  } catch (error) {
    responderError(res, error);
  }
};

// ── POST /anuncio ───────────────────────────────────────────────────────────
const enviarAnuncioPrueba: RequestHandler = async (req, res) => {
  let plantillaEnviada = false;
  try {
    assertWhatsAppTestEnabled();
    const body = req.body ?? {};
    const to = normalizarDestino(texto(body.to, 'to', 30));

    let propiedad: PropiedadAnuncio | null = null;
    if (body.propiedad_id !== undefined && body.propiedad_id !== null && body.propiedad_id !== '') {
      const propiedadId = Number(body.propiedad_id);
      if (!Number.isSafeInteger(propiedadId) || propiedadId <= 0) {
        throw new ValidationError('El campo "propiedad_id" no es válido.');
      }
      propiedad = await propiedadDeEmpresa(propiedadId, req.organizationId as string);
    }

    const promptExtra = texto(body.prompt, 'prompt', 4000);
    const caption = construirCaption(propiedad, texto(body.caption, 'caption', 1024));
    const prompt = construirPrompt(propiedad, promptExtra);
    const imageUrl = texto(body.image_url, 'image_url', 2000);
    const generar = booleano(body.generar_imagen, true);
    const enviarPlantillaPrimero = booleano(body.enviar_plantilla, false);
    const conCopy = booleano(body.enviar_texto, false);

    let plantilla: Awaited<ReturnType<typeof enviarPlantilla>> | null = null;
    if (enviarPlantillaPrimero) {
      plantilla = await enviarPlantilla({
        to,
        name: texto(body.template, 'template', 512),
        language: texto(body.language, 'language', 20),
      });
      plantillaEnviada = true;
    }

    if (conCopy) {
      await enviarTexto({ to, body: caption });
    }

    let generacion: OpenRouterImageResult | null = null;
    let mediaId: string | undefined;
    if (!imageUrl && generar) {
      generacion = await generarImagenConOpenRouter({
        prompt,
        aspectRatio: texto(body.aspect_ratio, 'aspect_ratio', 10) || '1:1',
      });
      mediaId = await subirMedia({
        buffer: generacion.image,
        mime: generacion.mime,
        filename: generacion.mime === 'image/jpeg' ? 'anuncio.jpg' : 'anuncio.png',
      });
    }

    const imagen = await enviarImagen({
      to,
      mediaId,
      link: imageUrl,
      caption,
    });

    res.json({
      ok: true,
      destination: to,
      propiedad: propiedad
        ? {
            nombre: propiedad.nombre,
            ubicacion: propiedad.ubicacion,
            precio: propiedad.precio,
            disponibilidad: propiedad.disponibilidad,
          }
        : null,
      template: plantilla ? { sent: true, response: plantilla } : { sent: false },
      image: {
        sent: true,
        ...(generacion ? resumenImagen(generacion) : { model: null, simulated: false }),
        media_id: mediaId ?? null,
        link: imageUrl ?? null,
      },
      copy: caption,
      whatsapp: imagen,
    });
  } catch (error) {
    if (plantillaEnviada) {
      console.warn(
        JSON.stringify({
          event: 'whatsapp_test_ad',
          status: 'partial',
          template_sent: true,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
    responderError(res, error);
  }
};

export const whatsappTestRouter = Router();

whatsappTestRouter.get('/status', ...requireOrg, estado);
whatsappTestRouter.post('/template', ...requireOrg, writeByMarketing, enviarPlantillaPrueba);
whatsappTestRouter.post('/text', ...requireOrg, writeByMarketing, enviarTextoPrueba);
whatsappTestRouter.post('/image', ...requireOrg, writeByMarketing, enviarImagenPrueba);
whatsappTestRouter.post('/anuncio', ...requireOrg, writeByMarketing, enviarAnuncioPrueba);
