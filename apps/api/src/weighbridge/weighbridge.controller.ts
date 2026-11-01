import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { WeighbridgeService } from './weighbridge.service';
import { CancelWeighTicketDto, CreateWeighTicketDto, UpdateWeighTicketDto, WeighbridgeQuery, WeightDto } from './weighbridge.dto';

/** The site's weighbridge: the weights the Connector read, and the store's tickets for each truck. */
@ApiTags('weighbridge')
@ApiBearerAuth()
@Controller('weighbridge')
export class WeighbridgeController {
  constructor(private svc: WeighbridgeService) {}

  @ApiOperation({ summary: 'Weights on the bridge no ticket uses (last day), trucks waiting for the second weight, tickets to receive and the week done' })
  @Get()
  board(@CurrentUser() user: RequestUser, @Query() q: WeighbridgeQuery) {
    return this.svc.board(user, q.projectId);
  }

  @ApiOperation({ summary: 'One ticket' })
  @Get('tickets/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(user, id);
  }

  @ApiOperation({ summary: "A truck on the bridge: its first weight (the bridge's or typed), the order and challan it brings" })
  @Post('tickets')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateWeighTicketDto) {
    return this.svc.create(user, dto);
  }

  @ApiOperation({ summary: 'The second weight; the net weight is the difference' })
  @Post('tickets/:id/second')
  second(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WeightDto) {
    return this.svc.second(user, id, dto);
  }

  @ApiOperation({ summary: 'The truck, order, line and challan, until the GRN is made' })
  @Patch('tickets/:id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWeighTicketDto) {
    return this.svc.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Cancel a ticket (the truck turned back); its weights go back on the list' })
  @Post('tickets/:id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelWeighTicketDto) {
    return this.svc.cancel(user, id, dto);
  }
}
