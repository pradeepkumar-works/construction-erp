import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ClientsService } from './clients.service';
import { CreateClientDto, ListClientsQuery, UpdateClientDto } from './clients.dto';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @ApiOperation({ summary: 'Client master (paged)', description: 'Active clients unless `includeInactive`. Anyone signed in can read it (project pickers).' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListClientsQuery) {
    return this.clients.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.clients.get(user, id);
  }

  @ApiOperation({ summary: 'Add a client', description: 'Admin, management, project managers and accounts. The GST state code and PAN are taken from the GSTIN.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateClientDto) {
    return this.clients.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a client', description: 'Renaming a client renames it on its projects too.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a client without projects' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.clients.remove(user, id);
  }
}
