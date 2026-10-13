import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RisksService } from './risks.service';
import { CreateRiskDto, ListRisksQuery, RiskSuggestionsQuery, UpdateRiskDto } from './risks.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('risks')
@ApiBearerAuth()
@Controller('risks')
export class RisksController {
  constructor(private risks: RisksService) {}

  @ApiOperation({ summary: 'Delay and risk register', description: 'Sorted by score (highest first) unless `sortBy` is given.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListRisksQuery) {
    return this.risks.list(user, q);
  }

  @ApiOperation({ summary: 'Register totals for the list filters', description: 'Open / monitoring / closed, high risks, overdue, days lost (and excusable days lost), heat map of active risks, totals by category.' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: ListRisksQuery) {
    return this.risks.summary(user, q);
  }

  @ApiOperation({ summary: 'Delayed activities with no open delay entry', description: 'Activities on active projects past their planned end with approved progress short of plan.' })
  @Get('suggestions')
  suggestions(@CurrentUser() user: RequestUser, @Query() q: RiskSuggestionsQuery) {
    return this.risks.suggestions(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.risks.get(user, id);
  }

  @ApiOperation({ summary: 'History of an entry (raised, updated, closed, reopened)' })
  @Get(':id/history')
  history(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.risks.history(user, id);
  }

  @ApiOperation({
    summary: 'Raise a delay or a risk',
    description: 'Numbered RISK-<year>-0001. A delay needs `delayStart`; its probability defaults to 5. A delay or a risk scored 15+ notifies the project’s approvers.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateRiskDto) {
    return this.risks.create(user, dto);
  }

  @ApiOperation({ summary: 'Update, close or reopen an entry', description: 'The raiser, the owner or an approver. `status: CLOSED` ends an open delay today unless `delayEnd` is sent.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateRiskDto) {
    return this.risks.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an entry raised by mistake (approvers)' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.risks.remove(user, id);
  }
}
