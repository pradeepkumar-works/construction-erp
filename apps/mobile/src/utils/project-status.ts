import type { Ionicons } from '@expo/vector-icons';
import type { ProjectStatus } from '@erp/shared';
import { toneOf } from '../theme';

const ICON: Record<ProjectStatus, keyof typeof Ionicons.glyphMap> = {
  PLANNED: 'time-outline',
  ACTIVE: 'play-circle-outline',
  ON_HOLD: 'pause-circle-outline',
  COMPLETED: 'checkmark-circle-outline',
  CLOSED: 'checkmark-circle-outline',
};

/** How a project's status Pill looks: its meaning's colours (`statusTone('project', …)`) with a shape of its own. */
export function projectStatusPill(status: ProjectStatus): { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } {
  const { fg, bg } = toneOf('project', status);
  return { fg, bg, icon: ICON[status] ?? 'time-outline' };
}
