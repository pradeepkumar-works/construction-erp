import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ContractObligationsService } from './contract-obligations.service';
import { CreateContractObligationDto, UpdateContractObligationDto } from './contract-obligations.dto';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('projects/:id/contract/obligations')
export class ContractObligationsController {
  constructor(private obligations: ContractObligationsService) {}

  @ApiOperation({
    summary: "A contract's obligations (item 171)",
    description:
      'What each side has to do by when (the programme, the field laboratory, the staff named in the bid, the final account…), the ' +
      'deadline counted from the agreement, start, completion after extensions or handover, where it stands today, what missing it ' +
      'costs and what bills have deducted for it. Same roles as the contract terms.',
  })
  @Get()
  list(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.obligations.list(user, id);
  }

  @ApiOperation({ summary: 'Add an obligation', description: 'Same roles as changing contract terms. What the client owes carries no penalty.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateContractObligationDto) {
    return this.obligations.create(user, id, dto);
  }

  @ApiOperation({ summary: 'Add the standard obligations', description: 'The standard set the contract does not have yet (by code), each changeable afterwards.' })
  @Post('standard')
  addStandard(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.obligations.addStandard(user, id);
  }

  @ApiOperation({ summary: 'Change an obligation, mark it met or waive it', description: 'Only the fields sent change. The next bill deducts, or gives back, the difference.' })
  @Patch(':oid')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('oid') oid: string, @Body() dto: UpdateContractObligationDto) {
    return this.obligations.update(user, id, oid, dto);
  }

  @ApiOperation({ summary: 'Delete an obligation', description: 'Refused once a bill has deducted for it: waive it instead.' })
  @Delete(':oid')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('oid') oid: string) {
    return this.obligations.remove(user, id, oid);
  }
}
