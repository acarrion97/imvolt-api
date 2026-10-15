// core/base.service.ts
// Capa de MODELO / ACCESO A DATOS del núcleo MVC.
//
// BaseService<T> implementa el CRUD genérico sobre cualquier tabla de Supabase.
// Cada módulo crea una instancia con su tabla y su llave primaria:
//
//   export const categoriaService = new BaseService<Categoria>('categorias', 'categoria_id');

import supabase from '../config/supabaseClient';
import { NotFoundError } from './errors';

export interface GetAllOptions {
  /** Columnas a seleccionar, por defecto '*'. */
  columns?: string[];
  /** Filtros exactos (WHERE eq). */
  where?: Record<string, unknown>;
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
    protected readonly primaryKey: string = 'id'
  ) {}

  /** Registra una acción en la tabla de auditoría `audit_logs`. */
  async logAudit(action: string, userId: string, details: unknown): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert([
      {
        action,
        table_name: this.table,
        user_id: userId,
        details,
        timestamp: new Date().toISOString(),
      },
    ]);
    if (error) console.error('Error al registrar auditoría:', error.message);
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

    let query = supabase.from(this.table).select(columns.join(','));

    Object.keys(where).forEach((key) => {
      query = query.eq(key, where[key] as never);
    });

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
      .select('*')
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

  /** Crea un registro a partir de un payload validado (Request). */
  async create<U = T>(payload: Partial<U>, userId?: string): Promise<U> {
    const { data, error } = await supabase.from(this.table).insert([payload]).select().single();
    if (error) throw new Error(`Error al crear registro en '${this.table}': ${error.message}`);
    if (userId) await this.logAudit('CREATE', userId, { entity: payload });
    return data as U;
  }

  /** Actualiza un registro por su llave primaria con un payload validado (Request). */
  async update<U = T>(id: string | number, payload: Partial<U>, userId?: string): Promise<U> {
    const { data, error } = await supabase
      .from(this.table)
      .update(payload as never)
      .eq(this.primaryKey, id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Error al actualizar registro en '${this.table}': ${error.message}`);
    if (!data) throw new NotFoundError(`Registro de '${this.table}' con id ${id}`);
    if (userId) await this.logAudit('UPDATE', userId, { id, entity: payload });
    return data as U;
  }

  /** Elimina un registro por su llave primaria. */
  async remove(id: string | number, userId?: string): Promise<void> {
    const { data, error } = await supabase
      .from(this.table)
      .delete()
      .eq(this.primaryKey, id)
      .select(this.primaryKey);

    if (error) throw new Error(`Error al eliminar registro de '${this.table}': ${error.message}`);
    if (!data || data.length === 0) {
      throw new NotFoundError(`Registro de '${this.table}' con id ${id}`);
    }
    if (userId) await this.logAudit('DELETE', userId, { id });
  }
}
