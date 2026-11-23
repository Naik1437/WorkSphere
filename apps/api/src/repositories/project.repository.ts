/* eslint-disable @typescript-eslint/no-explicit-any -- Accepts lightweight Prisma-compatible test doubles */

export class ProjectRepository {
  constructor(private readonly db: any) {}

  public async findById(id: string, organizationId?: string) {
    if (!this.db?.project?.findFirst) return null;
    return this.db.project.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  public async listByOrg(organizationId: string) {
    if (!this.db?.project?.findMany) return [];
    return this.db.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async create(data: { name: string; description?: string; organizationId: string }) {
    return this.db.project.create({
      data: {
        name: data.name,
        description: data.description,
        organizationId: data.organizationId,
      },
    });
  }

  public async update(id: string, organizationId: string, data: { name?: string; description?: string }) {
    return this.db.project.update({
      where: { id },
      data,
    });
  }

  public async delete(id: string) {
    return this.db.project.delete({ where: { id } });
  }

  public async listMilestones(projectId: string) {
    if (!this.db?.milestone?.findMany) return [];
    return this.db.milestone.findMany({
      where: { projectId },
      orderBy: { dueAt: 'asc' },
    });
  }

  public async createMilestone(data: { title: string; dueAt?: Date; projectId: string }) {
    return this.db.milestone.create({
      data: {
        name: data.title,
        dueAt: data.dueAt,
        projectId: data.projectId,
      },
    });
  }
}
