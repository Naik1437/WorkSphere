import { TeamRepository } from '../repositories/team.repository.js';

export class TeamService {
  constructor(private readonly teamRepo: TeamRepository) {}

  public async listTeams(organizationId: string) {
    return this.teamRepo.listByOrg(organizationId);
  }

  public async getTeam(teamId: string, organizationId: string) {
    return this.teamRepo.findById(teamId, organizationId);
  }

  public async createTeam(organizationId: string, data: { name: string; description?: string }) {
    return this.teamRepo.create({
      name: data.name,
      description: data.description,
      organizationId,
    });
  }

  public async addMember(teamId: string, organizationId: string, userId: string, role = 'MEMBER') {
    const team = await this.teamRepo.findById(teamId, organizationId);
    if (!team) return null;
    return this.teamRepo.addMember(team.id, userId, role);
  }

  public async listMembers(teamId: string, organizationId: string) {
    const team = await this.teamRepo.findById(teamId, organizationId);
    if (!team) return null;
    return this.teamRepo.listMembers(team.id);
  }
}
