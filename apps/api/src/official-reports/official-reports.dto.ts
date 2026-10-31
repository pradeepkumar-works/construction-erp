import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OFFICIAL_REPORT_KINDS, type OfficialReportKind } from '@erp/shared';

export class OfficialReportQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ enum: OFFICIAL_REPORT_KINDS }) @IsIn([...OFFICIAL_REPORT_KINDS]) kind: OfficialReportKind;
  @ApiProperty({ example: '2026-10-30', description: 'A day in the period: the day, its Monday-to-Sunday week, or its month' }) @IsDateString() date: string;
}

export class IssueOfficialReportDto extends OfficialReportQuery {
  @ApiPropertyOptional({ description: 'Why it is issued or re-issued, for the register' }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class OfficialIssuesQuery {
  @ApiProperty() @IsUUID() projectId: string;
}
