import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsNumber, IsOptional, IsUUID, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { QueryBool } from '../common/paging';

const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const Amount = () => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter an amount in rupees' }), Min(0), Max(100_000_000_000)].forEach((d) => d(target, key));

export class PeriodQuery {
  @ApiProperty({ example: '2026-04-01' }) @IsDateString() from: string;
  @ApiProperty({ example: '2027-03-31' }) @IsDateString() to: string;
  @ApiPropertyOptional({ description: 'Only lines of this project (cost centre)' }) @IsOptional() @IsUUID() projectId?: string;
}

export class ProfitLossQuery extends PeriodQuery {
  @ApiPropertyOptional({ description: 'Also each project’s figures' }) @IsOptional() @QueryBool() byProject?: boolean;
}

export class AsOnQuery {
  @ApiProperty({ example: '2027-03-31' }) @IsDateString() asOn: string;
}

export class BankQuery {
  @ApiProperty() @IsUUID() accountId: string;
  @ApiProperty({ example: '2026-10-31' }) @IsDateString() asOn: string;
  @ApiPropertyOptional({ description: 'Show matched lines from this day; unmatched ones show from any day' }) @IsOptional() @IsDateString() from?: string;
}

export class BankAccountDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the bank account' }) accountId: string;
}

export class BankImportDto extends BankAccountDto {
  @ApiProperty({ description: 'The statement file’s cells, row by row, as the bank gives them' })
  @IsArray()
  @ArrayMaxSize(20_000, { message: 'The file has more than 20,000 rows. Import it a few months at a time.' })
  cells: unknown[][];
}

export class BankMatchDto {
  @ApiProperty() @IsUUID() statementLineId: string;
  @ApiProperty() @IsUUID() bookLineId: string;
}

export class BankUnmatchDto {
  @ApiProperty() @IsUUID() statementLineId: string;
}

export class OpeningLineInput {
  @ApiProperty() @IsUUID('4', { message: 'Choose the account' }) accountId: string;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount() debit?: number | null;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount() credit?: number | null;
}

export class SaveOpeningDto {
  @ApiProperty({ description: 'The day the books begin; the opening balances are as on the day before', example: '2026-04-01' }) @IsDateString({}, { message: 'Choose the day the books begin' }) booksFrom: string;
  @ApiProperty({ type: [OpeningLineInput] }) @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => OpeningLineInput) lines: OpeningLineInput[];
}

export class LockDto {
  @ApiPropertyOptional({ description: 'Nothing posts or changes on or before this day; null takes the lock off', nullable: true }) @IsOptional() @opt() @IsDateString() lockedUpTo: string | null;
}
