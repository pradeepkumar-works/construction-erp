/** Release notes for Help > What's new, newest first. Add an entry when a change people will notice ships. */
export interface WhatsNew {
  /** Stable id; the newest one unseen puts a dot on the Help button. */
  id: string;
  date: string;
  title: string;
  points: string[];
}

export const WHATS_NEW: WhatsNew[] = [
  {
    id: '2026-10-lists',
    date: '2026-10-16',
    title: 'Better lists',
    points: [
      'Daily reports, progress, material requests, purchase orders and RA bills have views across the top: Waiting for me, Mine, Sent back, This week.',
      'Save your own filters as a view, and share it with the company if it helps others.',
      'Filter by dates, hide the columns you do not need, and click anywhere on a row to open it.',
      'Tick rows to approve or export several at once. Money lists show a total for the page.',
      'The filters are in the address bar, so a filtered list can be bookmarked or sent to someone.',
    ],
  },
  {
    id: '2026-10-shell',
    date: '2026-10-16',
    title: 'A new header',
    points: [
      'Pick a project at the top left and every list shows that project only, until you switch back to All projects.',
      '+ New starts a daily report, progress entry, material request and more from any page.',
      'Star a page or a project to keep it under Favourites in the sidebar; Recent has the last few you opened.',
      'Help has the keyboard shortcuts (press ?), these notes and the tour.',
    ],
  },
  {
    id: '2026-10-appearance',
    date: '2026-10-16',
    title: 'Dark mode and compact density',
    points: ['Your name at the top right > Appearance: Light, Dark or the same as your device.', 'Density: Compact fits more rows on a screen.'],
  },
  {
    id: '2026-10-review',
    date: '2026-10-16',
    title: 'Tidier pages',
    points: ['The header says where you are.', 'Stock tables show item names in full.', 'Approvals say how long ago each entry was sent.'],
  },
];
