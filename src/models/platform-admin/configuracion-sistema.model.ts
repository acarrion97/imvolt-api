import { BaseModel } from '../../core';

export type ConfiguracionSistemaTipo = 'texto' | 'numero' | 'booleano';

export interface ConfiguracionSistema extends BaseModel<ConfiguracionSistema> {
  configuracion_sistema_id: number;
  clave: string;
  valor: string;
  tipo: ConfiguracionSistemaTipo;
  descripcion: string;
}
