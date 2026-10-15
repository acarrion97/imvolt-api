// core/base.resource.ts
// Capa de VISUALIZACIÓN (vista) de la arquitectura MVC.
//
// Un Resource transforma una fila cruda de la BD en la forma exacta que se
// devuelve al cliente. NO depende del modelo principal: recibe cualquier fila
// (incluso de consultas con JOINs) y define su propia forma de salida.

export type ResourceShape<TRow, TView> = (row: TRow) => TView;

export class BaseResource<TRow = any, TView = any> {
  constructor(private readonly shape: ResourceShape<TRow, TView>) {}

  format(row: TRow): TView {
    return this.shape(row);
  }

  formatMany(rows: TRow[]): TView[] {
    return (rows ?? []).map((row) => this.shape(row));
  }
}
