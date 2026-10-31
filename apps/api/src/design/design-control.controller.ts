import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { DesignControlService } from './design-control.service';
import { CopiesQuery, DesignDashboardQuery, DisposeCopyDto, IssueCopiesDto, ReissueCopyDto } from './design-control.dto';

/** Design and drawings part 3: controlled copies, what a new revision changes and the design dashboard. */
@ApiTags('design')
@ApiBearerAuth()
@Controller('design')
export class DesignControlController {
  constructor(private control: DesignControlService) {}

  @ApiOperation({ summary: 'Controlled copies out on site, superseded ones first', description: 'Without a state: the copies not yet taken back (all of a document’s with documentId).' })
  @Get('copies')
  copies(@CurrentUser() user: RequestUser, @Query() q: CopiesQuery) {
    return this.control.copies(user, q);
  }

  @ApiOperation({ summary: 'Issue numbered copies of the document’s current revision, one per holder' })
  @Post('copies')
  issue(@CurrentUser() user: RequestUser, @Body() dto: IssueCopiesDto) {
    return this.control.issue(user, dto);
  }

  @ApiOperation({ summary: 'Give the holder of a superseded copy the current revision under the same number' })
  @Post('copies/:id/reissue')
  reissue(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReissueCopyDto) {
    return this.control.reissue(user, id, dto.issuedOn);
  }

  @ApiOperation({ summary: 'Record a copy returned, destroyed on site or reported lost' })
  @Post('copies/:id/take-back')
  dispose(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisposeCopyDto) {
    return this.control.dispose(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a copy issued by mistake (current revision, not taken back)' })
  @Delete('copies/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.control.remove(user, id);
  }

  @ApiOperation({ summary: 'What the document’s current revision changes: copies to recall, approvals, take-offs, marks and RFIs' })
  @Get('revision-impact/:documentId')
  impact(@CurrentUser() user: RequestUser, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.control.impact(user, documentId);
  }

  @ApiOperation({ summary: 'The design dashboard: every project’s drawings, submissions, copies, as-builts and RFIs, and the recent revisions' })
  @Get('dashboard')
  dashboard(@CurrentUser() user: RequestUser, @Query() q: DesignDashboardQuery) {
    return this.control.dashboard(user, q.projectId);
  }
}
