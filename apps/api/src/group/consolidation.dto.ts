import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CONSOLIDATION_BASES, type ConsolidationBasis } from '@erp/shared';

export class ConsolidationQuery {
  @ApiProperty({ example: '2026-04-01', description: 'The profit and loss from this day' }) @IsDateString() from: string;
  @ApiProperty({ example: '2026-11-10', description: 'The profit and loss to this day, and the balance sheet as on it' }) @IsDateString() to: string;
  @ApiPropertyOptional({ enum: CONSOLIDATION_BASES, description: "BOOKS (default): every company to the period's end. LOCK: each company stops at its own lock." })
  @IsOptional()
  @IsIn(CONSOLIDATION_BASES as unknown as string[], { message: 'Choose the period end or each company’s lock' })
  basis?: ConsolidationBasis;
}

/** A vendor or a client of this company that is a sister company: exactly one of the two. */
export class SisterLinkDto {
  @ApiPropertyOptional() @ValidateIf((o: SisterLinkDto) => !o.clientId) @IsUUID('4', { message: 'Choose the vendor or the client' }) vendorId?: string;
  @ApiPropertyOptional() @ValidateIf((o: SisterLinkDto) => !o.vendorId) @IsUUID('4', { message: 'Choose the vendor or the client' }) clientId?: string;
  @ApiProperty() @IsUUID('4', { message: 'Choose the sister company' }) sisterId: string;
}
