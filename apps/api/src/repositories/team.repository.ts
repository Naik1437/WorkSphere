/* eslint-disable @typescript-eslint/no-explicit-any -- Accepts lightweight Prisma-compatible test doubles */

export class TeamRepository {
  constructor(private readonly db: any) {}

  public async listByOrg(organizationId: string) {
    if (!this.db?.team?.findMany) return [];
    return this.db.team.findMany({
      where: { organizationId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async findById(id: string, organizationId?: string) {
    if (!this.db?.team?.findFirst) return null;
    return this.db.team.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        members: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });
  }

  public async create(data: { name: string; description?: string; organizationId: string }) {
    return this.db.team.create({
      data: {
        name: data.name,
        description: data.description,
        organizationId: data.organizationId,
      },
    });
  }

  public async addMember(teamId: string, userId: string, role = 'MEMBER') {
    const model = this.db?.teamMember || this.db?.teamMembership;
    if (!model?.upsert) return null;
    return model.upsert({
      where: {
        teamId_userId: { teamId, userId },
      },
      update: { role },
      create: { teamId, userId, role },
    });
  }

  public async listMembers(teamId: string) {
    if (!this.db?.teamMembership?.findMany) return [];
    return this.db.teamMembership.findMany({
      where: { teamId },
      include: { user: { select: { id: true, email: true } } },
    });
  }
}
