import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ImprestService } from './imprest.service';
import { AdvanceDto, ListImprestsQuery, OpenImprestDto, PayDto, RejectDto, RequestTopUpDto, ReturnDto, UpdateImprestDto } from './imprest.dto';
import { ModuleSwitch } from '../common/decorators';

@ApiTags('imprest')
@ApiBearerAuth()
@ModuleSwitch('imprest')
@Controller('imprests')
export class ImprestController {
  constructor(private imprest: ImprestService) {}

  @ApiOperation({ summary: 'Site imprests with their cash in hand', description: 'Accounts and approvers see those of their projects; anyone else only their own.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListImprestsQuery) {
    return this.imprest.list(user, q);
  }

  @ApiOperation({ summary: 'One imprest with its top-ups and the cash ledger (advances, returns and the holder\'s cash expenses)' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.imprest.get(user, id);
  }

  @ApiOperation({ summary: 'Open an imprest for a site in-charge', description: 'Accounts and admins. `payFloat` also records the float as paid.' })
  @Post()
  open(@CurrentUser() user: RequestUser, @Body() dto: OpenImprestDto) {
    return this.imprest.open(user, dto);
  }

  @ApiOperation({ summary: 'Change the float, or close (cash in hand must be nil) or reopen the imprest' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateImprestDto) {
    return this.imprest.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Ask for a top-up', description: 'The holder. Defaults to what brings the cash in hand back to the float; one waiting at a time.' })
  @Post(':id/top-ups')
  requestTopUp(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RequestTopUpDto) {
    return this.imprest.requestTopUp(user, id, dto);
  }

  @ApiOperation({ summary: 'Advance cash without a request' })
  @Post(':id/advances')
  advance(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AdvanceDto) {
    return this.imprest.advance(user, id, dto);
  }

  @ApiOperation({ summary: 'Record cash handed back by the holder' })
  @Post(':id/returns')
  takeReturn(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReturnDto) {
    return this.imprest.takeReturn(user, id, dto);
  }

  @ApiOperation({ summary: 'Pay a top-up that was asked for' })
  @Post('entries/:entryId/pay')
  pay(@CurrentUser() user: RequestUser, @Param('entryId') entryId: string, @Body() dto: PayDto) {
    return this.imprest.pay(user, entryId, dto);
  }

  @ApiOperation({ summary: 'Turn down a top-up, with a reason' })
  @Post('entries/:entryId/reject')
  reject(@CurrentUser() user: RequestUser, @Param('entryId') entryId: string, @Body() dto: RejectDto) {
    return this.imprest.reject(user, entryId, dto);
  }
}
