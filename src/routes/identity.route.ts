// routes/identity.route.ts
// Routers del módulo Identidad (10 recursos CRUD).
//
// La documentación OpenAPI de estos recursos no vive aquí: se genera desde
// `src/docs/index.ts` con los esquemas de `src/docs/schemas.ts`, de modo que
// la spec y los modelos nunca se desalinean.

export {
  auditLogRouter,
  configuracionIntegracionRouter,
  empresaHitoRouter,
  empresaIntegracionRouter,
  empresaRouter,
  hitoLanzamientoRouter,
  permisoRouter,
  rolPermisoRouter,
  rolRouter,
  usuarioRolRouter,
  usuarioRouter,
} from '../controllers/identity.controller';
