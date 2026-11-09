import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { BaseService, auditContext, createCrudRouter, errorResponse, NotFoundError, ValidationError } from '../core';
import supabase from '../config/supabaseClient';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByPlatformAdmin } from '../middlewares/requireRole';
import { ConfiguracionSistema } from '../models/platform-admin/configuracion-sistema.model';
import { Plan } from '../models/platform-admin/plan.model';
import { configuracionSistemaRequest, planRequest } from '../requests/platform-admin.request';
import { ConfiguracionIntegracionService } from '../services/configuracion-integracion.service';

const planService = new BaseService<Plan>('planes', 'plan_id');
const configuracionService = new BaseService<ConfiguracionSistema>(
  'configuraciones_sistema',
  'configuracion_sistema_id',
);
const empresaService = new BaseService('empresas', 'empresa_id');
const configuracionIntegracionService = new ConfiguracionIntegracionService();
const empresaIntegracionService = new BaseService('empresas_integraciones', 'empresa_integracion_id');
const higgsfieldInputSchema = Joi.object({
  entorno: Joi.string().valid('sandbox', 'produccion').required(),
  api_key: Joi.string().trim().max(200).allow(''),
  app_secret: Joi.string().trim().max(200).allow(''),
}).unknown(false);

const planesRouter = createCrudRouter<Plan>({
  table: 'planes',
  primaryKey: 'plan_id',
  request: planRequest,
  entityName: 'Plan',
  service: planService,
  disabled: ['remove'],
  defaultGetAllOptions: { orderBy: 'precio_mensual', ascending: true },
}).router;

const configuracionesRouter = createCrudRouter<ConfiguracionSistema>({
  table: 'configuraciones_sistema',
  primaryKey: 'configuracion_sistema_id',
  request: configuracionSistemaRequest,
  entityName: 'Configuración del sistema',
  service: configuracionService,
  disabled: ['remove'],
  defaultGetAllOptions: { orderBy: 'clave', ascending: true },
}).router;

const companyUpdateSchema = Joi.object({
  estado: Joi.string().valid('activo', 'inactivo'),
  plan_id: Joi.number().integer().positive().allow(null),
}).min(1);

export const platformAdminRouter = Router();

// Todas las rutas de este router son globales y requieren un superadministrador.
platformAdminRouter.use(...requireOrg, writeByPlatformAdmin);
platformAdminRouter.use('/planes', planesRouter);
platformAdminRouter.use('/configuraciones', configuracionesRouter);

platformAdminRouter.get('/empresas/resumen', async (_req: Request, res: Response) => {
  try {
    const [totalQuery, activasQuery] = await Promise.all([
      supabase.from('empresas').select('empresa_id', { count: 'exact', head: true }),
      supabase
        .from('empresas')
        .select('empresa_id', { count: 'exact', head: true })
        .eq('estado', 'activo'),
    ]);
    if (totalQuery.error) throw new Error(totalQuery.error.message);
    if (activasQuery.error) throw new Error(activasQuery.error.message);
    res.json({ total: totalQuery.count ?? 0, activas: activasQuery.count ?? 0 });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
});

platformAdminRouter.get('/empresas', async (req: Request, res: Response) => {
  try {
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 20));
    const desde = (pagina - 1) * limite;
    const busqueda = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const estado = req.query.estado;

    let query = supabase
      .from('empresas')
      .select(
        'empresa_id, razon_social, ruc, estado, plan_id, creado_en, actualizado_en, planes(nombre, precio_mensual), usuarios(usuario_id)',
        { count: 'exact' },
      )
      .order('creado_en', { ascending: false })
      .range(desde, desde + limite - 1);

    if (busqueda) query = query.ilike('razon_social', `%${busqueda}%`);
    if (estado === 'activo' || estado === 'inactivo') query = query.eq('estado', estado);

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    const items = (data ?? []).map((row) => {
      const { planes, usuarios, ...empresa } = row as unknown as {
        empresa_id: number;
        razon_social: string;
        ruc: string | null;
        estado: 'activo' | 'inactivo';
        plan_id: number | null;
        creado_en: string;
        actualizado_en: string;
        planes: { nombre: string; precio_mensual: number } | null;
        usuarios: Array<{ usuario_id: number }>;
      };
      return {
        ...empresa,
        plan: planes,
        cantidad_usuarios: usuarios?.length ?? 0,
      };
    });

    res.json({ items, total: count ?? 0 });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
});

