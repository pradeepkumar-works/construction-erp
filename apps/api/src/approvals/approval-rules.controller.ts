import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';
import { ApprovalRulesService } from './approval-rules.service';
import { SaveApprovalRulesDto } from './approval-rules.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('approval-rules')
export class ApprovalRulesController {
  constructor(private rules: ApprovalRulesService) {}

  @ApiOperation({ summary: 'Approval matrix (admin)', description: '`custom: false` means the fixed rule applies: admin, management and project managers approve everything with no limit.' })
  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.rules.get(user);
  }

  @ApiOperation({
    summary: 'Replace the approval matrix (admin)',
    description: 'Send every rule. A role not listed for a type cannot approve it. maxAmount applies to progress, expenses, measurements and machinery logs. An empty list goes back to the fixed rule. Admin can always approve everything.',
  })
  @Put()
  save(@CurrentUser() user: RequestUser, @Body() dto: SaveApprovalRulesDto) {
    return this.rules.save(user, dto);
  }
}
