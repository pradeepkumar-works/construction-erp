import dayjs, { type Dayjs } from 'dayjs';
import { recentFinancialYears } from '@erp/shared';

/**
 * Quick ranges for date-range filters: this and last month, and the last three financial years (April to March). Pass to a RangePicker's `presets`.
 */
export function rangePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs();
  const years = recentFinancialYears(today.format('YYYY-MM-DD'), 3);
  return [
    { label: 'This month', value: [today.startOf('month'), today.endOf('month')] },
    { label: 'Last month', value: [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')] },
    ...years.map((y) => ({ label: y.label, value: [dayjs(y.from), dayjs(y.to)] as [Dayjs, Dayjs] })),
  ];
}
