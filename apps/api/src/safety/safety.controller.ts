import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafetyService } from './safety.service';
import {
  CloseIncidentDto,
  ClosePermitDto,
  CreateIncidentDto,
  CreatePermitDto,
  CreateTalkDto,
  IssuePermitDto,
  ListIncidentsQuery,
  ListPermitsQuery,
  ListTalksQuery,
  RejectPermitDto,
  SafetySummaryQuery,
  UpdateIncidentDto,
  UpdatePermitDto,
  UpdateTalkDto,
} from './safety.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('safety')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
  constructor(private safety: SafetyService) {}

  @ApiOperation({ summary: 'Safety at a glance', description: 'Incidents and near misses this month, open incidents, days since the last lost-time injury, toolbox talks this month, permits waiting, live and expired.' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: SafetySummaryQuery) {
    return this.safety.summary(user, q.projectId);
  }

  /* ---------- incidents ---------- */

  @ApiOperation({ summary: 'Incident and near-miss register', description: 'Newest first.' })
  @Get('incidents')
  listIncidents(@CurrentUser() user: RequestUser, @Query() q: ListIncidentsQuery) {
    return this.safety.listIncidents(user, q);
  }

  @Get('incidents/:id')
  getIncident(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.getIncident(user, id);
  }

  @Get('incidents/:id/history')
  incidentHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.incidentHistory(user, id);
  }

  @ApiOperation({
    summary: 'Report an incident or near miss',
    description: 'Site roles. Numbered INC-<year>-0001. Tells the project’s safety officers, and for anything worse than a near miss its approvers too. Send a client `id` to make retries safe.',
  })
  @Post('incidents')
  createIncident(@CurrentUser() user: RequestUser, @Body() dto: CreateIncidentDto) {
    return this.safety.createIncident(user, dto);
  }

  @ApiOperation({ summary: 'Change an incident', description: 'The reporter while it is open; the safety officer or an approver at any time.' })
  @Patch('incidents/:id')
  updateIncident(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.safety.updateIncident(user, id, dto);
  }

  @ApiOperation({ summary: 'Close an incident', description: 'Safety officer or approver; needs the root cause and the corrective action.' })
  @Post('incidents/:id/close')
  closeIncident(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CloseIncidentDto) {
    return this.safety.closeIncident(user, id, dto);
  }

  @Post('incidents/:id/reopen')
  reopenIncident(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.reopenIncident(user, id);
  }

  @ApiOperation({ summary: 'Delete an incident entered by mistake (safety officer or approver)' })
  @Delete('incidents/:id')
  removeIncident(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.removeIncident(user, id);
  }

  /* ---------- toolbox talks ---------- */

  @Get('talks')
  listTalks(@CurrentUser() user: RequestUser, @Query() q: ListTalksQuery) {
    return this.safety.listTalks(user, q);
  }

  @Get('talks/:id')
  getTalk(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.getTalk(user, id);
  }

  @ApiOperation({ summary: 'Record a toolbox talk', description: 'Site roles. Numbered TBT-<year>-0001; attach a photo of the signed attendance sheet.' })
  @Post('talks')
  createTalk(@CurrentUser() user: RequestUser, @Body() dto: CreateTalkDto) {
    return this.safety.createTalk(user, dto);
  }

  @Patch('talks/:id')
  updateTalk(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateTalkDto) {
    return this.safety.updateTalk(user, id, dto);
  }

  @Delete('talks/:id')
  removeTalk(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.removeTalk(user, id);
  }

  /* ---------- permits to work ---------- */

  @ApiOperation({ summary: 'Permits to work', description: '`active` lists those requested or issued; `expired` on each says an issued permit is past its end.' })
  @Get('permits')
  listPermits(@CurrentUser() user: RequestUser, @Query() q: ListPermitsQuery) {
    return this.safety.listPermits(user, q);
  }

  @Get('permits/:id')
  getPermit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.getPermit(user, id);
  }

  @Get('permits/:id/history')
  permitHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.permitHistory(user, id);
  }

  @ApiOperation({ summary: 'Ask for a permit to work', description: 'Site roles. Numbered PTW-<year>-0001, valid at most 7 days. Tells the project’s safety officers and approvers.' })
  @Post('permits')
  createPermit(@CurrentUser() user: RequestUser, @Body() dto: CreatePermitDto) {
    return this.safety.createPermit(user, dto);
  }

  @ApiOperation({ summary: 'Change a permit request (before it is issued)' })
  @Patch('permits/:id')
  updatePermit(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePermitDto) {
    return this.safety.updatePermit(user, id, dto);
  }

  @ApiOperation({ summary: 'Issue a permit (safety officer or approver)', description: 'The work may start. Tells the requester.' })
  @Post('permits/:id/issue')
  issuePermit(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: IssuePermitDto) {
    return this.safety.issuePermit(user, id, dto);
  }

  @ApiOperation({ summary: 'Reject a permit request (safety officer or approver)' })
  @Post('permits/:id/reject')
  rejectPermit(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RejectPermitDto) {
    return this.safety.rejectPermit(user, id, dto);
  }

  @ApiOperation({ summary: 'Close an issued permit when the work is done', description: 'The requester, the safety officer or an approver.' })
  @Post('permits/:id/close')
  closePermit(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ClosePermitDto) {
    return this.safety.closePermit(user, id, dto);
  }

  @Delete('permits/:id')
  removePermit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.removePermit(user, id);
  }
}
