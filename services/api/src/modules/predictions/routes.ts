import { z } from 'zod';
import { isoDate, type PredictionResponse } from '@astro/shared';
import type { V1Module } from '../../app.js';
import { requireAuth } from '../auth/hook.js';
import type { PredictionsService } from './service.js';

// Format only here: the date window is enforced by the service against its (injectable) clock,
// relative to the birth place's "today", which is stricter than the shared schema's +/-2 UTC days.
const querySchema = z.strictObject({ date: isoDate });

/** GET /v1/profiles/{id}/prediction?date=yyyy-mm-dd */
export function predictionsModule(service: PredictionsService): V1Module {
  return (v1) => {
    v1.get<{ Params: { id: string } }>(
      '/profiles/:id/prediction',
      (request): Promise<PredictionResponse> => {
        const { date } = querySchema.parse(request.query);
        return service.daily(requireAuth(request).uid, request.params.id, date);
      },
    );
  };
}
