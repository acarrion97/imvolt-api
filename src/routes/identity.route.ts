// routes/identity.route.ts
// Routers del módulo Identidad (11 recursos CRUD).
//
// La documentación OpenAPI de los CRUD vive en `src/docs/index.ts` con los
// esquemas de `src/docs/schemas.ts`, de modo que la spec y los modelos nunca
// se desalinean. Las rutas PROPIAS del módulo (invitación de miembros) se
// documentan aquí con @swagger, igual que auth y brandkit.

/**
 * @swagger
 * /api/v1/usuarios/invitaciones:
 *   post:
 *     summary: Invita a un miembro a la empresa activa
 *     description: >
 *       Crea la credencial en Supabase Auth con una **contraseña temporal**,
 *       la fila local en `usuarios` dentro de la empresa del token y su rol
 *       (§13). Como aún no hay servicio de correo, la contraseña temporal se
 *       devuelve en la respuesta para que el administrador la comparta; el
 *       miembro debe cambiarla al ingresar. Requiere rol propietario o
 *       administrador con el permiso `gestionar_usuarios`.
 *     tags: [Identidad]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, email, rol]
 *             properties:
 *               nombre: { type: string, example: Andrea Salazar }
 *               email: { type: string, format: email, example: andrea.salazar@imvolt.ec }
 *               telefono: { type: string, example: "+593987654321" }
 *               rol:
 *                 type: string
 *                 enum: [propietario, administrador, marketing, agente, lector]
 *                 example: marketing
 *     responses:
 *       201:
 *         description: Miembro invitado (incluye la contraseña temporal)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Miembro invitado correctamente }
 *                 usuario_id: { type: integer, example: 12 }
 *                 auth_user_id: { type: string, format: uuid }
 *                 empresa_id: { type: integer, example: 2 }
 *                 rol: { type: string, example: marketing }
 *                 contrasenia_temporal: { type: string, example: Xk9_Temporal123 }
 *                 contrasenia_temporal_hasta: { type: string, format: date-time }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: El rol no tiene permiso para invitar miembros
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: El correo ya tiene una cuenta en la plataforma
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
