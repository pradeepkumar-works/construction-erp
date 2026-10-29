import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { CorrespondenceService } from './correspondence.service';
import {
  CreateLetterDto,
  DispatchLetterDto,
  LetterContactInput,
  LetterNoteDto,
  LetterSeriesInput,
  LetterSettingsInput,
  LetterTemplateInput,
  ListLetterContactsQuery,
  ListLettersQuery,
  MarkLetterDto,
  ReturnLetterDto,
  SendForApprovalDto,
  UpdateLetterContactDto,
  UpdateLetterDto,
  UpdateLetterSeriesDto,
  UpdateLetterTemplateDto,
} from './correspondence.dto';

@ApiTags('correspondence')
@ApiBearerAuth()
@Controller('letters')
export class LettersController {
  constructor(private letters: CorrespondenceService) {}

  @ApiOperation({ summary: 'The inward and outward registers', description: 'Correspondence roles see their projects (heads every letter, head office and confidential too); anyone sees the letters marked to them (`mine`) or waiting for their signature (`toSign`).' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListLettersQuery) {
    return this.letters.list(user, q);
  }

  @ApiOperation({ summary: 'Counts: marked to me, to sign, replies due and overdue, proof missing, not marked' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.letters.summary(user);
  }

  @ApiOperation({ summary: 'Staff a letter can be marked to, and who may sign one for the project (or head office)' })
  @Get('people')
  people(@CurrentUser() user: RequestUser, @Query('projectId') projectId?: string) {
    return this.letters.people(user, projectId || undefined);
  }

  @ApiOperation({ summary: 'Which outward letters need approval, and the numbering series' })
  @Get('settings')
  settings(@CurrentUser() user: RequestUser) {
    return this.letters.settings(user);
  }

  @Put('settings')
  saveSettings(@CurrentUser() user: RequestUser, @Body() dto: LetterSettingsInput) {
    return this.letters.saveSettings(user, dto);
  }

  @ApiOperation({ summary: "Set a project's (or head office's) series: prefix and pattern" })
  @Put('series')
  saveSeries(@CurrentUser() user: RequestUser, @Body() dto: LetterSeriesInput) {
    return this.letters.saveSeries(user, dto);
  }

  @Patch('series/:id')
  updateSeries(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLetterSeriesDto) {
    return this.letters.updateSeries(user, id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.get(user, id);
  }

  @ApiOperation({ summary: 'The letter for printing on the letterhead' })
  @Get(':id/print')
  print(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.print(user, id);
  }

  @ApiOperation({
    summary: 'Record a letter received, or start one to send',
    description: 'A letter received is numbered at once from its series (P07/IN/26-27/015) and can be marked to someone; one to send starts as a draft and is numbered when issued or approved.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateLetterDto) {
    return this.letters.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLetterDto) {
    return this.letters.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.remove(user, id);
  }

  @ApiOperation({ summary: 'Mark or forward a letter received to someone, with an action and a date' })
  @Post(':id/mark')
  mark(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: MarkLetterDto) {
    return this.letters.mark(user, id, dto);
  }

  @ApiOperation({ summary: 'Close a letter received: replied, complied, noted or filed' })
  @Post(':id/close')
  close(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: LetterNoteDto) {
    return this.letters.close(user, id, dto.note);
  }

  @Post(':id/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.reopen(user, id);
  }

  @ApiOperation({ summary: 'Send a draft to its signatory' })
  @Post(':id/send-for-approval')
  sendForApproval(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SendForApprovalDto) {
    return this.letters.sendForApproval(user, id, dto);
  }

  @ApiOperation({ summary: 'Issue a draft that needs no approval: numbered and dated today' })
  @Post(':id/issue')
  issue(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.issue(user, id);
  }

  @ApiOperation({ summary: 'The signatory approves: numbered, dated today and issued' })
  @Post(':id/approve')
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.approve(user, id);
  }

  @ApiOperation({ summary: 'The signatory returns the draft with what to change' })
  @Post(':id/return')
  returnToDraft(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReturnLetterDto) {
    return this.letters.returnToDraft(user, id, dto.note);
  }

  @ApiOperation({ summary: 'How and when an issued letter went, and the proof it arrived' })
  @Post(':id/dispatch')
  dispatch(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DispatchLetterDto) {
    return this.letters.dispatch(user, id, dto);
  }
}

@ApiTags('correspondence')
@ApiBearerAuth()
@Controller('letter-contacts')
export class LetterContactsController {
  constructor(private letters: CorrespondenceService) {}

  @ApiOperation({ summary: 'The address book: offices and people letters come from and go to' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListLetterContactsQuery) {
    return this.letters.contacts(user, q);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: LetterContactInput) {
    return this.letters.createContact(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLetterContactDto) {
    return this.letters.updateContact(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an entry no letter names; one in use is switched off instead' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.removeContact(user, id);
  }
}

@ApiTags('correspondence')
@ApiBearerAuth()
@Controller('letter-templates')
export class LetterTemplatesController {
  constructor(private letters: CorrespondenceService) {}

  @ApiOperation({ summary: "The company's letter templates (a company with none starts with the standard ones)" })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.letters.templates(user);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: LetterTemplateInput) {
    return this.letters.createTemplate(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLetterTemplateDto) {
    return this.letters.updateTemplate(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.letters.removeTemplate(user, id);
  }
}
