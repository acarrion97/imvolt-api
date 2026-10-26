// routes/auth.route.ts
// Endpoints de autenticación (Supabase Auth) + Swagger.
//
// El registro crea la cuenta en Supabase Auth y, sobre el diagrama relacional,
// la empresa (tenant), el usuario local y la asignación del rol `propietario`.

import express from 'express';
import { AuthController } from '../controllers/auth.controller';
import { sessionAuth, orgContext } from '../middlewares/sessionAuth';
import { loginRateLimit, registerRateLimit } from '../middlewares/security';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Autenticación
 *   description: Registro, inicio de sesión y perfil del usuario IMVOLT
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Crea la cuenta (Supabase Auth), la empresa, el usuario local y el rol propietario
 *     description: >
 *       El registro es el único endpoint abierto del API. Devuelve el `user_id`
 *       de Supabase Auth junto al `empresa_id` y `usuario_id` creados en el
 *       diagrama relacional; la empresa queda como tenant del usuario.
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, nombres, apellidos, organization_name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: andrea.salazar@imvolt.ec
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Str0ng-Pass!
 *               nombres:
 *                 type: string
 *                 example: Andrea
 *               apellidos:
 *                 type: string
 *                 example: Salazar
 *               telefono:
 *                 type: string
 *                 example: "+593987654321"
 *               organization_name:
 *                 type: string
 *                 description: Razón social de la empresa creada junto a la cuenta
 *                 example: IMVOLT Desarrollos S.A.
 *               ruc:
 *                 type: string
 *                 description: RUC de 13 dígitos; puede completarse después
 *                 example: "1792345678001"
 *           example:
 *             email: andrea.salazar@imvolt.ec
 *             password: Str0ng-Pass!
 *             nombres: Andrea
 *             apellidos: Salazar
 *             telefono: "+593987654321"
 *             organization_name: IMVOLT Desarrollos S.A.
 *             ruc: "1792345678001"
 *     responses:
 *       201:
 *         description: Cuenta creada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Cuenta creada correctamente }
 *                 user_id: { type: string, format: uuid, example: 8f9a1c2e-5b7d-4f0a-9c3e-1d2e3f4a5b6c }
 *                 empresa_id: { type: integer, example: 1 }
 *                 usuario_id: { type: integer, example: 7 }
 *       400:
 *         description: Datos inválidos o email ya registrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/register', registerRateLimit, AuthController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Inicia sesión y devuelve los tokens de acceso
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: andrea.salazar@imvolt.ec }
 *               password: { type: string, format: password, example: Str0ng-Pass! }
 *     responses:
 *       200:
 *         description: Sesión iniciada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token: { type: string, description: "Se envía como Authorization: Bearer <access_token>" }
 *                 refresh_token: { type: string }
 *                 user_id: { type: string, format: uuid }
 *             example:
 *               access_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…
 *               refresh_token: dGhpcyBpcyB1biByZWZyZXNoIHRva2Vu…
 *               user_id: 8f9a1c2e-5b7d-4f0a-9c3e-1d2e3f4a5b6c
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429:
 *         description: Demasiados intentos desde la misma IP (rate limit)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', loginRateLimit, AuthController.login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Perfil local del usuario autenticado, sus roles y permisos
 *     description: >
 *       Resuelve el usuario local (tabla `usuarios`) a partir del token y
 *       devuelve su empresa activa, los roles asignados en `roles_usuarios` y
 *       la unión de permisos de esos roles (`roles_permisos`), que el frontend
 *       usa para habilitar o no las acciones de gestión.
 *     tags: [Autenticación]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema: { type: string }
 *         required: true
 *         description: "Bearer <access_token>"
 *       - in: header
 *         name: X-Empresa-Id
 *         schema: { type: integer }
 *         required: false
 *         description: Empresa a la que se quiere acceder (por defecto, la del usuario)
 *     responses:
 *       200:
 *         description: Usuario, empresa, roles y permisos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usuario:
 *                   $ref: '#/components/schemas/Usuario'
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       usuario_rol_id: { type: integer, example: 3 }
 *                       rol_id: { type: integer, example: 2 }
 *                       nombre: { type: string, example: marketing }
 *                 permisos:
 *                   type: array
 *                   description: Unión de permisos activos del usuario (el propietario los hereda todos)
 *                   items: { type: string, example: gestionar_usuarios }
 *       401:
 *         description: Sin token válido
 *       404:
 *         description: El usuario no tiene cuenta local registrada
 */
router.get('/me', sessionAuth, orgContext, AuthController.me);

export default router;
