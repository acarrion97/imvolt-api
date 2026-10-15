// routes/identity.route.ts
// Rutas de identidad (organizaciones, membresías, usuarios) + Swagger.
// El CRUD completo lo genera `createCrudRouter`: GET /, GET /:id, POST /,
// PUT /:id, PATCH /:id y DELETE /:id acotados a la organización activa.

/**
 * @swagger
 * tags:
 *   name: Identidad
 *   description: Organizaciones (tenants), usuarios y membresías con rol
 */

/**
 * @swagger
 * /api/v1/organizaciones:
 *   get:
 *     summary: Organizaciones del usuario autenticado
 *     tags: [Identidad]
 *     parameters:
 *       - { in: header, name: X-Org-Id, schema: { type: string }, description: Organización activa }
 *     responses:
 *       200: { description: Lista de organizaciones }
 *   post:
 *     summary: Crea una organización
 *     tags: [Identidad]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, tipo]
 *             properties:
 *               nombre: { type: string }
 *               tipo: { type: string, enum: [desarrollador, inmobiliaria, agente] }
 *               ruc: { type: string }
 *               pais: { type: string }
 *     responses:
 *       201: { description: Organización creada }
 */

/**
 * @swagger
 * /api/v1/membresias:
 *   get:
 *     summary: Membresías (usuarios y roles) de la organización activa
 *     tags: [Identidad]
 *     responses:
 *       200: { description: Lista de membresías }
 *   post:
 *     summary: Invita un usuario a la organización con un rol
 *     tags: [Identidad]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, rol]
 *             properties:
 *               user_id: { type: string, format: uuid }
 *               rol: { type: string, enum: [propietario, administrador, marketing, agente, lector] }
 *     responses:
 *       201: { description: Membresía creada }
 */

/**
 * @swagger
 * /api/v1/usuarios:
 *   get:
 *     summary: Usuarios con membresía activa en la organización
 *     tags: [Identidad]
 *     responses:
 *       200: { description: Lista acotada a la organización activa }
 */

export { organizacionRouter, membresiaRouter, usuarioRouter } from '../controllers/identity.controller';
