import { Router, type RequestHandler } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { z } from 'zod';
import { newOpaqueToken, tokenHash } from '../auth.js';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service.js';

export function createAuthRouter(
  authController: AuthController,
  db: PrismaClient | undefined,
  authService: AuthService,
  requireDb: RequestHandler,
): Router {
  const router = Router();
  const prisma = db!;

  router.post('/auth/register', requireDb, authController.register);
  router.post('/auth/login', requireDb, authController.login);

  router.post('/auth/refresh', requireDb, async (req, res, next) => {
    try {
      const schema = z.object({ refreshToken: z.string().min(1) });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const hash = tokenHash(input.data.refreshToken);
      const session = await prisma.session.findFirst({
        where: { refreshTokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
        include: { user: { include: { memberships: true } } },
      });
      if (!session) {
        return res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN' } });
      }

      const nextRefreshToken = newOpaqueToken();
      await prisma.$transaction([
        prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
        prisma.session.create({
          data: {
            userId: session.userId,
            refreshTokenHash: tokenHash(nextRefreshToken),
            expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          },
        }),
      ]);

      const membership = session.user.memberships[0];
      const accessToken = authService.signToken({
        userId: session.userId,
        organizationId: membership?.organizationId ?? 'standalone',
        role: membership?.role ?? 'MEMBER',
      });

      return res.json({ accessToken, refreshToken: nextRefreshToken });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/auth/logout', requireDb, async (req, res, next) => {
    try {
      const schema = z.object({ refreshToken: z.string().min(1) });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      await prisma.session.updateMany({
        where: { refreshTokenHash: tokenHash(input.data.refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return res.json({ status: 'ok' });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
