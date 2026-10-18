import path from 'node:path';

export { navHrefs } from './helpers';

/** The route walk's own files: the saved sign-ins and sidebar links (`auth/`) and the screenshots (`screens/`). */
export const WALK_DIR = path.resolve(__dirname, '../route-walk');
export const SCREENS_DIR = path.join(WALK_DIR, 'screens');

export interface WalkRole {
  /** Short name for test titles and screenshot folders. */
  key: string;
  email: string;
}

/**
 * One account per sidebar: each of these roles sees a different set of links (README, demo accounts). Between them they
 * see every link in nav.ts; the walk fails when a new link is seen by none of them, so add a role here then.
 */
export const WALK_ROLES: WalkRole[] = [
  { key: 'pm', email: 'pm@demo.com' },
  { key: 'engineer', email: 'engineer@demo.com' },
  { key: 'accounts', email: 'accounts@demo.com' },
  { key: 'admin', email: 'admin@demo.com' },
  { key: 'client', email: 'client@demo.com' },
];

export const stateFile = (role: WalkRole) => path.join(WALK_DIR, 'auth', `${role.key}.json`);
export const routesFile = (role: WalkRole) => path.join(WALK_DIR, 'auth', `${role.key}.routes.json`);

export interface WalkView {
  key: string;
  mode: 'light' | 'dark';
  viewport: { width: number; height: number };
  /** A touch screen: `(pointer: coarse)` matches, and targets must be 44 px. */
  touch: boolean;
}

export const WALK_VIEWS: WalkView[] = [
  { key: '1440-light', mode: 'light', viewport: { width: 1440, height: 900 }, touch: false },
  { key: '1440-dark', mode: 'dark', viewport: { width: 1440, height: 900 }, touch: false },
  { key: '390-light', mode: 'light', viewport: { width: 390, height: 844 }, touch: true },
  { key: '390-dark', mode: 'dark', viewport: { width: 390, height: 844 }, touch: true },
];
