import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DprService } from './dpr.service';
import { CreateDprDto, ListDprQuery, UpdateDprDto } from './dpr.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('dpr')
@ApiBearerAuth()
@Controller('dpr')
export class DprController {
  constructor(private dpr: DprService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListDprQuery) {
    return this.dpr.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dpr.get(user, id);
  }

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
