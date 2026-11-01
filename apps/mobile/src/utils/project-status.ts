import type { Ionicons } from '@expo/vector-icons';
import type { ProjectStatus } from '@erp/shared';
import { colors } from '../theme';

/** How a project's status Pill looks: only a project on hold shows paused, a finished one a tick. */
export function projectStatusPill(status: ProjectStatus): { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case 'ACTIVE':
      return { fg: colors.success, bg: colors.successSoft, icon: 'play-circle-outline' };
    case 'ON_HOLD':
      return { fg: colors.neutral, bg: colors.neutralSoft, icon: 'pause-circle-outline' };
    case 'COMPLETED':
    case 'CLOSED':
      return { fg: colors.neutral, bg: colors.neutralSoft, icon: 'checkmark-circle-outline' };
    default:
      return { fg: colors.neutral, bg: colors.neutralSoft, icon: 'time-outline' };
  }
}
