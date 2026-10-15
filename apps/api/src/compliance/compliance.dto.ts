import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { COMPLIANCE_DOC_KINDS, COMPLIANCE_DOC_STATUSES, type ComplianceDocKind, type ComplianceDocStatus, type ExpiryState } from '@erp/shared';

const dateOnly = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a YYYY-MM-DD date' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
/** null clears an optional field on PATCH; undefined leaves it. */
const nullable = () => ValidateIf((_, v) => v !== null);

export class ListComplianceQuery {
  @ApiPropertyOptional({ enum: COMPLIANCE_DOC_KINDS }) @IsOptional() @IsIn(COMPLIANCE_DOC_KINDS) kind?: ComplianceDocKind;
  @ApiPropertyOptional({ enum: [...COMPLIANCE_DOC_STATUSES, 'ALL'], default: 'ACTIVE' }) @IsOptional() @IsIn([...COMPLIANCE_DOC_STATUSES, 'ALL']) status?: ComplianceDocStatus | 'ALL';
  @ApiPropertyOptional({ enum: ['EXPIRING', 'EXPIRED'], description: 'Only active entries expiring within 30 days, or past expiry' })
  @IsOptional()
  @IsIn(['EXPIRING', 'EXPIRED'])
  state?: Exclude<ExpiryState, 'VALID'>;
  @ApiPropertyOptional({ description: 'A project id, or "none" for company-wide entries' }) @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional({ description: 'Searches the number, issuer, beneficiary and kind' }) @IsOptional() @trim() @IsString() @MaxLength(80) q?: string;
}

class DocFields {
  @ApiPropertyOptional({ example: 'Performance guarantee' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(80) category?: string | null;
  @ApiPropertyOptional({ example: 'State Bank of India, Cuttack Main' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(120) issuer?: string | null;
  @ApiPropertyOptional({ description: 'Empty for a company-wide entry' }) @IsOptional() @nullable() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ example: 'Executive Engineer, R&B Division, Cuttack' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(160) beneficiary?: string | null;
  @ApiPropertyOptional({ example: '4250000', description: 'Guarantee or EMD amount, sum insured, or licence fee' }) @IsOptional() @nullable() @num() @IsNumberString() amount?: string | null;
  @ApiPropertyOptional({ example: '1062500', description: 'Margin money the bank holds against a guarantee' }) @IsOptional() @nullable() @num() @IsNumberString() margin?: string | null;
  @ApiPropertyOptional({ example: '2026-04-01' }) @IsOptional() @nullable() @IsDateString() @dateOnly() issuedOn?: string | null;
  @ApiPropertyOptional({ example: '2027-03-31' }) @IsOptional() @nullable() @IsDateString() @dateOnly() expiresOn?: string | null;
  @ApiPropertyOptional({ example: '2027-09-30', description: 'Claim period end of a guarantee' }) @IsOptional() @nullable() @IsDateString() @dateOnly() claimUntil?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @trim() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Scans uploaded through /uploads; on PATCH the complete set' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

export class CreateComplianceDocDto extends DocFields {
  @ApiProperty({ enum: COMPLIANCE_DOC_KINDS }) @IsIn(COMPLIANCE_DOC_KINDS) kind: ComplianceDocKind;
  @ApiProperty({ example: 'BG/0412/2026', description: 'Guarantee, receipt, policy or licence number' }) @trim() @IsString() @MinLength(1) @MaxLength(80) reference: string;
}

export class UpdateComplianceDocDto extends DocFields {
  @ApiPropertyOptional({ example: 'BG/0412/2026' }) @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(80) reference?: string;
}

export class RenewComplianceDocDto {
  @ApiPropertyOptional({ example: 'BG/0981/2027', description: 'The new number; the old one when omitted' }) @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(80) reference?: string;
  @ApiPropertyOptional({ example: '2027-04-01', description: 'The day after the old expiry when omitted' }) @IsOptional() @IsDateString() @dateOnly() issuedOn?: string;
  @ApiProperty({ example: '2028-03-31' }) @IsDateString() @dateOnly() expiresOn: string;
  @ApiPropertyOptional({ example: '2028-09-30' }) @IsOptional() @IsDateString() @dateOnly() claimUntil?: string;
  @ApiPropertyOptional({ example: '4250000', description: 'The old amount when omitted' }) @IsOptional() @num() @IsNumberString() amount?: string;
  @ApiPropertyOptional({ description: 'The old margin when omitted' }) @IsOptional() @num() @IsNumberString() margin?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) attachmentIds?: string[];
}

export class CloseComplianceDocDto {
  @ApiPropertyOptional({ example: '2026-10-15', description: 'Today when omitted' }) @IsOptional() @IsDateString() @dateOnly() date?: string;
  @ApiPropertyOptional({ example: 'Returned by the client after the defect liability period' }) @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}
