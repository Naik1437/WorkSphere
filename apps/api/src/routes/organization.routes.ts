import { Router } from 'express';
import { z } from 'zod';
import { OrganizationRepository } from '../repositories/organization.repository.js';
import { newOpaqueToken, tokenHash } from '../auth.js';

export function createOrganizationRouter(
  orgRepo: OrganizationRepository,
  middleware: {
    authenticate: any;
    requireDb: any;
    requireRole: (roles: string[]) => any;
  },
): Router {
  const router = Router();
  const { authenticate, requireDb, requireRole } = middleware;

  router.get('/organizations/current', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const org = await orgRepo.findById(identity.organizationId);
      if (!org) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({
        data: org,
        organization: org,
        role: identity.role,
        membership: { role: identity.role },
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/organizations/current/members', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const members = await orgRepo.listMembers(identity.organizationId);
      return res.json({ data: members, members });
    } catch (err) {
      return next(err);
    }
  });

  router.get(
    '/organizations/current/invitations',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const invitations = await orgRepo.listInvitations(identity.organizationId);
        return res.json(invitations);
      } catch (err) {
        return next(err);
      }
    },
  );

  router.post(
    '/organizations/current/invitations',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    async (req, res, next) => {
      try {
        const schema = z.object({
          email: z.string().email(),
          role: z.enum(['MANAGER', 'MEMBER', 'AUDITOR']),
        });
        const input = schema.safeParse(req.body);
        if (!input.success) {
          return res.status(400).json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
        }

        const identity = (req as any).identity;
        const rawToken = newOpaqueToken();
        const invitation = await orgRepo.createInvitation({
          email: input.data.email.toLowerCase(),
          role: input.data.role,
          organizationId: identity.organizationId,
          tokenHash: tokenHash(rawToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        });

        return res.status(201).json({
          data: { ...invitation, invitationToken: rawToken },
          invitation,
          token: rawToken,
          invitationToken: rawToken,
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          return res.status(409).json({ error: { code: 'ALREADY_INVITED', message: 'An invitation has already been sent to this email' } });
        }
        return next(err);
      }
    },
  );

  router.post('/invitations/accept', authenticate, requireDb, async (req, res, next) => {
    try {
      const schema = z.object({ token: z.string().min(1) });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const invitation = await orgRepo.findInvitationByHash(tokenHash(input.data.token));
      if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
        return res.status(400).json({ error: { code: 'INVALID_INVITATION' } });
      }

      const identity = (req as any).identity;
      const updated = await orgRepo.acceptInvitation(
        invitation.id,
        identity.userId,
        invitation.organizationId,
        invitation.role,
      );

      return res.json({ status: 'accepted', invitation: updated });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
