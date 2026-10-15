// routes/auth.route.ts
// Endpoints de autenticación (Supabase Auth) + Swagger.

import express from 'express';
import { AuthController } from '../controllers/auth.controller';
import { sessionAuth, orgContext } from '../middlewares/sessionAuth';

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
 *     summary: Crea la cuenta, la organización (tenant), la membresía de propietario y la wallet de créditos
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, nombres, apellidos, organization_name, organization_type]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               nombres: { type: string }
 *               apellidos: { type: string }
 *               organization_name: { type: string }
 *               organization_type: { type: string, enum: [desarrollador, inmobiliaria, agente] }
 *               pais: { type: string }
 *     responses:
 *       201: { description: Cuenta creada correctamente }
 *       400: { description: Datos inválidos }
 */
router.post('/register', AuthController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Inicia sesión y devuelve los tokens de acceso
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Sesión iniciada (access_token, refresh_token, user_id) }
 *       401: { description: Credenciales inválidas }
 */
router.post('/login', AuthController.login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Perfil del usuario autenticado y sus membresías
 *     tags: [Autenticación]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema: { type: string }
 *         required: true
 *         description: "Bearer <access_token>"
 *     responses:
 *       200: { description: Usuario y membresías }
 *       401: { description: Sin token válido }
 */
router.get('/me', sessionAuth, orgContext, AuthController.me);

export default router;
