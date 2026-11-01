import { api } from '../../lib/api'
import type { ClusterMeta, Point } from './Galaxy'

/** The 3D galaxy is the heaviest part of the app: load its code and its 40,000 stars ahead of the first visit. */
export const loadGalaxy = () => import('./Galaxy')
export const galaxyQuery = {
  queryKey: ['galaxy'],
  // "?v=2": browsers that cached the old tag-labelled galaxy (once kept for an hour) fetch the named one instead.
  queryFn: () => api<{ points: Point[]; clusters: ClusterMeta[] }>('/api/taste/galaxy?v=2'),
  staleTime: Infinity,
}
