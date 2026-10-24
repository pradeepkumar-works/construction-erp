import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { OmService } from './om.service';
import { OmQuery, SaveOmContractDto, SaveServiceDayDto, SaveStaffMonthDto } from './om.dto';

@ApiTags('om')
@ApiBearerAuth()
@Controller('projects/:id/om')
export class OmController {
  constructor(private om: OmService) {}

  @ApiOperation({
    summary: "A project's O&M contract, its periods and a month of its service levels",
    description:
      'Item 131. The terms; each instalment period with its bill or what it would deduct so far; the month asked for (else this one) with ' +
      'each day’s readings and the benchmarks they miss; the months of its period with failures, penalties and staff short; the treatment ' +
      'chemicals against their norm. Everyone on the project but guests.',
  })
  @Get()
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: OmQuery) {
    return this.om.get(user, id, q.month);
  }

  @ApiOperation({ summary: 'Set the O&M contract’s terms', description: 'Years and % of the contract, instalments, population, benchmarks, minimum staff and chemical norms. The project’s managers, after handover.' })
  @Put('contract')
  saveContract(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveOmContractDto) {
    return this.om.saveContract(user, id, dto);
  }

  @ApiOperation({ summary: 'Enter or correct a day’s service levels', description: 'One reading a day; not once the day’s period is billed. Site engineers, team leaders, the lab and the managers.' })
  @Put('days')
  saveDay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveServiceDayDto) {
    return this.om.saveDay(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a day’s service levels', description: 'Not once the day’s period is billed.' })
  @Delete('days/:dayId')
  removeDay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('dayId', ParseUUIDPipe) dayId: string) {
    return this.om.removeDay(user, id, dayId);
  }

  @ApiOperation({ summary: 'Record the staff deployed in a month', description: 'By the roles of the contract’s minimum; a role short is deducted from the period’s bill at its monthly pay. HR and the managers.' })
  @Put('staff')
  saveStaff(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveStaffMonthDto) {
    return this.om.saveStaff(user, id, dto);
  }
}
