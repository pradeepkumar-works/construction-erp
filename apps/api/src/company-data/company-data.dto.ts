import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ExportPageQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 1000, minimum: 1, maximum: 2000 }) @IsOptional() @IsInt() @Min(1) @Max(2000) pageSize?: number;
}

export class RequestDeletionDto {
  @ApiProperty({ description: 'The company name, typed to confirm', example: 'Demo Infra Projects Pvt Ltd' }) @IsString() @MaxLength(200) companyName: string;
}
