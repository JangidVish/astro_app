import { placeSearchQuerySchema, type PlaceSearchResponse } from '@astro/shared';
import type { V1Module } from '../../app.js';
import { requireAuth } from '../auth/hook.js';
import type { PlacesService } from './service.js';

/** GET /v1/places?q= */
export function placesModule(service: PlacesService): V1Module {
  return (v1) => {
    v1.get('/places', async (request): Promise<PlaceSearchResponse> => {
      const { q } = placeSearchQuerySchema.parse(request.query);
      return { places: await service.search(requireAuth(request).uid, q) };
    });
  };
}
