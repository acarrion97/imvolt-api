// controllers/auth.controller.ts
// Registro, login y perfil del usuario autenticado.

import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { loginRequest, registerRequest } from '../requests/auth.request';
import { sessionAuth, orgContext } from '../middlewares/sessionAuth';

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
      const input = registerRequest.validateCreate(req.body) as {
        email: string;
        password: string;
        nombres: string;
        apellidos: string;
        telefono?: string;
        organization_name: string;
        ruc?: string;
      };

      const result = await authService.register({
        ...input,
        ruc: input.ruc || undefined,
        telefono: input.telefono || undefined,
      });

      res.status(201).json({ message: 'Cuenta creada correctamente', ...result });
    } catch (error) {
      send(res, error);
    }
  };

  /** POST /auth/login — devuelve los tokens de Supabase Auth. */
  static login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = loginRequest.validateCreate(req.body) as {
        email: string;
        password: string;
      };
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
