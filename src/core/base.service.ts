// core/base.service.ts
// Capa de MODELO / ACCESO A DATOS del núcleo MVC.
//
// BaseService<T> implementa el CRUD genérico sobre cualquier tabla de Supabase.
// Cada módulo crea una instancia con su tabla y su llave primaria:
//
//   export const categoriaService = new BaseService<Categoria>('categorias', 'categoria_id');

import supabase from '../config/supabaseClient';
import { AuditContext, logAudit } from '../services/audit.service';
import { NotFoundError } from './errors';

export interface GetAllOptions {
  /** Columnas a seleccionar, por defecto '*'. */
  columns?: string[];
  /**
   * Relaciones (llaves foráneas) a incrustar en la respuesta, en sintaxis
   * PostgREST: p. ej. `['empresas(*)', 'propiedades(*, empresas(*))']`.
   * Si no se envía, se usan las declaradas en el constructor del servicio.
   */
  joins?: string[];
  /** Filtros exactos (WHERE eq). */
  where?: Record<string, unknown>;
  /** Filtros `IN` (columna → valores permitidos); un arreglo vacío no devuelve filas. */
  whereIn?: Record<string, Array<string | number>>;
  /** Columna de ordenamiento. */
  orderBy?: string;
  ascending?: boolean;
  /** Paginación. */
  limit?: number;
  offset?: number;
}

export class BaseService<T = any> {
  constructor(
    protected readonly table: string,
    protected readonly primaryKey: string = 'id',
    /**
     * Relaciones (llaves foráneas) incrustadas por defecto en cada operación,
     * en sintaxis PostgREST: p. ej. `['empresas(*)', 'tipos_propiedades(*)']`.
     * El objeto incrustado llega con el nombre de la TABLA foránea; el Resource
     * es quien lo renombra a singular (p. ej. `empresas` → `empresa`).
     */
    protected readonly joins: string[] = []
  ) {}

  /** Cláusula SELECT: columnas + relaciones incrustadas. */
  private selectStatement(columns: string[], extraJoins?: string[]): string {
    const relations = extraJoins ?? this.joins;
    return relations.length ? [...columns, ...relations].join(',') : columns.join(',');
  }

  /**
   * Registra la acción en la bitácora `audit_logs` (mejor-esfuerzo: la
   * auditoría jamás rompe la operación de negocio). El contexto lo aporta el
   * controlador desde la sesión (`req.userId`, `req.localUsuarioId`,
   * `req.organizationId`).
   */
  protected async auditar(
    accion: 'CREATE' | 'UPDATE' | 'DELETE',
    registroId: string | number | null | undefined,
    detalles: unknown,
    audit?: AuditContext
  ): Promise<void> {
    // Sin sesión no hay autor registrable: se omite el registro.
    if (!audit?.authUserId) return;
    await logAudit(this.table, accion, registroId, detalles, audit);
  }

  /** Crea un registro a partir de un payload validado (Request). */
  async create<U = T>(payload: Partial<U>, audit?: AuditContext): Promise<U> {
    const { data, error } = await supabase
      .from(this.table)
      .insert([payload])
      .select(this.selectStatement(['*']))
      .single();
    if (error) throw new Error(`Error al crear registro en '${this.table}': ${error.message}`);
    const creado = data as unknown as Record<string, unknown> | null;
    const idCreado = creado?.[this.primaryKey];
    await this.auditar(
      'CREATE',
      typeof idCreado === 'string' || typeof idCreado === 'number' ? idCreado : null,
      { despues: payload },
      audit
    );
    return data as U;
  }

