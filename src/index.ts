// index.ts
// IMVOLT API — MARKETING INMOBILIARIO AI
// Plataforma SaaS de marketing inmobiliario asistido por IA.
//
// Arquitectura: monolito modular Express + TypeScript sobre Supabase
// (documento maestro §12). Cada módulo expone su CRUD genérico y sus
// endpoints de negocio bajo /api/v1.
//
//   identity      /organizaciones /usuarios /membresias
//   catalog       /proyectos /propiedades /media /brand-kits
//   creative      /plantillas /modelos /creative/generations /strategist
//   advertising   /conexiones /campaigns
//   commerce      /planes /suscripciones /billing
//   leads         /leads

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { config } from './config/global';
import authRoutes from './routes/auth.route';
import { organizacionRouter, membresiaRouter, usuarioRouter } from './routes/identity.route';
import { proyectoRouter, propiedadRouter, mediaRouter, brandKitRouter } from './routes/catalog.route';
import { plantillaRouter, modeloRouter, generacionRouter, estrategaRouter } from './routes/creative.route';
import { conexionRouter, campanaRouter } from './routes/advertising.route';
import { planRouter, suscripcionRouter, billingRouter } from './routes/commerce.route';
import { leadRouter } from './routes/lead.route';

dotenv.config();

const app = express();

// ── Middleware global ────────────────────────────────────────────────────────
app.use(cors({ origin: config.allowedOrigin }));
app.use(express.json({ limit: '10mb' }));

// ── Salud del servicio ──────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    service: 'imvolt-api',
    brand: 'IMVOLT — MARKETING INMOBILIARIO AI',
    status: 'ok',
    simulated: {
      higgsfield: config.higgsfield.simulate,
      meta: config.meta.simulate,
    },
    time: new Date().toISOString(),
  });
});

// ── Registro de rutas ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// identity
app.use('/api/v1/organizaciones', organizacionRouter);
app.use('/api/v1/membresias', membresiaRouter);
app.use('/api/v1/usuarios', usuarioRouter);

// catalog
app.use('/api/v1/proyectos', proyectoRouter);
app.use('/api/v1/propiedades', propiedadRouter);
app.use('/api/v1/media', mediaRouter);
app.use('/api/v1/brand-kits', brandKitRouter);

// creative
app.use('/api/v1/plantillas', plantillaRouter);
app.use('/api/v1/modelos', modeloRouter);
app.use('/api/v1/creative/generations', generacionRouter);
app.use('/api/v1/strategist', estrategaRouter);

// advertising
app.use('/api/v1/conexiones', conexionRouter);
app.use('/api/v1/campaigns', campanaRouter);

// commerce
app.use('/api/v1/planes', planRouter);
app.use('/api/v1/suscripciones', suscripcionRouter);
app.use('/api/v1/billing', billingRouter);

// leads
app.use('/api/v1/leads', leadRouter);

// ── Documentación Swagger ───────────────────────────────────────────────────
const swaggerOptions = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'IMVOLT API',
      version: '1.0.0',
      description:
        'API de IMVOLT — MARKETING INMOBILIARIO AI. De la propiedad al anuncio: crear, publicar y medir.',
      license: { name: 'MIT' },
      contact: { name: 'Soporte IMVOLT' },
    },
    servers: [{ url: `http://localhost:${config.port}` }],
  },
  apis: ['./src/routes/*.ts'],
};

app.use('/documentacion', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));

// ── Arranque ────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`IMVOLT API escuchando en http://localhost:${config.port}`);
  console.log(`Documentación: http://localhost:${config.port}/documentacion`);
  if (config.higgsfield.simulate) console.log('Higgsfield: MODO SIMULADO (sin API key)');
  if (config.meta.simulate) console.log('Meta: MODO SIMULADO (sin credenciales; solo borradores)');
});

export default app;
