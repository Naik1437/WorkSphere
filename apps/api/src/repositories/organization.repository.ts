/* eslint-disable @typescript-eslint/no-explicit-any -- Accepts lightweight Prisma-compatible test doubles */

export class OrganizationRepository {
  constructor(private readonly db: any) {}

  public async findById(id: string) {
    if (!this.db?.organization?.findUnique) return null;
    return this.db.organization.findUnique({
      where: { id },
    });
  }

  public async listMembers(organizationId: string) {
    if (!this.db?.membership?.findMany) return [];
    return this.db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  public async listInvitations(organizationId: string) {
    if (!this.db?.invitation?.findMany) return [];
    return this.db.invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async createInvitation(data: {
    email: string;
    role: string;
    organizationId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    if (this.db?.invitation?.upsert) {
      return this.db.invitation.upsert({
        where: {
          organizationId_email: {
            organizationId: data.organizationId,
            email: data.email,
          },
        },
        update: {
          role: data.role as any,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          acceptedAt: null,
        },
        create: data,
      });
    }
    return this.db.invitation.create({
      data,
    });
  }

  public async findInvitationByHash(tokenHash: string) {
    if (!this.db?.invitation?.findFirst) return null;
    return this.db.invitation.findFirst({
      where: { tokenHash },
    });
  }

  public async acceptInvitation(invitationId: string, userId: string, organizationId: string, role: string) {
    await this.db.membership.upsert({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      update: { role },
      create: { organizationId, userId, role },
    });

    return this.db.invitation.update({
      where: { id: invitationId },
      data: { acceptedAt: new Date() },
    });
  }
}
