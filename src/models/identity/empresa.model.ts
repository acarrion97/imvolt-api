import { BaseModel } from "../../core";

export interface Empresa extends BaseModel<Empresa> {
  empresa_id: number;
  razon_social: string;
  /** RUC (13 dígitos); puede quedar pendiente al registrar la cuenta. */
  ruc: string | null;
}