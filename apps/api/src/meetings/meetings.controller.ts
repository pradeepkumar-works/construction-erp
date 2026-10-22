import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto, MeetingActionQuery, MeetingQuery, UpdateActionDto, UpdateMeetingDto } from './meetings.dto';
import { ModuleSwitch } from '../common/decorators';

/** Meetings and action items (v6 item 112): minutes of a project's meetings and the actions they leave open. */
@ApiTags('meetings')
@ApiBearerAuth()
@ModuleSwitch('meetings')
@Controller('meetings')
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @ApiOperation({ summary: 'Meetings on the caller’s projects, latest first, with the month’s figures and open actions' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: MeetingQuery) {
    return this.meetings.list(user, q);
  }

  @ApiOperation({ summary: 'Actions across the meetings: open ones by due date (the default), overdue, done or all; `mine` for the caller’s own' })
  @Get('actions')
  actions(@CurrentUser() user: RequestUser, @Query() q: MeetingActionQuery) {
    return this.meetings.actions(user, q);
  }

  @ApiOperation({ summary: 'Close, drop or reopen an action, or move its due date' })
  @Patch('actions/:actionId')
  updateAction(@CurrentUser() user: RequestUser, @Param('actionId', ParseUUIDPipe) actionId: string, @Body() dto: UpdateActionDto) {
    return this.meetings.updateAction(user, actionId, dto);
  }

  @ApiOperation({ summary: 'The RFIs, NCRs and variations of a project an action can be about' })
  @Get('link-options/:projectId')
  linkOptions(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.meetings.linkOptions(user, projectId);
  }

  @ApiOperation({ summary: 'A meeting with its attendees, minutes, actions and the actions still open from earlier meetings' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(user, id);
  }

  @ApiOperation({ summary: 'Record a meeting (a draft until its minutes are issued)' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(user, dto);
  }

  @ApiOperation({ summary: 'Change a draft: its fields, and the attendees, points and actions as wholes' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a draft' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.remove(user, id);
  }

  @ApiOperation({ summary: 'Issue the minutes: fixed, emailed to everyone listed with an address, and the action owners told' })
  @Post(':id/issue')
  issue(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.issue(user, id);
  }

  @ApiOperation({ summary: 'Take issued minutes back to draft to correct them (managers)' })
  @Post(':id/revise')
  revise(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.revise(user, id);
  }
}
