import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AiStreamEvent } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { AiService } from './ai.service';
import { AiFeedbackDto, AskDto, UpdateAiSettingsDto } from './ai.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

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
