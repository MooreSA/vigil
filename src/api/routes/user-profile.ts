import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UserProfileService } from '../../services/user-profile.js';

interface UserProfileRouteDeps {
  userProfileService: UserProfileService;
}

const updateBodySchema = z.object({
  content: z.string().optional(),
  timezone: z.string().optional(),
});

export async function userProfileRoute(
  app: FastifyInstance,
  opts: UserProfileRouteDeps,
) {
  const { userProfileService } = opts;

  app.get('/user-profile', async () => {
    return userProfileService.get();
  });

  app.put('/user-profile', async (request, reply) => {
    const parsed = updateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const updated = await userProfileService.update(parsed.data);
    return { content: updated.content, timezone: updated.timezone };
  });
}
