import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { VariationsService } from './variations.service';
import { CreateVariationDto, DecideVariationDto, ListVariationsQuery, SubmitVariationDto, UpdateVariationDto, VariationSummaryQuery } from './variations.dto';

@ApiTags('variations')
@ApiBearerAuth()
@Controller('variations')
export class VariationsController {
  constructor(private variations: VariationsService) {}

  @ApiOperation({ summary: 'Variation register (paged)', description: 'Roles that see bills. Newest first unless sorted.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListVariationsQuery) {
    return this.variations.list(user, q);
  }

  @ApiOperation({ summary: 'Revised contract value per project', description: 'Contract value, approved and pending variations, and BOQ items waiting for a variation.' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: VariationSummaryQuery) {
    return this.variations.summary(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.variations.get(user, id);
  }

  @ApiOperation({ summary: 'Prepare a variation', description: 'Admin, management, project managers and quantity surveyors. Lines change BOQ quantities or add new items.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateVariationDto) {
    return this.variations.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a variation', description: 'Until the client approves it. `lines` replaces all lines.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateVariationDto) {
    return this.variations.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Record that the variation was sent to the client' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SubmitVariationDto) {
    return this.variations.submit(user, id, dto);
  }

  @ApiOperation({ summary: "Record the client's decision", description: 'Approval changes the BOQ: revised quantities, extra items get their quantity and rate, new items are added.' })
  @Post(':id/decide')
  decide(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DecideVariationDto) {
    return this.variations.decide(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a variation the client has not approved' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.variations.remove(user, id);
  }
}
