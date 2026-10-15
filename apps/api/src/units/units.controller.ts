import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { UnitsService } from './units.service';
import { CreateUnitDto, UpdateUnitDto } from './units.dto';

@ApiTags('units')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private units: UnitsService) {}

  @ApiOperation({ summary: "The company's units of measure, with how many items use each", description: 'A company with none starts with the standard list.' })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.units.list(user);
  }

  @ApiOperation({ summary: 'Add a unit', description: 'The store manager or an approver.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateUnitDto) {
    return this.units.create(user, dto);
  }

  @ApiOperation({ summary: 'Rename a unit (only while no item uses it) or switch it off' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.units.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a unit no item uses' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.units.remove(user, id);
  }
}
