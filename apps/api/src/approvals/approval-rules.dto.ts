import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { MAX_APPROVAL_LEVELS, ROLE_KEYS, SUBMISSION_TYPES, type RoleKey, type SubmissionType } from '@erp/shared';

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

  @ApiPropertyOptional({ example: 2, description: 'v5 item 94: 1 (the default) is the first approval; 2 and 3 are further approvals of the same entry' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_APPROVAL_LEVELS)
  level?: number;

  @ApiPropertyOptional({ example: '500000', nullable: true, description: 'Levels 2 and 3: the amount from which this level applies; null = always. Give every role of a level the same amount.' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, { message: 'minAmount must be a rupee amount with up to 2 decimals' })
  minAmount?: string | null;
}

export class ApprovalEscalationItemDto {
  @ApiProperty({ example: 'PURCHASE_ORDER', enum: SUBMISSION_TYPES }) @IsIn(SUBMISSION_TYPES) type: SubmissionType;
  @ApiPropertyOptional({ example: 24, nullable: true, description: 'Remind the approvers once an entry has waited this many hours at its level' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(720)
  remindAfterHours?: number | null;
  @ApiPropertyOptional({ example: 48, nullable: true, description: "After this many hours the next level's roles (management above the top level) may decide it too, and are told" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(720)
  escalateAfterHours?: number | null;
}

export class SaveApprovalRulesDto {
  @ApiPropertyOptional({ type: [ApprovalRuleItemDto], description: 'The whole matrix. An empty list goes back to the fixed rule. Admin rows are ignored (admin always approves everything). Left out: the matrix stays as it is.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROLE_KEYS.length * SUBMISSION_TYPES.length * MAX_APPROVAL_LEVELS)
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleItemDto)
  rules?: ApprovalRuleItemDto[];

  @ApiPropertyOptional({ description: 'Accounts pays a bill only against an approved payment request (v5 item 90)' }) @IsOptional() @IsBoolean() paymentsNeedRequest?: boolean;

  @ApiPropertyOptional({ description: 'Progress is recorded only as DPR work lines (item 127)' }) @IsOptional() @IsBoolean() progressFromDpr?: boolean;

  @ApiPropertyOptional({ description: 'A purchase order on a material request waits for its supplier choice (Finalise L1) to be approved' }) @IsOptional() @IsBoolean() ordersNeedApprovedChoice?: boolean;

  @ApiPropertyOptional({ type: [ApprovalEscalationItemDto], description: 'Reminders and escalation per type (v5 item 94), the whole list; types left out have neither. Left out: they stay as they are.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SUBMISSION_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => ApprovalEscalationItemDto)
  escalations?: ApprovalEscalationItemDto[];
}
