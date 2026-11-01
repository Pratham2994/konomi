import { api } from '../../lib/api'
import type { ClusterMeta, Point } from './Galaxy'

/** The 3D galaxy is the heaviest part of the app: load its code and its 40,000 stars ahead of the first visit. */
export const loadGalaxy = () => import('./Galaxy')
export const galaxyQuery = {
  queryKey: ['galaxy'],
  queryFn: () => api<{ points: Point[]; clusters: ClusterMeta[] }>('/api/taste/galaxy'),
  staleTime: Infinity,
}
