import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PpeService } from './ppe.service';
import { ClosePpeDto, IssuePpeDto, ListPpeQuery, SetPpeRequiredDto } from './ppe.dto';
import { ModuleSwitch } from '../common/decorators';

@ApiTags('ppe')
@ApiBearerAuth()
@ModuleSwitch('safety')
@Controller('ppe')
export class PpeController {
  constructor(private ppe: PpeService) {}

  @ApiOperation({
    summary: "A project's PPE register",
    description: "Its active workers with the kit they hold (and what is due for replacement) and the required kit they lack, today's roll call, and totals by labour contractor. Anyone with access to the project.",
  })
  @Get('projects/:id/register')
  register(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ppe.register(user, id);
  }

  @ApiOperation({ summary: 'Set the kit every worker at the project must have', description: 'The safety officer or an approver.' })
  @Put('projects/:id/required')
  setRequired(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPpeRequiredDto) {
    return this.ppe.setRequired(user, id, dto);
  }

  @ApiOperation({ summary: 'PPE issues, newest first', description: 'Filter by project, worker, status, kind, due for replacement or to recover from the contractor.' })
  @Get('issues')
  list(@CurrentUser() user: RequestUser, @Query() q: ListPpeQuery) {
    return this.ppe.list(user, q);
  }

  @ApiOperation({ summary: 'One PPE issue' })
  @Get('issues/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ppe.get(user, id);
  }

  @ApiOperation({
    summary: 'Issue PPE to workers',
    description: 'Each worker gets each kind. An item of the same kind a worker still holds is marked replaced. The safety officer, stores, site staff or an approver; workers must be on the project\'s roll. `id` makes a retried batch issue nothing twice.',
  })
  @Post('issues')
  issue(@CurrentUser() user: RequestUser, @Body() dto: IssuePpeDto) {
    return this.ppe.issue(user, dto);
  }

  @ApiOperation({ summary: 'Record an item returned or lost', description: 'Lost items are to be recovered from the contractor unless `recoverable` says otherwise.' })
  @Post('issues/:id/close')
  close(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClosePpeDto) {
    return this.ppe.close(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a PPE issue entered by mistake', description: 'Whoever issued it, the safety officer or an approver.' })
  @Delete('issues/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ppe.remove(user, id);
  }
}