platformAdminRouter.patch('/empresas/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      throw new ValidationError('Identificador de empresa inválido');
    }

    const { error: validationError, value } = companyUpdateSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (validationError) {
      throw new ValidationError(
        'Datos de entrada inválidos',
        validationError.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      );
    }

    if (value.plan_id != null) {
      const plan = await planService.getById<Plan>(value.plan_id);
      const empresaActual = await empresaService.getById<{ plan_id: number | null }>(id);
      if (plan.estado !== 'activo' && Number(empresaActual.plan_id) !== Number(value.plan_id)) {
        throw new ValidationError('No se puede asignar un plan inactivo', [
          { field: 'plan_id', message: 'Selecciona un plan activo.' },
        ]);
      }
    }

    const empresa = await empresaService.update(
      id,
      value,
      { ...auditContext(req), empresaId: id },
    );
    res.json(empresa);
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
});

platformAdminRouter.get('/empresas/:id/higgsfield', async (req: Request, res: Response) => {
  try {
    const empresaId = Number(req.params.id);
    if (!Number.isInteger(empresaId) || empresaId < 1) {
      throw new ValidationError('Identificador de empresa inválido');
    }

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('empresa_id')
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (empresaError) throw new Error(empresaError.message);
    if (!empresa) throw new NotFoundError(`Empresa con id ${empresaId}`);

    const { data: integracion, error: integracionError } = await supabase
      .from('integraciones')
      .select('integracion_id')
      .eq('nombre', 'Higgsfield')
      .maybeSingle();
    if (integracionError) throw new Error(integracionError.message);
    if (!integracion) throw new NotFoundError('Integración Higgsfield');

    const { data: relacion, error: relacionError } = await supabase
      .from('empresas_integraciones')
      .select('empresa_integracion_id, estado, configuracion_integracion_id')
      .eq('empresa_id', empresaId)
      .eq('integracion_id', integracion.integracion_id)
      .maybeSingle();
    if (relacionError) throw new Error(relacionError.message);

    const { data: configuracion, error: configuracionError } = relacion
      ? await supabase
          .from('configuraciones_integraciones')
          .select('configuracion_integracion_id, entorno, api_key, app_secret')
          .eq('configuracion_integracion_id', relacion.configuracion_integracion_id)
          .maybeSingle()
      : { data: null, error: null };
    if (configuracionError) throw new Error(configuracionError.message);
    res.json({
      configurado: Boolean(relacion && configuracion && relacion.estado === 'activo'),
      entorno: configuracion?.entorno === 'produccion' ? 'produccion' : 'sandbox',
      api_key_configurada: Boolean(configuracion?.api_key),
      app_secret_configurado: Boolean(configuracion?.app_secret),
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
});

platformAdminRouter.put('/empresas/:id/higgsfield', async (req: Request, res: Response) => {
  try {
    const empresaId = Number(req.params.id);
    if (!Number.isInteger(empresaId) || empresaId < 1) {
      throw new ValidationError('Identificador de empresa inválido');
    }

    const { error: validationError, value } = higgsfieldInputSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: false,
    });
    if (validationError) {
      throw new ValidationError(
        'Datos de entrada inválidos',
        validationError.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      );
    }

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('empresa_id')
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (empresaError) throw new Error(empresaError.message);
    if (!empresa) throw new NotFoundError(`Empresa con id ${empresaId}`);

    const { data: integracion, error: integracionError } = await supabase
      .from('integraciones')
      .select('integracion_id')
      .eq('nombre', 'Higgsfield')
      .maybeSingle();
    if (integracionError) throw new Error(integracionError.message);
    if (!integracion) throw new NotFoundError('Integración Higgsfield');

    const { data: relacion, error: relacionError } = await supabase
      .from('empresas_integraciones')
      .select('empresa_integracion_id, estado, configuracion_integracion_id')
      .eq('empresa_id', empresaId)
      .eq('integracion_id', integracion.integracion_id)
      .maybeSingle();
    if (relacionError) throw new Error(relacionError.message);

    const { data: configuracionExistente, error: configuracionError } = relacion
      ? await supabase
          .from('configuraciones_integraciones')
          .select('configuracion_integracion_id, empresa_id, api_key, app_secret')
          .eq('configuracion_integracion_id', relacion.configuracion_integracion_id)
          .maybeSingle()
      : { data: null, error: null };
    if (configuracionError) throw new Error(configuracionError.message);
    if (
      configuracionExistente?.empresa_id != null &&
      Number(configuracionExistente.empresa_id) !== empresaId
    ) {
      throw new ValidationError('La configuración de Higgsfield no pertenece a esta empresa.');
    }
    const apiKey = value.api_key || configuracionExistente?.api_key;
    const appSecret = value.app_secret || configuracionExistente?.app_secret;
    if (!apiKey || !appSecret) {
      throw new ValidationError('Completa ambas credenciales de Higgsfield para esta empresa.', [
        { field: !apiKey ? 'api_key' : 'app_secret', message: 'Este campo es obligatorio.' },
      ]);
    }

    const audit = { ...auditContext(req), empresaId };
    const payload = {
      url_base: 'https://api.higgsfield.ai',
      entorno: value.entorno as 'sandbox' | 'produccion',
      ...(value.api_key ? { api_key: value.api_key } : {}),
      ...(value.app_secret ? { app_secret: value.app_secret } : {}),
      ...(configuracionExistente ? {} : { api_key: apiKey, app_secret: appSecret }),
    };

    let configuracionId = configuracionExistente?.configuracion_integracion_id;
    if (configuracionId) {
      await configuracionIntegracionService.update(configuracionId, payload, audit);
    } else {
      const nuevaConfiguracion = await configuracionIntegracionService.create<{
        configuracion_integracion_id: number;
        empresa_id: number;
        url_base: string;
        entorno: 'sandbox' | 'produccion';
        api_key: string;
        app_secret: string;
      }>({ ...payload, empresa_id: empresaId }, audit);
      configuracionId = nuevaConfiguracion.configuracion_integracion_id;
    }

    if (relacion) {
      await empresaIntegracionService.update(
        relacion.empresa_integracion_id,
        {
          configuracion_integracion_id: configuracionId,
          referencia_credencial: 'Higgsfield',
          estado: 'activo',
        },
        audit,
      );
    } else {
      try {
        await empresaIntegracionService.create(
          {
            empresa_id: empresaId,
            integracion_id: integracion.integracion_id,
            configuracion_integracion_id: configuracionId,
            referencia_credencial: 'Higgsfield',
            estado: 'activo',
          },
          audit,
        );
      } catch (error) {
        try {
          await configuracionIntegracionService.remove(configuracionId);
        } catch (cleanupError) {
          throw new Error(
            `${error instanceof Error ? error.message : 'No se pudo vincular Higgsfield.'} ` +
              `También falló la limpieza de la configuración nueva: ${
                cleanupError instanceof Error ? cleanupError.message : 'error desconocido'
              }`,
          );
        }
        throw error;
      }
    }

    res.json({
      configurado: true,
      entorno: value.entorno,
      api_key_configurada: true,
      app_secret_configurado: true,
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
});
