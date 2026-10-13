import { MAX_PAGE_SIZE, type Paginated, type ProjectSummary } from '@erp/shared';
import type { Api } from './hooks';

/** Every project the user can see (one large page); the site app lists and picks from all of them. */
export async function fetchProjects(api: Api): Promise<ProjectSummary[]> {
  const res = await api.get<Paginated<ProjectSummary>>('/projects', { pageSize: MAX_PAGE_SIZE, sortBy: 'status' });
  return res.items;
}
