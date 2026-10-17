import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';

export class StartDirectUploadDto {
  @ApiProperty({ example: 'Invoice KBA-0213.pdf' }) @IsString() @MinLength(1) @MaxLength(200) fileName!: string;
  @ApiProperty({ example: 'application/pdf' }) @IsString() @MaxLength(100) mimeType!: string;
  @ApiProperty({ description: 'Bytes' }) @IsInt() @Min(1) size!: number;
}

export class CompleteDirectUploadDto {
  @ApiProperty({ description: 'The path `/uploads/direct` returned' }) @IsString() @MaxLength(300) pathname!: string;
  @ApiProperty({ description: 'The URL Blob storage returned' }) @IsUrl({ protocols: ['https'], require_protocol: true }) url!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) fileName!: string;
}
