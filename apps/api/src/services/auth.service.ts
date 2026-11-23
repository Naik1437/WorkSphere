/* eslint-disable @typescript-eslint/no-explicit-any -- Accepts lightweight Prisma-compatible test doubles */
import { createHmac } from 'node:crypto';
import { hashPassword, newOpaqueToken, tokenHash, verifyPassword } from '../auth.js';

export class AuthService {
  constructor(
    private readonly db: any,
    private readonly secret: string,
  ) {}

  public signToken(payload: Record<string, string>, lifetimeSeconds = 900): string {
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds }),
    ).toString('base64url');
    return `${body}.${createHmac('sha256', this.secret).update(body).digest('base64url')}`;
  }

  public async register(data: {
    email: string;
    password: string;
    organizationName: string;
    organizationSlug: string;
  }) {
    const passwordHash = await hashPassword(data.password);
    const org = await this.db.organization.create({
      data: { name: data.organizationName, slug: data.organizationSlug },
    });
    const user = await this.db.user.create({
      data: { email: data.email, passwordHash },
    });
    await this.db.membership.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const accessToken = this.signToken({
      userId: user.id,
      organizationId: org.id,
      role: 'OWNER',
    });

    const rawRefreshToken = newOpaqueToken();
    await this.db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: tokenHash(rawRefreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: { id: user.id, email: user.email },
      organization: { id: org.id, name: org.name, slug: org.slug },
    };
  }

  public async login(data: { email: string; password: string }) {
    const user = await this.db.user.findUnique({
      where: { email: data.email },
      include: { memberships: { include: { organization: true }, take: 1 } },
    });
    if (!user) return null;

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) return null;

    const membership = user.memberships[0];
    const organizationId = membership?.organizationId ?? 'standalone';
    const role = membership?.role ?? 'MEMBER';

    const accessToken = this.signToken({
      userId: user.id,
      organizationId,
      role,
    });

    const rawRefreshToken = newOpaqueToken();
    await this.db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: tokenHash(rawRefreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: { id: user.id, email: user.email },
      organization: membership?.organization,
    };
  }
}
