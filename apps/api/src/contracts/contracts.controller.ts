import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ContractsService } from './contracts.service';
import { UpdateContractDto } from './contracts.dto';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('projects/:id/contract')
export class ContractsController {
  constructor(private contracts: ContractsService) {}

  @ApiOperation({
    summary: "A project's contract terms",
    description:
      'Client, agreement, value, dates with the extensions of time granted in the delay register (`eotGrantedDays` on a delay), and the ' +
      'retention, security deposit, advance recovery, TDS, GST TDS, labour cess and GST percentages bills use. Billing roles only ' +
      '(admin, management, project managers, QS, accounts).',
  })
  @Get()
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.contracts.get(user, id);
  }

  @ApiOperation({ summary: 'Change contract terms', description: 'Admin, management, project managers and accounts. Only the fields sent change.' })
  @Put()
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contracts.update(user, id, dto);
  }
}