  /** Actualiza un registro por su llave primaria con un payload validado (Request). */
  async update<U = T>(id: string | number, payload: Partial<U>, audit?: AuditContext): Promise<U> {
    const { data, error } = await supabase
      .from(this.table)
      .update(payload as never)
      .eq(this.primaryKey, id)
      .select(this.selectStatement(['*']))
      .maybeSingle();

    if (error) throw new Error(`Error al actualizar registro en '${this.table}': ${error.message}`);
    if (!data) throw new NotFoundError(`Registro de '${this.table}' con id ${id}`);
    await this.auditar('UPDATE', id, { cambios: payload }, audit);
    return data as U;
  }

  /** Elimina un registro por su llave primaria. */
  async remove(id: string | number, audit?: AuditContext): Promise<void> {
    // Se lee la fila ANTES de borrarla para dejar constancia en la bitácora
    // de qué se borró exactamente.
    let antes: unknown = null;
    if (audit?.authUserId) {
      try {
        antes = await supabase
          .from(this.table)
          .select('*')
          .eq(this.primaryKey, id)
          .maybeSingle()
          .then(({ data }) => data);
      } catch {
        antes = null;
      }
    }

    const { data, error } = await supabase
      .from(this.table)
      .delete()
      .eq(this.primaryKey, id)
      .select(this.primaryKey);

    if (error) throw new Error(`Error al eliminar registro de '${this.table}': ${error.message}`);
    if (!data || data.length === 0) {
      throw new NotFoundError(`Registro de '${this.table}' con id ${id}`);
    }
    await this.auditar('DELETE', id, { antes }, audit);
  }

  /** Cuenta registros que cumplan condiciones exactas. */
  async count(conditions: Record<string, unknown> = {}): Promise<number> {
    let query = supabase.from(this.table).select('*', { count: 'exact', head: true });
    Object.keys(conditions).forEach((key) => {
      query = query.eq(key, conditions[key] as never);
    });
    const { count, error } = await query;
    if (error) throw new Error(`Error al contar la tabla '${this.table}': ${error.message}`);
    return count ?? 0;
  }

  /** Obtiene todos los registros (con filtros, columnas, orden y paginación opcionales). */
  async getAll<U = T>(options: GetAllOptions = {}): Promise<U[]> {
    const { columns = ['*'], where = {}, orderBy, ascending = true, limit, offset } = options;

    if (!columns.length) {
      throw new Error('Debes especificar al menos una columna para generar la consulta.');
    }

    let query = supabase.from(this.table).select(this.selectStatement(columns, options.joins));

    Object.keys(where).forEach((key) => {
      query = query.eq(key, where[key] as never);
    });

    for (const [key, values] of Object.entries(options.whereIn ?? {})) {
      query = query.in(key, values as never);
    }

    const orderColumn = orderBy ?? (columns[0] !== '*' ? columns[0] : this.primaryKey);
    query = query.order(orderColumn, { ascending });

    if (limit !== undefined) query = query.range(offset ?? 0, (offset ?? 0) + limit - 1);

    const { data, error } = await query.returns<U[]>();
    if (error) throw new Error(`Error al consultar la tabla '${this.table}': ${error.message}`);
    return data ?? [];
  }

  /** Obtiene un registro por su llave primaria. Lanza NotFoundError si no existe. */
  async getById<U = T>(id: string | number): Promise<U> {
    const { data, error } = await supabase
      .from(this.table)
      .select(this.selectStatement(['*']))
      .eq(this.primaryKey, id)
      .maybeSingle();

    if (error) throw new Error(`Error al consultar la tabla '${this.table}': ${error.message}`);
    if (!data) throw new NotFoundError(`Registro de '${this.table}' con id ${id}`);
    return data as U;
  }

  /** Busca un registro por un conjunto de condiciones. Devuelve null si no existe. */
  async findOne<U = T>(conditions: Record<string, unknown>): Promise<U | null> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .match(conditions as never)
      .maybeSingle();

    if (error) {
      console.error(`Error en findOne para la tabla ${this.table}:`, error);
      throw new Error(`No se pudo encontrar el registro en la tabla ${this.table}.`);
    }
    return (data as U) ?? null;
  }
}
