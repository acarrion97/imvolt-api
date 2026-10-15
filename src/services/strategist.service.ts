// services/strategist.service.ts
// Estratega inmobiliario con IA (documento maestro, §08).
//
// Transforma datos verificados de la propiedad en estrategia publicitaria
// ACCIONABLE y AUDITABLE: campos estructurados, no sólo texto libre.
//
// RESTRICCIÓN (§08 y §07): no inventa atributos. Todo lo que se propone se
// deriva de datos confirmados de la ficha; lo no verificado se omite o se
// marca como "requiere confirmación".

import { Propiedad } from '../models/catalog.model';

export interface EstrategaInput {
  propiedad: Propiedad;
  objetivo: 'visitas' | 'mensajes' | 'formularios' | 'branding';
}

export interface AnguloCreativo {
  id: string;
  nombre: string;
  enfoque: string;
  copy_sugerido: string;
}

export interface EstrategaOutput {
  propiedad: string;
  objetivo: string;
  angulos: AnguloCreativo[];
  titular: string;
  copy_corto: string;
  copy_largo: string;
  cta: string;
  guion_audiovisual: string;
  formatos_recomendados: string[];
  checklist_editorial: string[];
  advertencias: string[];
}

const FORMATOS_POR_MEDIO: Record<string, string[]> = {
  video: ['Reels 9:16', 'Feed 1:1'],
  imagen: ['Imagen 4:5', 'Feed 1:1', 'Banner 16:9'],
};

/** Arma la estrategia solo con datos presentes en la ficha. */
export function build({ propiedad, objetivo }: EstrategaInput): EstrategaOutput {
  const ubicacion = [propiedad.ciudad, propiedad.pais].filter(Boolean).join(', ');
  const superficie = propiedad.superficie_m2 ? `${propiedad.superficie_m2} m²` : null;
  const atributos = [
    propiedad.habitaciones ? `${propiedad.habitaciones} habitaciones` : null,
    propiedad.banos ? `${propiedad.banos} baños` : null,
    propiedad.estacionamientos ? `${propiedad.estacionamientos} estacionamientos` : null,
    superficie,
  ].filter((value): value is string => Boolean(value));

  const angulos: AnguloCreativo[] = [];

  if (ubicacion) {
    angulos.push({
      id: 'ubicacion',
      nombre: 'Ubicación confirmada',
      enfoque: 'Vender el entorno y la conectividad del inmueble sin prometer tiempos o servicios no verificados.',
      copy_sugerido: `${propiedad.nombre}, en ${ubicacion}. Conoce el proyecto y solicita información con un asesor.`,
    });
  }

  if (propiedad.precio) {
    const precio = `${propiedad.moneda} ${propiedad.precio.toLocaleString('es-EC')}`;
    angulos.push({
      id: 'precio',
      nombre: 'Valor de referencia',
      enfoque: 'Comunicar el precio de la ficha. Si existe financiamiento verificado, añadirlo explícitamente.',
      copy_sugerido: `${propiedad.nombre}: desde ${precio}. Consulta condiciones de compra y disponibilidad vigente.`,
    });
  }

  if (atributos.length > 0) {
    angulos.push({
      id: 'estilo_vida',
      nombre: 'Atributos del inmueble',
      enfoque: 'Destacar características confirmadas de la ficha como motivo de visita.',
      copy_sugerido: `${propiedad.nombre}: ${atributos.join(' · ')}. Agenda una visita con nuestro equipo.`,
    });
  }

  if (angulos.length === 0) {
    angulos.push({
      id: 'general',
      nombre: 'Descubre el proyecto',
      enfoque: 'Sin atributos verificados en la ficha, invitar a conocer el proyecto sin afirmar características.',
      copy_sugerido: `${propiedad.nombre}. Solicita información, precios y condiciones de compra con un asesor.`,
    });
  }

  const advertencias: string[] = [];
  if (propiedad.tiene_render_conceptual) {
    advertencias.push(
      'La propiedad contiene renders o escenas conceptuales: identifícalos como tales en la publicidad (§07, fidelidad).',
    );
  }
  if (!propiedad.precio) {
    advertencias.push('La ficha no tiene precio confirmado: no publiques valores; usa "consulta disponibilidad y condiciones".');
  }
  advertencias.push('El anunciante debe verificar precio, disponibilidad y condiciones antes de cada publicación.');

  return {
    propiedad: propiedad.nombre,
    objetivo,
    angulos,
    titular: `${propiedad.nombre}${ubicacion ? ` · ${ubicacion}` : ''}`,
    copy_corto: angulos[0].copy_sugerido,
    copy_largo: [
      angulos[0].copy_sugerido,
      atributos.length ? `Características confirmadas: ${atributos.join(', ')}.` : null,
      'Solicita información con un asesor para conocer disponibilidad y condiciones de compra.',
    ]
      .filter(Boolean)
      .join(' '),
    cta: 'Solicita información',
    guion_audiovisual: [
      `Plano general de ${propiedad.nombre}${ubicacion ? ` en ${ubicacion}` : ''}, sin modificar geometría ni entorno.`,
      atributos.length ? `Recorrido por los atributos confirmados: ${atributos.join(', ')}.` : 'Recorrido por los espacios visibles de la propiedad.',
      'Cierre con llamado a la acción: solicita información con un asesor.',
      'No añadir textos superpuestos ni escenas no presentes en la fotografía de referencia.',
    ].join(' '),
    formatos_recomendados: [...FORMATOS_POR_MEDIO.video, ...FORMATOS_POR_MEDIO.imagen],
    checklist_editorial: [
      'Precio y moneda coinciden con la ficha vigente.',
      'Disponibilidad verificada (disponible / reservada / vendida).',
      'Renders o escenas conceptuales identificadas como tales.',
      'Derechos de uso de las fotografías confirmados.',
      'Condiciones de financiamiento solo si están verificadas.',
      'Ninguna promesa de ventas o valorización garantizada.',
    ],
    advertencias,
  };
}

export const strategistService = { build };
