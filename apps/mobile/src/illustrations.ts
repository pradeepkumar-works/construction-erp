import type { ImageSourcePropType } from 'react-native';

/** Nirmaan illustrations (assets/illustrations, drawn from the brand kit). PNG at 1x/2x/3x so no SVG library is needed. */
export const ILLUSTRATIONS = {
  projects: require('../assets/illustrations/empty-no-projects.png'),
  entries: require('../assets/illustrations/empty-no-entries.png'),
  approved: require('../assets/illustrations/empty-all-approved.png'),
  reportFromSite: require('../assets/illustrations/onboarding-report-from-site.png'),
  approveOnTheGo: require('../assets/illustrations/onboarding-approve-on-the-go.png'),
  billAndGetPaid: require('../assets/illustrations/onboarding-bill-and-get-paid.png'),
} satisfies Record<string, ImageSourcePropType>;

export type EmptyArt = 'projects' | 'entries' | 'approved';
