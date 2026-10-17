import type { Firestore } from 'firebase-admin/firestore';
import { meUpdateInputSchema } from '@astro/shared';
import type { V1Module } from '../../app.js';
import { requireAuth } from '../auth/hook.js';
import { UsersRepository } from './repository.js';
import { UsersService } from './service.js';

export interface UsersModuleDeps {
  db: Firestore;
  pepper: Buffer;
  now?: () => Date;
}

export function createUsersService(deps: UsersModuleDeps): UsersService {
  return new UsersService({
    repository: new UsersRepository(deps.db),
    pepper: deps.pepper,
    ...(deps.now ? { now: deps.now } : {}),
  });
}

/** GET/PATCH /v1/me */
export function usersModule(deps: UsersModuleDeps, service = createUsersService(deps)): V1Module {
  return (v1) => {
    v1.get('/me', (request) => service.getMe(requireAuth(request).uid));

    v1.patch('/me', (request) => {
      const input = meUpdateInputSchema.parse(request.body);
      return service.updateMe(requireAuth(request).uid, input);
    });
  };
}
