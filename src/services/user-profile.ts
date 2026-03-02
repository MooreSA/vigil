import type { UserProfileRepository } from '../repositories/user-profile.js';

interface UserProfileServiceDeps {
  userProfileRepo: UserProfileRepository;
}

export class UserProfileService {
  private userProfileRepo: UserProfileRepository;

  constructor(deps: UserProfileServiceDeps) {
    this.userProfileRepo = deps.userProfileRepo;
  }

  async get(): Promise<string> {
    const profile = await this.userProfileRepo.get();
    return profile?.content ?? '';
  }

  async update(content: string) {
    return this.userProfileRepo.upsert(content);
  }
}
