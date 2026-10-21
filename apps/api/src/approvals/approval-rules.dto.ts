import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { ROLE_KEYS, SUBMISSION_TYPES, type RoleKey, type SubmissionType } from '@erp/shared';

const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));

export class ApprovalRuleItemDto {
  @ApiProperty({ example: 'PROJECT_MANAGER', enum: ROLE_KEYS }) @IsIn(ROLE_KEYS) roleKey: RoleKey;
  @ApiProperty({ example: 'EXPENSE', enum: SUBMISSION_TYPES }) @IsIn(SUBMISSION_TYPES) type: SubmissionType;
  @ApiPropertyOptional({ example: '25000', nullable: true, description: 'Highest amount in rupees this role may approve; null or omitted = no limit' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, { message: 'maxAmount must be a rupee amount with up to 2 decimals' })
  maxAmount?: string | null;
}

export class SaveApprovalRulesDto {
  @ApiPropertyOptional({ type: [ApprovalRuleItemDto], description: 'The whole matrix. An empty list goes back to the fixed rule. Admin rows are ignored (admin always approves everything). Left out: the matrix stays as it is.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROLE_KEYS.length * SUBMISSION_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleItemDto)
  rules?: ApprovalRuleItemDto[];

  @ApiPropertyOptional({ description: 'Accounts pays a bill only against an approved payment request (v5 item 90)' }) @IsOptional() @IsBoolean() paymentsNeedRequest?: boolean;
}
