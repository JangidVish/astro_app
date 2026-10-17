import {
  profileCreateInputSchema,
  profileUpdateInputSchema,
  type Profile,
  type ProfileListResponse,
} from '@astro/shared';
import type { V1Module } from '../../app.js';
import { requireAuth } from '../auth/hook.js';
import type { ProfilesService } from './service.js';

type IdParams = { Params: { id: string } };

/** /v1/profiles. Every query is scoped to the caller's uid from the verified token. */
export function profilesModule(service: ProfilesService): V1Module {
  return (v1) => {
    v1.get('/profiles', async (request): Promise<ProfileListResponse> => ({
      profiles: await service.list(requireAuth(request).uid),
    }));

    v1.post('/profiles', async (request, reply): Promise<Profile> => {
      const input = profileCreateInputSchema.parse(request.body);
      const profile = await service.create(requireAuth(request).uid, input);
      void reply.status(201);
      return profile;
    });

    v1.get<IdParams>('/profiles/:id', (request) =>
      service.get(requireAuth(request).uid, request.params.id),
    );

    v1.patch<IdParams>('/profiles/:id', (request) => {
      const input = profileUpdateInputSchema.parse(request.body);
      return service.update(requireAuth(request).uid, request.params.id, input);
    });

    v1.delete<IdParams>('/profiles/:id', async (request, reply) => {
      await service.delete(requireAuth(request).uid, request.params.id);
      return reply.status(204).send();
    });
  };
}
