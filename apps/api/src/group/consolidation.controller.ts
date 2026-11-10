import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ModuleSwitch } from '../common/decorators';
import { ConsolidationQuery, SisterLinkDto } from './consolidation.dto';
import { ConsolidationService } from './consolidation.service';

/** Consolidated accounts for the group's admins in the holding company, and the sister companies each company names. */
@ApiTags('group')
@ApiBearerAuth()
@Controller('group')
export class ConsolidationController {
  constructor(private consolidation: ConsolidationService) {}

  @ApiOperation({
    summary: "The group's profit and loss and balance sheet: each company, the eliminations between sisters and the group",
    description: "The group's admins, from the holding company. Each company's figures are its own statements.",
  })
  @ModuleSwitch('books')
  @Get('consolidation')
  consolidated(@CurrentUser() user: RequestUser, @Query() q: ConsolidationQuery) {
    return this.consolidation.consolidation(user, q);
  }

  @ApiOperation({ summary: "This company's vendors and clients named as sister companies, and the sisters' links that name it" })
  @Get('sisters')
  sisters(@CurrentUser() user: RequestUser) {
    return this.consolidation.sisters(user);
  }

  @ApiOperation({ summary: 'Name a vendor or client as a sister company of the group' })
  @Put('sisters')
  setSister(@CurrentUser() user: RequestUser, @Body() dto: SisterLinkDto) {
    return this.consolidation.setSister(user, dto);
  }

  @ApiOperation({ summary: 'Stop naming a vendor or client as a sister company' })
  @Delete('sisters/:id')
  removeSister(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.consolidation.removeSister(user, id);
  }
}
