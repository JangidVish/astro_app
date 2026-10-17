import { dashaParamsSchema, type AntardashaResponse, type MahadashaResponse } from '@astro/shared';
import type { V1Module } from '../../app.js';
import { requireAuth } from '../auth/hook.js';
import type { DashaService } from './service.js';

/** GET /v1/profiles/{id}/dasha and GET /v1/profiles/{id}/dasha/{md} */
export function dashaModule(service: DashaService): V1Module {
  return (v1) => {
    v1.get<{ Params: { id: string } }>(
      '/profiles/:id/dasha',
      (request): Promise<MahadashaResponse> =>
        service.mahadashas(requireAuth(request).uid, request.params.id),
    );

    v1.get<{ Params: { id: string; md: string } }>(
      '/profiles/:id/dasha/:md',
      (request): Promise<AntardashaResponse> => {
        const { md } = dashaParamsSchema.parse({ md: request.params.md });
        return service.antardashas(requireAuth(request).uid, request.params.id, md);
      },
    );
  };
}
