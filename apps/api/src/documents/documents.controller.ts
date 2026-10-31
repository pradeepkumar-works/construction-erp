import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { DocumentsService } from './documents.service';
import { DocumentTextService } from './document-text.service';
import { DrawingMarkupsService } from './drawing-markups.service';
import { DrawingTakeoffsService } from './drawing-takeoffs.service';
import {
  AcknowledgeTransmittalDto,
  CreateDocumentDto,
  CreateRevisionDto,
  CreateTransmittalDto,
  CreateMarkupDto,
  CreateTakeoffDto,
  SetDrawingScaleDto,
  TakeoffsToBoqDto,
  TakeoffsToMeasurementDto,
  UpdateTakeoffDto,
  LinkMarkupRfiDto,
  ListDocumentsQuery,
  ListTransmittalsQuery,
  ProjectQuery,
  ResolveMarkupDto,
  SearchDocumentsQuery,
  SiteDocumentsQuery,
  UpdateDocumentDto,
  UpdateMarkupDto,
  UpdateRevisionDto,
  UpdateTransmittalDto,
} from './documents.dto';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(
    private docs: DocumentsService,
    private text: DocumentTextService,
    private markups: DrawingMarkupsService,
    private takeoffs: DrawingTakeoffsService,
  ) {}

  @ApiOperation({ summary: 'Search inside filed PDFs and letters (Ask the contract)', description: 'Pages of the current revisions\' PDFs and letters (for roles that see letters) in the projects the user can open, best match first.' })
  @Get('search')
  search(@CurrentUser() user: RequestUser, @Query() q: SearchDocumentsQuery) {
    return this.text.search(user, { query: q.q, projectId: q.projectId });
  }

  @ApiOperation({ summary: 'One page of a filed PDF: the file, its document or letter, and the page text' })
  @Get('files/:id/pages/:page')
  filePage(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('page', ParseIntPipe) page: number) {
    return this.text.page(user, id, Math.max(1, page));
  }

  @ApiOperation({ summary: 'Counts for the Documents page: documents, awaiting approval, unacknowledged transmittals, letters awaiting a reply' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: ProjectQuery) {
    return this.docs.summary(user, q.projectId);
  }

  @ApiOperation({ summary: "A project's documents with their current revision and files (the site app keeps these offline)" })
  @Get('site')
  site(@CurrentUser() user: RequestUser, @Query() q: SiteDocumentsQuery) {
    return this.docs.siteDocuments(user, q.projectId);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListDocumentsQuery) {
    return this.docs.listDocuments(user, q);
  }

  @ApiOperation({ summary: 'A document with all its revisions, newest first' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.docs.getDocument(user, id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.docs.documentHistory(user, id);
  }

  @ApiOperation({ summary: 'Add a drawing or document to the register, optionally with its first revision', description: 'A revision good for construction notifies everyone on the project.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDocumentDto) {
    return this.docs.createDocument(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.docs.updateDocument(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a document none of whose revisions went out on a transmittal' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.docs.removeDocument(user, id);
  }

  @ApiOperation({ summary: 'Add a revision', description: 'The latest issued revision is current and supersedes the others.' })
  @Post(':id/revisions')
  addRevision(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateRevisionDto) {
    return this.docs.addRevision(user, id, dto);
  }

  @ApiOperation({ summary: "Correct a revision or record the consultant's decision on it" })
  @Patch(':id/revisions/:revisionId')
  updateRevision(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('revisionId') revisionId: string, @Body() dto: UpdateRevisionDto) {
    return this.docs.updateRevision(user, id, revisionId, dto);
  }

  @Delete(':id/revisions/:revisionId')
  removeRevision(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('revisionId') revisionId: string) {
    return this.docs.removeRevision(user, id, revisionId);
  }

  @ApiOperation({ summary: "Every mark on the document's revisions (M1, M2…), with the file and page each sits on" })
  @Get(':id/markups')
  listMarkups(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.markups.list(user, id);
  }

  @ApiOperation({ summary: 'Mark up a drawing', description: 'Anyone who can open the document. Points are 0 to 1 of the page. A repeated `id` returns the mark already saved.' })
  @Post(':id/markups')
  createMarkup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateMarkupDto) {
    return this.markups.create(user, id, dto);
  }

  @ApiOperation({ summary: 'Move a mark, or change its comment or colour (whoever made it, or document control)' })
  @Patch(':id/markups/:markupId')
  updateMarkup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('markupId', ParseUUIDPipe) markupId: string, @Body() dto: UpdateMarkupDto) {
    return this.markups.update(user, id, markupId, dto);
  }

  @ApiOperation({ summary: 'Resolve a mark: it stops being carried onto later revisions' })
  @Post(':id/markups/:markupId/resolve')
  resolveMarkup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('markupId', ParseUUIDPipe) markupId: string, @Body() dto: ResolveMarkupDto) {
    return this.markups.resolve(user, id, markupId, dto);
  }

  @Post(':id/markups/:markupId/reopen')
  reopenMarkup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('markupId', ParseUUIDPipe) markupId: string) {
    return this.markups.reopen(user, id, markupId);
  }

  @ApiOperation({ summary: 'Link the RFI raised from a mark' })
  @Put(':id/markups/:markupId/rfi')
  linkMarkupRfi(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('markupId', ParseUUIDPipe) markupId: string, @Body() dto: LinkMarkupRfiDto) {
    return this.markups.linkRfi(user, id, markupId, dto);
  }

  @Delete(':id/markups/:markupId')
  removeMarkup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('markupId', ParseUUIDPipe) markupId: string) {
    return this.markups.remove(user, id, markupId);
  }

  @ApiOperation({ summary: "The scales of the document's sheets and every measure on them (T1, T2…)" })
  @Get(':id/takeoffs')
  listTakeoffs(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.takeoffs.list(user, id);
  }

  @ApiOperation({ summary: "Set a sheet's scale from two points a known distance apart", description: "Anyone who can open the document. The page's lengths and areas are worked out again." })
  @Put(':id/takeoffs/scale')
  setScale(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SetDrawingScaleDto) {
    return this.takeoffs.setScale(user, id, dto);
  }

  @ApiOperation({ summary: 'Measure a length, an area or a count on a drawing', description: 'A length or area needs the sheet’s scale. A repeated `id` returns what is already saved.' })
  @Post(':id/takeoffs')
  createTakeoff(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateTakeoffDto) {
    return this.takeoffs.create(user, id, dto);
  }

  @ApiOperation({ summary: 'Record the measurement sheet some measures were put in' })
  @Put(':id/takeoffs/measurement')
  takeoffsToMeasurement(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: TakeoffsToMeasurementDto) {
    return this.takeoffs.toMeasurement(user, id, dto);
  }

  @ApiOperation({ summary: "Set a BOQ item's original or revised quantity to measures' total", description: 'For those who keep the BOQ; the measures must be of one kind.' })
  @Put(':id/takeoffs/boq')
  takeoffsToBoq(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: TakeoffsToBoqDto) {
    return this.takeoffs.toBoq(user, id, dto);
  }

  @ApiOperation({ summary: 'Rename a measure (whoever measured it, or document control)' })
  @Patch(':id/takeoffs/:takeoffId')
  renameTakeoff(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('takeoffId', ParseUUIDPipe) takeoffId: string, @Body() dto: UpdateTakeoffDto) {
    return this.takeoffs.rename(user, id, takeoffId, dto);
  }

  @Delete(':id/takeoffs/:takeoffId')
  removeTakeoff(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('takeoffId', ParseUUIDPipe) takeoffId: string) {
    return this.takeoffs.remove(user, id, takeoffId);
  }
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('transmittals')
export class TransmittalsController {
  constructor(private docs: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListTransmittalsQuery) {
    return this.docs.listTransmittals(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.docs.getTransmittal(user, id);
  }

  @ApiOperation({ summary: 'Send revisions to someone', description: 'Numbered TRN-<year>-0001.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTransmittalDto) {
    return this.docs.createTransmittal(user, dto);
  }

  @ApiOperation({ summary: 'Change a transmittal', description: '`items`, when given, is the complete list (not once acknowledged).' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateTransmittalDto) {
    return this.docs.updateTransmittal(user, id, dto);
  }

  @ApiOperation({ summary: 'Record that the receiver signed for it' })
  @Post(':id/acknowledge')
  acknowledge(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AcknowledgeTransmittalDto) {
    return this.docs.acknowledgeTransmittal(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.docs.removeTransmittal(user, id);
  }
}
