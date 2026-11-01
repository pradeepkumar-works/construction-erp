import { todayIn } from '../src/notifications/time';

/**
 * The demo's "today" is the sites' day (India), the one the API reads through `todayIn`. A UTC date runs a day behind
 * from 18:30 UTC, and on a month's last evening the seed's "this month" would be a month behind the API's.
 */
export const seedToday = (): string => todayIn();

/** Midnight UTC of the sites' day `offset` days from today, the way the app stores a date. */
export const day = (offset: number): Date => {
  const d = new Date(`${seedToday()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
