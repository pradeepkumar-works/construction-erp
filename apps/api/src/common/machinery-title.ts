/** "EXC-01 Excavator: 7.5 h on 2026-10-13 (2 h breakdown)". Used in the approval queue and notifications. */
export const machineryTitle = (code: string, name: string, worked: string, breakdown: string, date: string) =>
  `${code} ${name}: ${Number(worked)} h on ${date}${Number(breakdown) > 0 ? ` (${Number(breakdown)} h breakdown)` : ''}`;

