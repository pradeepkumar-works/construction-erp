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
    description: 'Send every rule, each naming a role or a position. A role or position not listed for a type cannot approve it. Levels 2 to 6 apply from their minAmount, in order. maxAmount applies to types with an amount. An empty list goes back to the fixed rule. Admin can always approve everything.',
  })
  @Put()
  save(@CurrentUser() user: RequestUser, @Body() dto: SaveApprovalRulesDto) {
    return this.rules.save(user, dto);
  }
}
