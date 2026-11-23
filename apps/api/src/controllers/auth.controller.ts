import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  public register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(12).max(128),
        organizationName: z.string().min(2).max(160),
        organizationSlug: z.string().min(3).max(64),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      try {
        const result = await this.authService.register(input.data);
        return res.status(201).json({ data: result, ...result });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          return res.status(409).json({ error: { code: 'ALREADY_EXISTS' } });
        }
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  };

  public login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const result = await this.authService.login(input.data);
      if (!result) {
        return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } });
      }
      return res.json({ data: result, ...result });
    } catch (err) {
      return next(err);
    }
  };
}
