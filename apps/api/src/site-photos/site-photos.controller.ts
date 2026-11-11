import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { CurrentUser, RequestUser } from '../common/current-user';
import { SitePhotosService, TIMELINE_DAYS, TIMELINE_LIMIT } from './site-photos.service';

class SitePhotosQuery {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'From this day (inclusive)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Up to this day (inclusive); today when left out' }) @IsOptional() @IsDateString() to?: string;
}

@ApiTags('site-photos')
@ApiBearerAuth()
@Controller('site-photos')
export class SitePhotosController {
  constructor(private photos: SitePhotosService) {}

  @ApiOperation({
    summary: "A project's photo timeline",
    description: `Photos on its progress entries, DPRs and inspections past draft, by the day taken (the last ${TIMELINE_DAYS} days unless told), each with where it was taken against the site's pin. At most ${TIMELINE_LIMIT}, the latest first; \`total\` counts them all.`,
  })
  @Get(':projectId')
  timeline(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Query() q: SitePhotosQuery) {
    return this.photos.timeline(user, projectId, q);
  }
}
