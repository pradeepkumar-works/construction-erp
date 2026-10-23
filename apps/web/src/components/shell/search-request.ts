/** Opens Search (Ctrl K) with words already in the box, from anywhere (Home's "Search records for …"). The shell listens. */
export const SEARCH_REQUEST = 'nirmaan:search';

export const requestSearch = (query: string) => window.dispatchEvent(new CustomEvent<string>(SEARCH_REQUEST, { detail: query }));
