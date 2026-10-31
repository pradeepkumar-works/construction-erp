import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ProgrammeService } from './programme.service';
import { EotService } from './eot.service';
import { ApplyEotDto, DecideEotDto, DecideProgrammeDto, ForwardEotDto, ProgrammeIntervalDto, SubmitProgrammeDto } from './programme.dto';

/** Programme revisions and extension of time applications (item 173), for the project's staff. Guests use `/portal`. */
@ApiTags('programme')
@ApiBearerAuth()
@Controller()
export class ProgrammeController {
  constructor(private programme: ProgrammeService, private eot: EotService) {}

  @ApiOperation({ summary: "A project's programme revisions, the next one due and the programme obligation" })
  @Get('projects/:id/programme')
  register(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.programme.register(user, id);
  }

  @ApiOperation({ summary: 'Send the next programme revision to the Engineer; the plan as it stands is kept with it' })
  @Post('projects/:id/programme')
  submit(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitProgrammeDto) {
    return this.programme.submit(user, id, dto);
  }

  @ApiOperation({ summary: 'How often the contract wants an updated programme' })
  @Patch('projects/:id/programme/interval')
  interval(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgrammeIntervalDto) {
    return this.programme.setInterval(user, id, dto.days);
  }

  @ApiOperation({ summary: "Record the Engineer's answer to a revision from their letter" })
  @Post('programme/:id/decide')
  decideProgramme(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideProgrammeDto) {
    return this.programme.decide(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete the latest revision while it is still with the Engineer' })
  @Delete('programme/:id')
  removeProgramme(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.programme.remove(user, id);
  }

  @ApiOperation({ summary: "A project's extension of time applications and its revised completion" })
  @Get('projects/:id/eot')
  eots(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eot.register(user, id);
  }

  @ApiOperation({ summary: 'Delays and variations a new application can claim for' })
  @Get('projects/:id/eot/options')
  eotOptions(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eot.options(user, id);
  }

  @ApiOperation({ summary: 'Apply for an extension of time, for delays in the register or for a variation' })
  @Post('projects/:id/eot')
  apply(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyEotDto) {
    return this.eot.apply(user, id, dto);
  }

  @ApiOperation({ summary: "Record the Engineer forwarding it to the competent authority, from their letter" })
  @Post('eot/:id/forward')
  forward(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ForwardEotDto) {
    return this.eot.forward(user, id, dto);
  }

  @ApiOperation({ summary: "Record the authority's decision: the days granted go to the delay register" })
  @Post('eot/:id/decide')
  decide(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideEotDto) {
    return this.eot.decide(user, id, dto);
  }

  @ApiOperation({ summary: 'Put back a decision recorded wrongly' })
  @Post('eot/:id/undo-decision')
  undo(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eot.undoDecision(user, id);
  }

  @ApiOperation({ summary: 'Withdraw an application still waiting' })
  @Post('eot/:id/withdraw')
  withdraw(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eot.withdraw(user, id);
  }
}
