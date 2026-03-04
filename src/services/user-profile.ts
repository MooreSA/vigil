import type { UserProfileRepository } from '../repositories/user-profile.js';

interface UserProfileServiceDeps {
  userProfileRepo: UserProfileRepository;
}

export interface UserProfileData {
  content: string;
  timezone: string;
}

export class UserProfileService {
  private userProfileRepo: UserProfileRepository;

  constructor(deps: UserProfileServiceDeps) {
    this.userProfileRepo = deps.userProfileRepo;
  }

  async get(): Promise<UserProfileData> {
    const profile = await this.userProfileRepo.get();
    return {
      content: profile?.content ?? '',
      timezone: profile?.timezone ?? 'UTC',
    };
  }

  async getTimezone(): Promise<string> {
    const profile = await this.userProfileRepo.get();
    return profile?.timezone ?? 'UTC';
  }

  async update(fields: { content?: string; timezone?: string }) {
    if (fields.content === undefined && fields.timezone === undefined) {
      const profile = await this.userProfileRepo.get();
      return profile!;
    }
    return this.userProfileRepo.upsert(fields);
  }
}
