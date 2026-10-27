# Migraciones de base de datos

El esquema de la API vive en archivos SQL planos numerados secuencialmente
dentro de `migrations/`. La convención imita el nombre de las migraciones de
Laravel (secuencia + acción + tabla), pero **solo en el nombre**: no hay
framework de migraciones, ni tabla de control, ni artefactos PHP. Son archivos
`.sql` que se ejecutan a mano, en orden, en el editor de SQL de Supabase.

## Convención de nombres

```
0001_create_empresas.sql
0013_create_propiedades.sql
0026_add_medios_autorizados_to_propiedades.sql
0030_seed_rbac.sql
```

- Secuencia de 4 dígitos con ceros a la izquierda (`0001`, `0002`, ...).
- Acción: `create`, `add`, `enable`, `seed`.
- `tabla` o `tabla_columna` en snake_case.
- Un archivo por tabla al crearla; los cambios incrementales van en su propio
  archivo (por ejemplo `0026_add_medios_autorizados_to_propiedades.sql`).

## Orden

Se ejecutan en orden numérico ascendente. El orden respeta las dependencias:
las tablas padre siempre aparecen antes que las hijas.

| Bloque | Archivos |
| --- | --- |
| Identidad / RBAC | 0001 – 0011 |
| Propiedades | 0012 – 0013 |
| Contenido creativo | 0014 – 0018 |
| Publicidad | 0019 – 0020 |
| Leads | 0021 |
| Brand Kit | 0022 – 0024 |
| Auditoría | 0025 |
| Cambios incrementales | 0026 – 0029, 0036 |
| Semillas | 0030 – 0035 |

## Idempotencia

Cada migración debe poder ejecutarse más de una vez sobre la misma base de
datos sin romper nada. Para eso se usan:

- `create table if not exists`
- `create index if not exists`
- `add column if not exists`
- `insert ... on conflict do nothing`
- `alter table ... add constraint` solo cuando la restricción no existe aún

Esto permite ejecutar el set completo sobre una base de datos que ya tiene
estado, como la de producción.

## Cómo ejecutarlas

1. Abrir el editor de SQL de Supabase (proyecto de la API).
2. Ejecutar los archivos pendientes en orden, uno por uno.
3. **No** ejecutar dos veces la misma migración sobre tablas con `add
   constraint` sin `if not exists` (la 0027 falla si la FK ya existe; es
   intencional, para que el nombre fijo de la restricción quede garantizado).

Todas las migraciones **0001–0035 están aplicadas** en el entorno actual.
La **0036 (`brand_assets.siguiente_numero`) está pendiente**: mientras no se
ejecute, el código fuente actual NO puede subir versiones (el `update` escribe
una columna que aún no existe).

## Relación con el código

- Cada tabla con CRUD expuesto en `/api/v1` tiene su modelo en
  `src/models/*.model.ts`, su Request/Resource y su documentación OpenAPI.
- `integraciones` es una tabla de apoyo del diagrama (catálogo de
  proveedores disponibles) y **no** tiene CRUD: se alimenta con la semilla
  0035.
- `audit_logs` es la bitácora de escrituras: solo lectura desde el API
  (`GET /api/v1/auditoria`, restringido a administradores).

## RLS y Storage

La migración 0029 habilita Row Level Security en todas las tablas **sin
políticas permisivas** y revoca permisos a `anon` y `authenticated`. El API
accede con la service role key (que salta el RLS), aplica autenticación, RBAC
y acote por `empresa_id`, y desde el navegador no hay acceso directo.

La 0028 crea el bucket privado `brand-kit` de Supabase Storage, con la
estructura de ruta `empresa_{empresa_id}/{brand_asset_id}/v{numero}-{nombre}`.
Los permisos del bucket quedan denegados: solo el API entra y emite URL
firmadas de 300 segundos.
