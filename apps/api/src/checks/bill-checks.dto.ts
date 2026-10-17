import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class AcceptCheckDto {
  @ApiProperty({ description: "The flag's key, as the checks returned it" }) @IsString() @MinLength(1) @MaxLength(300) key!: string;
  @ApiProperty({ example: 'Rate revised by the PM on site, letter attached', description: 'Why the flag is accepted' }) @IsString() @MinLength(3) @MaxLength(500) note!: string;
}

export class ReopenCheckDto {
  @ApiProperty({ description: "The accepted flag's key" }) @IsString() @MinLength(1) @MaxLength(300) key!: string;
}

export class DraftVendorBillLineDto {
  @ApiProperty() @IsUUID() purchaseOrderLineId!: string;
  @ApiProperty() @IsNumber() @Min(0) quantity!: number;
  @ApiProperty() @IsNumber() @Min(0) rate!: number;
  @ApiProperty() @IsNumber() @Min(0) gstRate!: number;
}

export class DraftVendorBillDto {
  @ApiProperty() @IsUUID() purchaseOrderId!: string;
  @ApiProperty() @IsString() @MaxLength(60) invoiceNo!: string;
  @ApiProperty() @IsNumber() @Min(0) freight!: number;
  @ApiPropertyOptional({ nullable: true, description: "The invoice's printed total, to check against what the lines give" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() invoiceTotal?: number | null;
  @ApiProperty({ type: [DraftVendorBillLineDto] }) @ValidateNested({ each: true }) @Type(() => DraftVendorBillLineDto) @ArrayMinSize(1) @ArrayMaxSize(200) lines!: DraftVendorBillLineDto[];
}
