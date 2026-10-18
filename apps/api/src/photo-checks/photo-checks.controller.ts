import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, PipeTransform, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';
import { PHOTO_CHECK_KINDS, type PhotoCheckKind } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PhotoChecksService } from './photo-checks.service';

class KindPipe implements PipeTransform<string, PhotoCheckKind> {
  transform(v: string): PhotoCheckKind {
    if (!(PHOTO_CHECK_KINDS as readonly string[]).includes(v)) throw new BadRequestException(`Photo checks are for ${PHOTO_CHECK_KINDS.join(', ')}`);
    return v as PhotoCheckKind;
  }
}
const kindParam = { name: 'kind', enum: PHOTO_CHECK_KINDS };

class SnagDraftRequestDto {
  @ApiProperty({ description: 'The photo, uploaded by this user or already on a snag of the project' }) @IsUUID() attachmentId!: string;
  @ApiProperty() @IsUUID() projectId!: string;
}

class PhotoFlagsDto {
  @ApiProperty({ description: 'True hides the flags on the project’s photos (captions still show)' }) @IsBoolean() flagsOff!: boolean;
}

@ApiTags('photo-checks')
@ApiBearerAuth()
@Controller('photo-checks')
export class PhotoChecksController {
  constructor(private photos: PhotoChecksService) {}

  @ApiOperation({
    summary: "A record's photo captions and flags",
    description: 'For a DPR, a progress entry, a safety incident or a snag, to whoever may see the record. Advisory only. `pending` counts photos not checked yet; POST `/run` checks them.',
  })
  @ApiParam(kindParam)
  @Get(':kind/:id')
  get(@CurrentUser() user: RequestUser, @Param('kind', KindPipe) kind: PhotoCheckKind, @Param('id', ParseUUIDPipe) id: string) {
    return this.photos.get(user, kind, id);
  }

  @ApiOperation({ summary: "Check a record's next unchecked photos", description: 'A few photos per call, counted in the company’s monthly Ask Nirmaan allowance. Each photo is checked once.' })
  @ApiParam(kindParam)
  @Post(':kind/:id/run')
  run(@CurrentUser() user: RequestUser, @Param('kind', KindPipe) kind: PhotoCheckKind, @Param('id', ParseUUIDPipe) id: string) {
    return this.photos.run(user, kind, id);
  }

  @ApiOperation({ summary: 'Draft a snag from its photo', description: 'Title, description, location and trade for the snag form. Nothing is saved until the user saves the snag.' })
  @Post('snag-draft')
  snagDraft(@CurrentUser() user: RequestUser, @Body() dto: SnagDraftRequestDto) {
    return this.photos.snagDraft(user, dto.attachmentId, dto.projectId);
  }

  @ApiOperation({ summary: "Switch a project's photo flags off or on", description: 'By the safety officer or a project approver. Audited.' })
  @Put('projects/:projectId')
  setFlags(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: PhotoFlagsDto) {
    return this.photos.setFlagsOff(user, projectId, dto.flagsOff);
  }
}
