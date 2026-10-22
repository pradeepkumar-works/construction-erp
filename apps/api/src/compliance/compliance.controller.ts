import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ComplianceService } from './compliance.service';
import { CloseComplianceDocDto, CreateComplianceDocDto, ListComplianceQuery, RenewComplianceDocDto, UpdateComplianceDocDto } from './compliance.dto';
import { ModuleSwitch } from '../common/decorators';

@ApiTags('compliance')
@ApiBearerAuth()
@ModuleSwitch('compliance')
@Controller('compliance-docs')
export class ComplianceController {
  constructor(private compliance: ComplianceService) {}

  @ApiOperation({
    summary: 'Guarantees, EMDs, insurance policies and licences, soonest expiry first, with totals',
    description: 'Accounts and admins see all; project managers the entries of their projects. Active entries unless `status` says otherwise.',
  })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListComplianceQuery) {
    return this.compliance.list(user, q);
  }

  @ApiOperation({ summary: 'One entry with the earlier entries it renewed' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.compliance.get(user, id);
  }

  @ApiOperation({ summary: 'Add a guarantee, EMD, insurance policy or licence', description: 'Accounts and admins.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateComplianceDocDto) {
    return this.compliance.create(user, dto);
  }

  @ApiOperation({ summary: 'Correct an entry; null clears a field' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateComplianceDocDto) {
    return this.compliance.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Renew: a new entry with the new period replaces this one, which is kept as renewed' })
  @Post(':id/renew')
  renew(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RenewComplianceDocDto) {
    return this.compliance.renew(user, id, dto);
  }

  @ApiOperation({ summary: 'Released: guarantee returned, EMD refunded, policy cancelled or licence surrendered' })
  @Post(':id/release')
  release(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CloseComplianceDocDto) {
    return this.compliance.release(user, id, dto);
  }

  @ApiOperation({ summary: 'Invoked: guarantee encashed or EMD forfeited' })
  @Post(':id/invoke')
  invoke(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CloseComplianceDocDto) {
    return this.compliance.invoke(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an entry made by mistake (a renewal: the entry it replaced is active again)' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.compliance.remove(user, id);
  }
}
