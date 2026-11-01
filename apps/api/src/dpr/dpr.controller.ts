import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DprService } from './dpr.service';
import { DprChecksService } from './dpr-checks.service';
import { CreateDprDto, DprWorkOptionsQuery, ListDprQuery, UpdateDprDto } from './dpr.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { DprFormsService } from '../templates/dpr-forms.service';

@ApiTags('dpr')
@ApiBearerAuth()
@Controller('dpr')
export class DprController {
  constructor(
    private dpr: DprService,
    private forms: DprFormsService,
    private checks: DprChecksService,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListDprQuery) {
    return this.dpr.list(user, q);
  }

  @ApiOperation({
    summary: "What a project's DPR form offers",
    description: "The project type's DPR form and the project's places; the activities and sub-activities that take progress (look-ahead ones first), each with its component, scope, quantity done and material norms; the store items; the open work orders; and whether the company records progress only in the DPR.",
  })
  @Get('work-options')
  workOptions(@CurrentUser() user: RequestUser, @Query() q: DprWorkOptionsQuery) {
    return this.dpr.workOptions(user, q);
  }

  @ApiOperation({ summary: 'DPR form versions by id', description: 'The forms the reports of a list were made on, so an export can name their own fields. `ids` is comma-separated; up to 200.' })
  @Get('forms')
  formsById(@CurrentUser() user: RequestUser, @Query('ids') ids?: string) {
    return this.forms.byIds(user.organizationId, (ids ?? '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)));
  }

  @ApiOperation({
    summary: 'Credibility checks on a DPR (intelligence quick win Q3)',
    description: 'For those who approve daily reports: work with no crew, work whose material was not issued in the week to it, quantities or crews the same as on the reports before, and photos that came with an earlier report. Advice only; nothing here stops an approval.',
  })
  @Get(':id/checks')
  checksOf(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.checks.forReport(user, id);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dpr.get(user, id);
  }

  @ApiOperation({
    summary: 'Record a DPR',
    description: 'With `lines`, the work done line by line: each line becomes a progress entry of the DPR, submitted, approved and sent back with it. `workExecuted` is then written from the lines when left out.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDprDto) {
    return this.dpr.create(user, dto);
  }

  @ApiOperation({
    summary: 'Edit a DPR',
    description:
      'Allowed for the author while DRAFT / REJECTED / CHANGES_REQUESTED and for approvers until APPROVED. ' +
      '`attachmentIds`, when sent, becomes the complete list of photos (omitted ones are detached). ' +
      'Send `submit: true` to resubmit for approval in the same call.',
  })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateDprDto) {
    return this.dpr.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a DPR for approval', description: 'From DRAFT, REJECTED or CHANGES_REQUESTED. Clears the previous review and logs SUBMITTED / RESUBMITTED in the audit trail.' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dpr.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dpr.remove(user, id);
  }
}
