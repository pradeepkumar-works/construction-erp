import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { MAX_APPROVAL_LEVELS, ROLE_KEYS, SUBMISSION_TYPES, type RoleKey, type SubmissionType } from '@erp/shared';

const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));

export class ApprovalRuleItemDto {
  @ApiPropertyOptional({ example: 'PROJECT_MANAGER', enum: ROLE_KEYS, nullable: true, description: 'The role that approves; give this or positionCode, not both' })
  @ValidateIf((o: ApprovalRuleItemDto) => o.roleKey != null || o.positionCode == null)
  @IsIn(ROLE_KEYS, { message: 'Give each rule a role or a position' })
  roleKey?: RoleKey | null;

  @ApiPropertyOptional({ example: 'site-in-charge', nullable: true, description: 'A code of the position master: whoever holds it on the entry\'s project or at head office approves; give this or roleKey, not both' })
  @ValidateIf((o: ApprovalRuleItemDto) => o.positionCode != null)
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'positionCode must be a code of the position list, such as site-in-charge' })
  positionCode?: string | null;

  @ApiProperty({ example: 'EXPENSE', enum: SUBMISSION_TYPES }) @IsIn(SUBMISSION_TYPES) type: SubmissionType;
  @ApiPropertyOptional({ example: '25000', nullable: true, description: 'Highest amount in rupees this role may approve; null or omitted = no limit' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, { message: 'maxAmount must be a rupee amount with up to 2 decimals' })
  maxAmount?: string | null;

  @ApiPropertyOptional({ example: 2, description: '1 (the default) is the first approval; 2 to 6 are further approvals of the same entry, in order' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_APPROVAL_LEVELS)
  level?: number;

  @ApiPropertyOptional({ example: '500000', nullable: true, description: 'Levels 2 to 6: the amount from which this level applies; null = always. Give every approver of a level the same amount.' })
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
  @ApiPropertyOptional({ example: 48, nullable: true, description: "After this many hours the next level's approvers (management above the top level) may decide it too, and are told" })
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
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleItemDto)
  rules?: ApprovalRuleItemDto[];

  @ApiPropertyOptional({ description: 'Accounts pays a bill only against an approved payment request' }) @IsOptional() @IsBoolean() paymentsNeedRequest?: boolean;

  @ApiPropertyOptional({ description: 'Progress is recorded only as DPR work lines' }) @IsOptional() @IsBoolean() progressFromDpr?: boolean;

  @ApiPropertyOptional({ description: 'A purchase order on a material request waits for its supplier choice (Finalise L1) to be approved' }) @IsOptional() @IsBoolean() ordersNeedApprovedChoice?: boolean;

  @ApiPropertyOptional({ type: [ApprovalEscalationItemDto], description: 'Reminders and escalation per type, the whole list; types left out have neither. Left out: they stay as they are.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SUBMISSION_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => ApprovalEscalationItemDto)
  escalations?: ApprovalEscalationItemDto[];
}
