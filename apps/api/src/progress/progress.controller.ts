import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { CreateProgressDto, ListProgressQuery, UpdateProgressDto } from './progress.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('progress')
@ApiBearerAuth()
@Controller('progress')
export class ProgressController {
  constructor(private progress: ProgressService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListProgressQuery) {
    return this.progress.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.progress.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProgressDto) {
    return this.progress.create(user, dto);
  }

  @ApiOperation({
    summary: 'Edit a progress entry',
    description:
      'Allowed for the author while DRAFT / REJECTED / CHANGES_REQUESTED and for approvers until APPROVED. ' +
      '`attachmentIds`, when sent, becomes the complete list of photos (omitted ones are detached). ' +
      'Send `submit: true` to resubmit for approval in the same call.',
  })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateProgressDto) {
    return this.progress.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a progress entry for approval', description: 'From DRAFT, REJECTED or CHANGES_REQUESTED. Clears the previous review and logs SUBMITTED / RESUBMITTED in the audit trail.' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.progress.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.progress.remove(user, id);
  }
}
