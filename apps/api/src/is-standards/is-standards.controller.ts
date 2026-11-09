import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { IsStandardsService } from './is-standards.service';
import { IsComplianceQuery, SaveIsStandardDto } from './is-standards.dto';

@ApiTags('is-standards')
@ApiBearerAuth()
@Controller('is-standards')
export class IsStandardsController {
  constructor(private standards: IsStandardsService) {}

  @ApiOperation({ summary: "The company's Indian Standards: the catalogue with its changes, then its own, with each edition's check against BIS" })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.standards.list(user);
  }

  @ApiOperation({ summary: 'Tests passed, failed and waiting by standard and by discipline, for the projects and period asked' })
  @Get('compliance')
  compliance(@CurrentUser() user: RequestUser, @Query() q: IsComplianceQuery) {
    return this.standards.compliance(user, q);
  }

  @ApiOperation({ summary: 'One standard with its clauses' })
  @Get(':code')
  get(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.standards.get(user, code);
  }

  @ApiOperation({ summary: 'Save a standard by code', description: "A catalogue code saves the company's copy (its number stays); any other code is the number of one of its own. QA/QC, the project manager, management or an admin." })
  @Put(':code')
  save(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: SaveIsStandardDto) {
    return this.standards.save(user, code, dto);
  }

  @ApiOperation({ summary: 'Record that the edition was checked against BIS today' })
  @Post(':code/checked')
  checked(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.standards.markChecked(user, code);
  }

  @ApiOperation({ summary: 'Put a catalogue standard back as shipped, or delete one of the company’s own' })
  @Delete(':code')
  remove(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.standards.remove(user, code);
  }
}
