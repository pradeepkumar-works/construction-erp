import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ApprovalDelegationsService } from './approval-delegations.service';
import { CreateApprovalDelegationDto } from './approval-delegations.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approval-delegations')
export class ApprovalDelegationsController {
  constructor(private delegations: ApprovalDelegationsService) {}

  @ApiOperation({ summary: 'Approvals while away', description: 'Delegations not yet over, from or to the caller; `all=true` lists everyone’s (admin).' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query('all') all?: string) {
    return this.delegations.list(user, all === 'true');
  }

  @ApiOperation({ summary: 'Hand approvals to someone while away', description: 'From startsOn to endsOn (company dates) the delegate decides what waits on the person away too, with their limits, and is told of it. Only an admin sets someone else’s.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateApprovalDelegationDto) {
    return this.delegations.create(user, dto);
  }

  @ApiOperation({ summary: 'End a delegation', description: 'The person away, the delegate or an admin.' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.delegations.remove(user, id);
  }
}
