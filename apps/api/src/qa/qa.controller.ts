import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { QaService } from './qa.service';
import { PoursService } from './pours.service';
import { CancelPourDto, CreatePlanLineDto, CreatePourDto, CubesQuery, ListPoursQuery, PouredDto, QaPlanQuery, SaveTestTypeDto, TestsDueQuery, UpdatePlanLineDto, UpdatePourDto } from './qa.dto';

@ApiTags('qa')
@ApiBearerAuth()
@Controller('qa')
export class QaController {
  constructor(
    private qa: QaService,
    private pours: PoursService,
  ) {}

  @ApiOperation({ summary: "The company's test types: the standard ones with its changes, then its own, with the tests recorded as each" })
  @Get('test-types')
  testTypes(@CurrentUser() user: RequestUser) {
    return this.qa.testTypes(user);
  }

  @ApiOperation({ summary: 'Save a test type by code', description: "A standard code saves the company's copy of it; any other code is one of its own. QA/QC, the project manager, management or an admin." })
  @Put('test-types/:code')
  saveTestType(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: SaveTestTypeDto) {
    return this.qa.saveTestType(user, code, dto);
  }

  @ApiOperation({ summary: 'Put a standard test type back as shipped, or delete one of the company’s own that nothing uses' })
  @Delete('test-types/:code')
  removeTestType(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.qa.removeTestType(user, code);
  }

  @ApiOperation({ summary: "A project's quality plan (inspection and test plan): which tests, against what, how often and who witnesses" })
  @Get('plan')
  plan(@CurrentUser() user: RequestUser, @Query() q: QaPlanQuery) {
    return this.qa.plan(user, q.projectId);
  }

  @ApiOperation({ summary: "Start a project's empty plan from the standard plan of its kind of work" })
  @Post('plan/:projectId/standard')
  startFromStandard(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.qa.startFromStandard(user, projectId);
  }

  @Post('plan-lines')
  addLine(@CurrentUser() user: RequestUser, @Body() dto: CreatePlanLineDto) {
    return this.qa.addLine(user, dto);
  }

  @Patch('plan-lines/:id')
  updateLine(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePlanLineDto) {
    return this.qa.updateLine(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a plan line; tests taken under it stay' })
  @Delete('plan-lines/:id')
  removeLine(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.qa.removeLine(user, id);
  }

  @ApiOperation({
    summary: 'Tests due: what each plan line owes from approved work and material received, against the tests taken under it',
    description: 'Concrete cubes by IS 456 15.2.2 per grade and day; by quantity, one per so much in the line’s unit; one per lot received, or per so much of it; one per day of work.',
  })
  @Get('tests-due')
  testsDue(@CurrentUser() user: RequestUser, @Query() q: TestsDueQuery) {
    return this.qa.testsDue(user, q);
  }

  @ApiOperation({ summary: 'IS 456 acceptance of cubes by project and grade: means of four non-overlapping results and each result (Table 11)' })
  @Get('cubes')
  cubes(@CurrentUser() user: RequestUser, @Query() q: CubesQuery) {
    return this.qa.cubes(user, q.projectId);
  }

  @Get('pours')
  listPours(@CurrentUser() user: RequestUser, @Query() q: ListPoursQuery) {
    return this.pours.list(user, q);
  }

  @Get('pours/:id')
  getPour(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.pours.get(user, id);
  }

  @ApiOperation({ summary: 'Plan a pour', description: 'Numbered POUR-<year>-0001. Whoever requests inspections on the project.' })
  @Post('pours')
  createPour(@CurrentUser() user: RequestUser, @Body() dto: CreatePourDto) {
    return this.pours.create(user, dto);
  }

  @Patch('pours/:id')
  updatePour(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePourDto) {
    return this.pours.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Ask for the pour card: an inspection of the activity with the card’s points, for QA/QC to pass' })
  @Post('pours/:id/card')
  requestCard(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.pours.requestCard(user, id);
  }

  @ApiOperation({ summary: 'Record the pour placed, with the volume poured' })
  @Post('pours/:id/poured')
  poured(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: PouredDto) {
    return this.pours.poured(user, id, dto);
  }

  @Post('pours/:id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CancelPourDto) {
    return this.pours.cancel(user, id, dto);
  }

  @Delete('pours/:id')
  removePour(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.pours.remove(user, id);
  }
}
