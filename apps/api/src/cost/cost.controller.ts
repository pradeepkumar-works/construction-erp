import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CostService } from './cost.service';
import { CostQuery, SetLabourRatesDto } from './cost.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('cost')
@ApiBearerAuth()
@Controller('cost')
export class CostController {
  constructor(private cost: CostService) {}

  @ApiOperation({
    summary: 'Cost against executed value for every visible project',
    description:
      'Approvers and accounts. Cost = approved site expenses + material issued × item rate + approved machinery logs × hire rate + attendance man-days × trade daily rate. Executed value = approved progress × BOQ rate; measured value = approved measurement sheets × BOQ rate. `unpriced` counts what has no rate yet.',
  })
  @Get('projects')
  summary(@CurrentUser() user: RequestUser, @Query() q: CostQuery) {
    return this.cost.summary(user, q);
  }

  @ApiOperation({ summary: 'One project: cost heads by month and breakdowns by expense category, item, machine and trade' })
  @Get('projects/:id')
  project(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: CostQuery) {
    return this.cost.project(user, id, q);
  }

  @ApiOperation({ summary: 'Labour daily rates by trade, and trades on attendance sheets that have none' })
  @Get('labour-rates')
  labourRates(@CurrentUser() user: RequestUser) {
    return this.cost.labourRates(user);
  }

  @ApiOperation({ summary: 'Replace the labour daily rates', description: 'Admin, management or accounts. Trades left out of the list are removed.' })
  @Put('labour-rates')
  setLabourRates(@CurrentUser() user: RequestUser, @Body() dto: SetLabourRatesDto) {
    return this.cost.setLabourRates(user, dto);
  }
}
