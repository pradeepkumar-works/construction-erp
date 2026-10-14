import { BadRequestException } from '@nestjs/common';

/** Refuse to change a record Tally already has: its export has to be undone first. */
export function assertNotExported(row: { tallyExportId: string | null }, what: string) {
  if (row.tallyExportId) throw new BadRequestException(`${what} is already exported to Tally. Undo that export under Billing → Tally Export first.`);
}
