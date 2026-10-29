import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { DesignSubmissionsService } from './design-submissions.service';
import { DesignSubmissionsQuery, RecordDesignCodeDto, ReplyCommentDto, SaveDesignSubmissionDto, SubmitDesignDto, WithdrawDesignDto } from './design-submissions.dto';

/** Design and drawings part 2 (item 138): design submissions for approval or vetting, their codes and the comment replies. */
@ApiTags('design')
@ApiBearerAuth()
@Controller('design/submissions')
export class DesignSubmissionsController {
  constructor(private submissions: DesignSubmissionsService) {}

  @ApiOperation({ summary: 'Design submissions, late reviews first, with the summary over the filter' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: DesignSubmissionsQuery) {
    return this.submissions.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.submissions.get(user, id);
  }

  @ApiOperation({ summary: 'Raise a design submission (a draft) with the documents it sends' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: SaveDesignSubmissionDto) {
    return this.submissions.create(user, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveDesignSubmissionDto) {
    return this.submissions.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.submissions.remove(user, id);
  }

  @ApiOperation({ summary: 'Send it (again): a round of the current revisions, with a draft covering letter when asked' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitDesignDto) {
    return this.submissions.submit(user, id, dto);
  }

  @ApiOperation({ summary: 'Record the code (A to D) it came back with and the comments' })
  @Post(':id/code')
  code(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordDesignCodeDto) {
    return this.submissions.recordCode(user, id, dto);
  }

  @ApiOperation({ summary: 'Reply to a comment' })
  @Post(':id/comments/:commentId/reply')
  reply(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('commentId', ParseUUIDPipe) commentId: string, @Body() dto: ReplyCommentDto) {
    return this.submissions.reply(user, id, commentId, dto);
  }

  @ApiOperation({ summary: 'Close an answered comment (the reviewer accepts it)' })
  @Post(':id/comments/:commentId/close')
  close(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('commentId', ParseUUIDPipe) commentId: string) {
    return this.submissions.setClosed(user, id, commentId, true);
  }

  @Post(':id/comments/:commentId/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('commentId', ParseUUIDPipe) commentId: string) {
    return this.submissions.setClosed(user, id, commentId, false);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawDesignDto) {
    return this.submissions.withdraw(user, id, dto);
  }

  @ApiOperation({ summary: "Record a review by the client's side past its reply-by date as a delay in the risk register" })
  @Post(':id/delay')
  delay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.submissions.recordDelay(user, id);
  }
}
