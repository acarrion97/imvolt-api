// services/strategist.service.ts
// Estratega inmobiliario con IA (documento maestro, §08).
//
// Transforma datos verificados de la propiedad en estrategia publicitaria
// ACCIONABLE y AUDITABLE: campos estructurados, no sólo texto libre.
//
// RESTRICCIÓN (§08 y §07): no inventa atributos. Todo lo que se propone se
// deriva de datos confirmados de la ficha; lo no verificado se omite o se
// marca como "requiere confirmación".

export interface PropiedadEstrategica {
  nombre: string;
  ubicacion: string | null;
  precio: number | null;
  disponibilidad: string | null;
  descripcion: string | null;
}

export interface EstrategaInput {
  propiedad: PropiedadEstrategica;
  objetivo: 'visitas' | 'trafico' | 'mensajes' | 'formularios' | 'branding';
}

export interface VarianteCopy {
  variante: 'A' | 'B';
  enfoque: string;
  titular: string;
  copy_corto: string;
  copy_largo: string;
  cta: string;
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
  variantes_ab: VarianteCopy[];
  cta: string;
  guion_audiovisual: string;
  guion_15s: string;
  guion_30s: string;
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
  const ubicacion = propiedad.ubicacion?.trim() ?? '';
  const descripcion = propiedad.descripcion?.trim() ?? '';

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
    const precio = new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
    }).format(propiedad.precio);
    angulos.push({
      id: 'precio',
      nombre: 'Valor de referencia',
      enfoque: 'Comunicar el precio de la ficha. Si existe financiamiento verificado, añadirlo explícitamente.',
      copy_sugerido: `${propiedad.nombre}: valor registrado ${precio}. Consulta condiciones de compra y disponibilidad vigente.`,
    });
  }

  if (descripcion) {
    angulos.push({
      id: 'descripcion',
      nombre: 'Descripción verificada',
      enfoque: 'Reutilizar textualmente la descripción de la ficha, sin añadir atributos que no estén en ella.',
      copy_sugerido: `${propiedad.nombre}: ${descripcion}`,
    });
  }

  if (propiedad.disponibilidad === 'disponible') {
    angulos.push({
      id: 'disponibilidad',
      nombre: 'Disponibilidad confirmada',
      enfoque: 'Invitar a la visita apoyándose en la disponibilidad vigente de la ficha.',
      copy_sugerido: `${propiedad.nombre}: disponible ahora. Agenda una visita con nuestro asesor.`,
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

  const primerAngulo = angulos[0];
  const segundoAngulo = angulos[1] ?? {
    enfoque: 'Presentar la propiedad e invitar a conversar sin añadir atributos no confirmados.',
    copy_sugerido: `${propiedad.nombre}. Solicita información y conoce los detalles confirmados con un asesor.`,
  };
  const ctaPrincipal = {
    visitas: 'Agenda una visita',
    trafico: 'Conoce el proyecto',
    mensajes: 'Enviar mensaje',
    formularios: 'Solicita información',
    branding: 'Conoce el proyecto',
  }[objetivo];
  const ctaAlternativo = objetivo === 'visitas' ? 'Solicita información' : ctaPrincipal;
  const variantesAb: VarianteCopy[] = [
    {
      variante: 'A',
      enfoque: primerAngulo.enfoque,
      titular: propiedad.nombre,
      copy_corto: primerAngulo.copy_sugerido,
      copy_largo: [
        primerAngulo.copy_sugerido,
        descripcion ? `Descripción confirmada: ${descripcion}` : null,
        'Solicita información con un asesor para conocer disponibilidad y condiciones de compra.',
      ].filter(Boolean).join(' '),
      cta: ctaPrincipal,
    },
    {
      variante: 'B',
      enfoque: segundoAngulo.enfoque,
      titular: ubicacion ? `${propiedad.nombre} en ${ubicacion}` : propiedad.nombre,
      copy_corto: segundoAngulo.copy_sugerido,
      copy_largo: [
        segundoAngulo.copy_sugerido,
        propiedad.disponibilidad === 'disponible' ? 'Confirma la disponibilidad antes de visitar.' : null,
        'Conversa con un asesor para recibir información y condiciones vigentes.',
      ].filter(Boolean).join(' '),
      cta: ctaAlternativo,
    },
  ];

  const advertencias: string[] = [];
  if (descripcion.toLowerCase().includes('render')) {
    advertencias.push(
      'La ficha menciona renders o escenas conceptuales: identifícalos como tales en la publicidad (§07, fidelidad).',
    );
  }
  if (!propiedad.precio) {
    advertencias.push('La ficha no tiene precio confirmado: no publiques valores; usa "consulta disponibilidad y condiciones".');
  }
  if (propiedad.disponibilidad !== 'disponible') {
    advertencias.push(`La disponibilidad de la ficha es "${propiedad.disponibilidad}": no la presentes como disponible.`);
  }
  advertencias.push('La moneda del precio usa el valor por defecto de la aplicación (USD); confirma moneda, precio, disponibilidad y condiciones antes de publicar.');

  return {
    propiedad: propiedad.nombre,
    objetivo,
    angulos,
    titular: `${propiedad.nombre}${ubicacion ? ` · ${ubicacion}` : ''}`,
    copy_corto: primerAngulo.copy_sugerido,
    copy_largo: [
      primerAngulo.copy_sugerido,
      descripcion ? `Descripción confirmada: ${descripcion}` : null,
      'Solicita información con un asesor para conocer disponibilidad y condiciones de compra.',
    ]
      .filter(Boolean)
      .join(' '),
    variantes_ab: variantesAb,
    cta: ctaPrincipal,
    guion_audiovisual: [
      `Plano general de ${propiedad.nombre}${ubicacion ? ` en ${ubicacion}` : ''}, sin modificar geometría ni entorno.`,
      descripcion ? `Recorrido alineado con la descripción de la ficha: ${descripcion}` : 'Recorrido por los espacios visibles de la propiedad.',
      'Cierre con llamado a la acción: solicita información con un asesor.',
      'No añadir textos superpuestos ni escenas no presentes en la fotografía de referencia.',
    ].join(' '),
    guion_15s: [
      `0–3 s: presenta ${propiedad.nombre}${ubicacion ? ` en ${ubicacion}` : ''}.`,
      descripcion ? `3–11 s: muestra únicamente elementos descritos en la ficha: ${descripcion}` : '3–11 s: muestra la propiedad sin atribuir características no verificadas.',
      '11–15 s: invita a solicitar información con un asesor.',
    ].join(' '),
    guion_30s: [
      `0–5 s: abre con ${propiedad.nombre}${ubicacion ? ` · ${ubicacion}` : ''}.`,
      descripcion ? `5–20 s: desarrolla la descripción confirmada: ${descripcion}` : '5–20 s: recorre los espacios visibles sin añadir promesas.',
      propiedad.precio ? `20–25 s: menciona el valor registrado ${new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(propiedad.precio)} y aclara que las condiciones deben confirmarse.` : '20–25 s: invita a consultar precio y condiciones vigentes.',
      '25–30 s: cierra con un llamado a conversar con un asesor.',
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
