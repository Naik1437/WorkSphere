import { ProjectRepository } from '../repositories/project.repository.js';
import { RealtimeBroadcaster } from '../events.js';

export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly events?: RealtimeBroadcaster,
  ) {}

  public async listProjects(organizationId: string) {
    return this.projectRepo.listByOrg(organizationId);
  }

  public async getProject(id: string, organizationId: string) {
    return this.projectRepo.findById(id, organizationId);
  }

  public async createProject(
    organizationId: string,
    data: { name: string; description?: string },
    actorId?: string,
  ) {
    const project = await this.projectRepo.create({
      name: data.name,
      description: data.description,
      organizationId,
    });

    this.events?.publish(organizationId, {
      type: 'project.created',
      payload: project,
      actorId,
    });

    return project;
  }

  public async updateProject(
    id: string,
    organizationId: string,
    data: { name?: string; description?: string },
    actorId?: string,
  ) {
    const project = await this.projectRepo.findById(id, organizationId);
    if (!project) return null;

    const updated = await this.projectRepo.update(id, organizationId, data);

    this.events?.publish(organizationId, {
      type: 'project.updated',
      payload: updated,
      actorId,
    });

    return updated;
  }

  public async deleteProject(id: string, organizationId: string, actorId?: string) {
    const project = await this.projectRepo.findById(id, organizationId);
    if (!project) return null;

    await this.projectRepo.delete(id);

    this.events?.publish(organizationId, {
      type: 'project.deleted',
      payload: { id },
      actorId,
    });

    return project;
  }

  public async listMilestones(projectId: string, organizationId: string) {
    const project = await this.projectRepo.findById(projectId, organizationId);
    if (!project) return null;
    return this.projectRepo.listMilestones(projectId);
  }

  public async createMilestone(
    projectId: string,
    organizationId: string,
    data: { title: string; dueAt?: Date },
  ) {
    const project = await this.projectRepo.findById(projectId, organizationId);
    if (!project) return null;
    return this.projectRepo.createMilestone({
      title: data.title,
      dueAt: data.dueAt,
      projectId,
    });
  }
}
