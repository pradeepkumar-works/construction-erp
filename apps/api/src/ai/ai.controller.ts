import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AiStreamEvent } from '@erp/shared';
import { DOC_READ_MAX_PAGES, DOC_READ_MAX_PAGE_BYTES } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { AiService } from './ai.service';
import { AiReadService } from './ai-read.service';
import { AiFeedbackDto, AskDto, ReadDocumentDto, UpdateAiSettingsDto } from './ai.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private ai: AiService, private reader: AiReadService) {}

  @ApiOperation({ summary: 'Whether Ask Nirmaan is on for you', description: 'On for the company, set up on the server, within the monthly allowance, and questions left today.' })
  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.ai.status(user);
  }

  @ApiOperation({
    summary: 'Ask a question',
    description:
      'Answers from the company records the caller can see, as server-sent events: `thread`, then `status` while records are read, `text` pieces of the answer, and `done` with the stored answer (links kept only to records the tools returned, figures not found in them listed in `unverified`). Refusals come back as plain errors before the stream starts.',
  })
  @ApiProduces('text/event-stream')
  @Post('ask')
  async ask(@CurrentUser() user: RequestUser, @Body() dto: AskDto, @Res() res: Response) {
    await this.ai.assertCanAsk(user);
    this.ai.assertModel(dto.model);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const stop = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) stop.abort();
    });
    const send = (e: AiStreamEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    try {
      await this.ai.ask(user, dto, send, stop.signal);
    } catch (e) {
      send({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      res.end();
    }
  }

  @ApiOperation({
    summary: 'Read an invoice, delivery challan or drawing title block',
    description: `Page images (JPEG, PNG or WebP; at most ${DOC_READ_MAX_PAGES}) in \`pages\`. Returns what is printed, each value with its page, its box on the page and a confidence; invoices also get the vendor, order and order lines they match. Saves nothing but the cost of the call, which counts in the monthly allowance.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['kind', 'pages'], properties: { kind: { type: 'string', enum: ['invoice', 'challan', 'drawing'] }, purchaseOrderId: { type: 'string', format: 'uuid' }, pages: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
  @Post('read')
  @UseInterceptors(FilesInterceptor('pages', DOC_READ_MAX_PAGES, { storage: memoryStorage(), limits: { fileSize: DOC_READ_MAX_PAGE_BYTES } }))
  read(@CurrentUser() user: RequestUser, @Body() dto: ReadDocumentDto, @UploadedFiles() pages: Express.Multer.File[] = []) {
    return this.reader.read(user, dto.kind, pages, dto.purchaseOrderId);
  }

  @ApiOperation({ summary: 'Your conversations', description: 'The 30 most recent, newest first.' })
  @Get('threads')
  threads(@CurrentUser() user: RequestUser) {
    return this.ai.threads(user);
  }

  @ApiOperation({ summary: 'One conversation with its questions and answers' })
  @Get('threads/:id')
  thread(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.thread(user, id);
  }

  @ApiOperation({ summary: 'Delete one of your conversations' })
  @Delete('threads/:id')
  deleteThread(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.deleteThread(user, id);
  }

  @ApiOperation({ summary: 'Rate an answer', description: 'Helpful (1) or not (-1), or null to clear; the company admins see the ratings.' })
  @Post('messages/:id/feedback')
  feedback(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AiFeedbackDto) {
    return this.ai.feedback(user, id, dto.value);
  }

  @ApiOperation({ summary: "The company's Ask Nirmaan settings and this month's use", description: 'Admins.' })
  @Get('settings')
  settings(@CurrentUser() user: RequestUser) {
    return this.ai.settings(user);
  }

  @ApiOperation({ summary: 'Switch Ask Nirmaan on or off, or set the monthly allowance', description: 'Admins.' })
  @Patch('settings')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: UpdateAiSettingsDto) {
    return this.ai.updateSettings(user, dto);
  }
}
