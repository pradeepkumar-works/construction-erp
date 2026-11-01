import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { CommentsService } from './comments.service';
import { CommentTargetQuery, CreateCommentDto, UpdateCommentDto } from './comments.dto';

/** Comments and mentions on a record. Every route answers with the record's threads as they now stand. */
@ApiTags('comments')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private comments: CommentsService) {}

  @ApiOperation({ summary: 'A record’s comment threads: open ones first, the latest word on top, then the resolved ones' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: CommentTargetQuery) {
    return this.comments.list(user, q.kind, q.entityId);
  }

  @ApiOperation({ summary: 'Staff who see the record’s project, to mention' })
  @Get('people')
  people(@CurrentUser() user: RequestUser, @Query() q: CommentTargetQuery) {
    return this.comments.people(user, q.kind, q.entityId);
  }

  @ApiOperation({ summary: 'Start a thread, or reply to one with `parentId`; those mentioned (as @Full Name) and those in the thread are told' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCommentDto) {
    return this.comments.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit your comment; anyone newly mentioned is told' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommentDto) {
    return this.comments.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove your comment (an admin may remove anyone’s)' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.remove(user, id);
  }

  @ApiOperation({ summary: 'Mark a thread resolved' })
  @Post(':id/resolve')
  resolve(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.resolve(user, id, true);
  }

  @ApiOperation({ summary: 'Open a resolved thread again' })
  @Post(':id/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.resolve(user, id, false);
  }
}
