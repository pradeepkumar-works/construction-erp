import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { DocumentsService } from './documents.service';
import {
  AcknowledgeTransmittalDto,
  CreateDocumentDto,
  CreateLetterDto,
  CreateRevisionDto,
  CreateTransmittalDto,
  ListDocumentsQuery,
  ListLettersQuery,
  ListTransmittalsQuery,
  ProjectQuery,
  SiteDocumentsQuery,
  UpdateDocumentDto,
  UpdateLetterDto,
  UpdateRevisionDto,
  UpdateTransmittalDto,
} from './documents.dto';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private docs: DocumentsService) {}

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

@ApiTags('documents')
@ApiBearerAuth()
@Controller('letters')
export class LettersController {
  constructor(private docs: DocumentsService) {}

  @ApiOperation({ summary: 'Letters in and out (admin, management, project manager, quantity surveyor)' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListLettersQuery) {
    return this.docs.listLetters(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.docs.getLetter(user, id);
  }

  @ApiOperation({ summary: 'Record a letter received or sent', description: 'Numbered IN- or OUT-<year>-0001. Can answer another letter and be linked to a delay.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateLetterDto) {
    return this.docs.createLetter(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLetterDto) {
    return this.docs.updateLetter(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.docs.removeLetter(user, id);
  }
}
