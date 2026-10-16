// controllers/auth.controller.ts
// Registro, login y perfil del usuario autenticado.

import { Request, Response } from 'express';
import { authService, RegisterInput } from '../services/auth.service';
import { sessionAuth, orgContext } from '../middlewares/sessionAuth';
import { ValidationError } from '../core/errors';

const send = (res: Response, error: unknown): void => {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const httpError = error as { statusCode: number; message: string; details?: unknown };
    res.status(httpError.statusCode).json({ message: httpError.message, details: httpError.details });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : 'Error interno del servidor' });
};

export class AuthController {
  /** POST /auth/register — crea cuenta + empresa + usuario + rol propietario. */
  static register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, nombres, apellidos, telefono, organization_name, ruc } =
        req.body as Partial<RegisterInput>;

      if (!email || !password || !nombres || !apellidos || !organization_name) {
        throw new ValidationError('Faltan campos obligatorios del registro', [
          { field: 'email', message: 'email, password, nombres, apellidos y organization_name son requeridos' },
        ]);
      }

      const result = await authService.register({
        email,
        password,
        nombres,
        apellidos,
        telefono,
        organization_name,
        ruc,
      });

      res.status(201).json({ message: 'Cuenta creada correctamente', ...result });
    } catch (error) {
      send(res, error);
    }
  };

  /** POST /auth/login — devuelve los tokens de Supabase Auth. */
  static login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        throw new ValidationError('Email y contraseña son requeridos');
      }
      res.json(await authService.login(email, password));
    } catch (error) {
      send(res, error);
    }
  };

  /** GET /auth/me — perfil local + roles del usuario autenticado. */
  static me = async (req: Request, res: Response): Promise<void> => {
    try {
      const email = (req.user as { email?: string } | undefined)?.email;
      res.json(await authService.me(email));
    } catch (error) {
      send(res, error);
    }
  };
}

/** Middlewares exportados para el router de autenticación. */
export const authMiddlewares = { sessionAuth, orgContext };
