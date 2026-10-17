import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { BriefsService } from './briefs.service';
import { BriefOptInDto } from './briefs.dto';

@ApiTags('briefs')
@ApiBearerAuth()
@Controller('briefs')
export class BriefsController {
  constructor(private briefs: BriefsService) {}

  @ApiOperation({
    summary: "The caller's morning brief for today",
    description: 'Whether the brief is offered (Ask Nirmaan on for the company), whether the caller asked for it, and the three lines written overnight from their own My work.',
  })
  @Get('today')
  today(@CurrentUser() user: RequestUser) {
    return this.briefs.today(user);
  }

  @ApiOperation({ summary: 'Ask for the morning brief, or stop it', description: "The caller's own choice. Turning it on writes today's brief at once." })
  @Put('me')
  setOptIn(@CurrentUser() user: RequestUser, @Body() dto: BriefOptInDto) {
    return this.briefs.setOptIn(user, dto.morningBrief);
  }
}
