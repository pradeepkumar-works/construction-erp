import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { EpcService } from './epc.service';
import { SaveClientInputDto, SaveDeliverableDto, SavePackageDto } from './epc.dto';

@ApiTags('epc')
@ApiBearerAuth()
@Controller('projects/:id/epc')
export class EpcController {
  constructor(private epc: EpcService) {}

  @ApiOperation({
    summary: "A project's engineering deliverables, equipment packages and client inputs",
    description:
      'Item 130. Deliverables by discipline with their submission, approval code and lateness; packages with their stage dates, when each reaches site ' +
      'against the day site needs it, and what is out of order; the inputs the client owes with any delay recorded for them. Everyone on the project; ' +
      'package values only for those who see purchase orders.',
  })
  @Get()
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.epc.get(user, id);
  }

  @ApiOperation({ summary: 'Add or change a deliverable', description: 'Its plan, the latest submission and the code it came back with. Document control.' })
  @Put('deliverables')
  saveDeliverable(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveDeliverableDto) {
    return this.epc.saveDeliverable(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a deliverable', description: 'Not while a payment stage waits on its approval.' })
  @Delete('deliverables/:deliverableId')
  removeDeliverable(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('deliverableId', ParseUUIDPipe) deliverableId: string) {
    return this.epc.removeDeliverable(user, id, deliverableId);
  }

  @ApiOperation({ summary: 'Add or change an equipment package', description: 'Its vendor, order, the day site needs it, shipping and its stage dates. Procurement and the project managers.' })
  @Put('packages')
  savePackage(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SavePackageDto) {
    return this.epc.savePackage(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove an equipment package', description: 'Not while a payment stage is paid by its supply.' })
  @Delete('packages/:packageId')
  removePackage(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('packageId', ParseUUIDPipe) packageId: string) {
    return this.epc.removePackage(user, id, packageId);
  }

  @ApiOperation({ summary: 'Add or change a client input', description: 'A milestone the client owns: power for testing, land, an approval.' })
  @Put('client-inputs')
  saveClientInput(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveClientInputDto) {
    return this.epc.saveClientInput(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a client input' })
  @Delete('client-inputs/:inputId')
  removeClientInput(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('inputId', ParseUUIDPipe) inputId: string) {
    return this.epc.removeClientInput(user, id, inputId);
  }

  @ApiOperation({ summary: 'Record a late client input as a delay', description: "The client's delay in the register, from the day after it was due. Those who raise risks." })
  @Post('client-inputs/:inputId/delay')
  recordDelay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('inputId', ParseUUIDPipe) inputId: string) {
    return this.epc.recordDelay(user, id, inputId);
  }
}
