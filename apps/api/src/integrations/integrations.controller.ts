import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/decorators';
import { IntegrationsService } from './integrations.service';
import { ConnectorReadingsDto, CreateAgentDto, CreateConnectionDto, EventQuery, MatchDeviceDto, PairConnectorDto, UpdateConnectionDto } from './integrations.dto';

/** Connections to outside systems, the Connectors that read devices on site, the devices and the log (item 139). */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private svc: IntegrationsService) {}

  @ApiOperation({ summary: 'Connections with their health and messages today' })
  @Get('connections')
  connections(@CurrentUser() user: RequestUser) {
    return this.svc.connections(user);
  }

  @ApiOperation({ summary: 'A new connection; a web address kind answers with its address once' })
  @Post('connections')
  createConnection(@CurrentUser() user: RequestUser, @Body() dto: CreateConnectionDto) {
    return this.svc.createConnection(user, dto);
  }

  @Patch('connections/:id')
  updateConnection(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateConnectionDto) {
    return this.svc.updateConnection(user, id, dto);
  }

  @ApiOperation({ summary: 'A new web address for the connection (the old one stops working)' })
  @Post('connections/:id/new-address')
  newAddress(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.svc.newHookSecret(user, id);
  }

  @Delete('connections/:id')
  removeConnection(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.svc.removeConnection(user, id);
  }

  @ApiOperation({ summary: 'Connectors with their state' })
  @Get('agents')
  agents(@CurrentUser() user: RequestUser) {
    return this.svc.agents(user);
  }

  @ApiOperation({ summary: 'A new Connector and its pairing code (shown once, good for 30 minutes)' })
  @Post('agents')
  createAgent(@CurrentUser() user: RequestUser, @Body() dto: CreateAgentDto) {
    return this.svc.createAgent(user, dto);
  }

  @ApiOperation({ summary: 'A new pairing code for a Connector (its old token stops working)' })
  @Post('agents/:id/pair-code')
  newPairCode(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.svc.newPairCode(user, id);
  }

  @ApiOperation({ summary: 'Remove a Connector for good' })
  @Delete('agents/:id')
  revokeAgent(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.svc.revokeAgent(user, id);
  }

  @ApiOperation({ summary: 'Devices the connections report on, matched or not' })
  @Get('devices')
  devices(@CurrentUser() user: RequestUser) {
    return this.svc.devices(user);
  }

  @ApiOperation({ summary: 'Match a device to a machine or a site (empty clears it)' })
  @Patch('devices/:id')
  matchDevice(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: MatchDeviceDto) {
    return this.svc.matchDevice(user, id, dto);
  }

  @ApiOperation({ summary: 'The latest messages in and out, newest first' })
  @Get('events')
  events(@CurrentUser() user: RequestUser, @Query() q: EventQuery) {
    return this.svc.events(user, q);
  }
}

/** A connection's own web address: POST /api/hooks/<kind>/<secret> with JSON; an X-Event-Id (or an id in the body) is counted once. */
@ApiTags('integrations')
@Controller('hooks')
export class HooksController {
  constructor(private svc: IntegrationsService) {}

  @ApiOperation({ summary: "A message from an outside service to a connection's web address" })
  @Public()
  @HttpCode(200)
  @Post(':kind/:secret')
  hook(@Param('kind') kind: string, @Param('secret') secret: string, @Body() body: unknown, @Headers('x-event-id') eventId: string | undefined) {
    return this.svc.hook(kind, secret, body, eventId ?? null);
  }
}

/** The Nirmaan Connector on a site computer: it pairs once with a code, then calls out with its token. Nothing calls in to it. */
@ApiTags('integrations')
@Controller('connector')
export class ConnectorController {
  constructor(private svc: IntegrationsService) {}

  @ApiOperation({ summary: 'Pair a Connector with the code from Admin, Connections; answers with its token' })
  @Public()
  @HttpCode(200)
  @Post('pair')
  pair(@Body() dto: PairConnectorDto) {
    return this.svc.pair(dto);
  }

  @ApiOperation({ summary: "The Connector's settings and the connections it reads; also its heartbeat" })
  @Public()
  @Get('config')
  config(@Headers('authorization') auth: string | undefined, @Headers('x-connector-version') version: string | undefined) {
    return this.svc.connectorConfig(auth, version ?? null);
  }

  @ApiOperation({ summary: "Readings from the Connector's buffer, up to 500 at a time" })
  @Public()
  @HttpCode(200)
  @Post('readings')
  readings(@Headers('authorization') auth: string | undefined, @Body() dto: ConnectorReadingsDto) {
    return this.svc.connectorReadings(auth, dto);
  }
}
