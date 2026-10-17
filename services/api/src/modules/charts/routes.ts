import { chartQuerySchema, type ChartResponse, type PlanetsResponse } from '@astro/shared';
import type { V1Module } from '../../app.js';
import { requireAuth } from '../auth/hook.js';
import type { ChartsService } from './service.js';

type IdParams = { Params: { id: string } };

/** GET /v1/profiles/{id}/chart?type=D1|D9 and GET /v1/profiles/{id}/planets */
export function chartsModule(service: ChartsService): V1Module {
  return (v1) => {
    v1.get<IdParams>('/profiles/:id/chart', (request): Promise<ChartResponse> => {
      const { type } = chartQuerySchema.parse(request.query);
      return service.chart(requireAuth(request).uid, request.params.id, type);
    });

    v1.get<IdParams>('/profiles/:id/planets', (request): Promise<PlanetsResponse> =>
      service.planetTable(requireAuth(request).uid, request.params.id),
    );
  };
}
