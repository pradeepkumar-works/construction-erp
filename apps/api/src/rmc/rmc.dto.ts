import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { PAYMENT_MODES, RMC_BATCH_STATUSES, RMC_GRADES, RMC_ORDER_STATUSES, type PaymentMode, type RmcBatchStatus, type RmcOrderStatus } from '@erp/shared';
import { PageQuery } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const Qty = (message: string) => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 3 }, { message }), Min(0.001, { message }), Max(1_000_000)].forEach((d) => d(target, key));
const Rate = (message: string) => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }, { message }), Min(0, { message }), Max(10_000_000)].forEach((d) => d(target, key));

export class MixDesignLineInput {
  @ApiProperty() @IsUUID('4', { message: 'Choose the material' }) itemId: string;
  @ApiProperty({ example: 0.38, description: 'Per cubic metre of concrete, in the item’s unit' }) @Qty('Enter how much goes into a cubic metre') quantity: number;
}

export class CreateMixDesignDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the plant' }) plantId: string;
  @ApiProperty({ example: 'M25-OPC-01' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter a code for the design' }) @MaxLength(40) code: string;
  @ApiProperty({ enum: RMC_GRADES }) @IsIn(RMC_GRADES as unknown as string[], { message: 'Choose the grade' }) grade: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) description?: string | null;
  @ApiPropertyOptional({ example: 120 }) @IsOptional() @opt() @IsInt() @Min(0) @Max(300) slumpMm?: number | null;
  @ApiProperty({ type: [MixDesignLineInput] }) @IsArray() @ArrayMinSize(1, { message: 'Add the materials that go into it' }) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => MixDesignLineInput) lines: MixDesignLineInput[];
}

/** A design waiting for approval can change; an approved one is retired and a new one made. */
export class UpdateMixDesignDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter a code for the design' }) @MaxLength(40) code?: string;
  @ApiPropertyOptional({ enum: RMC_GRADES }) @IsOptional() @IsIn(RMC_GRADES as unknown as string[]) grade?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsInt() @Min(0) @Max(300) slumpMm?: number | null;
  @ApiPropertyOptional({ type: [MixDesignLineInput] }) @IsOptional() @IsArray() @ArrayMinSize(1, { message: 'Add the materials that go into it' }) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => MixDesignLineInput) lines?: MixDesignLineInput[];
}

export class MixDesignQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() plantId?: string;
}

export class CreateRmcOrderDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the plant' }) plantId: string;
  @ApiProperty({ example: '2026-10-22' }) @IsDateString({}, { message: 'Choose the date' }) date: string;
  @ApiPropertyOptional({ description: 'The customer; or `projectId` for an own site' }) @IsOptional() @opt() @IsUUID() clientId?: string | null;
  @ApiPropertyOptional({ description: 'An own site supplied from the plant (no GST bill)' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ example: 'Tower B raft, Patia' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(200) site?: string | null;
  @ApiProperty() @IsUUID('4', { message: 'Choose the mix design' }) mixDesignId: string;
  @ApiProperty({ example: 30 }) @Qty('Enter the cubic metres') quantity: number;
  @ApiProperty({ example: 5450 }) @Rate('Enter the rate a cubic metre') rate: number;
  @ApiPropertyOptional({ example: 350, description: 'Per cubic metre pumped; null when the customer pours by themselves' }) @IsOptional() @opt() @Rate('Enter the pumping rate a cubic metre') pumpRate?: number | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() pourDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() validUntil?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(1000) notes?: string | null;
}

export class UpdateRmcOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(200) site?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() mixDesignId?: string;
  @ApiPropertyOptional() @IsOptional() @Qty('Enter the cubic metres') quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Rate('Enter the rate a cubic metre') rate?: number;
  @ApiPropertyOptional() @IsOptional() @opt() @Rate('Enter the pumping rate a cubic metre') pumpRate?: number | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() pourDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() validUntil?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(1000) notes?: string | null;
}

export class RmcOrderQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() plantId?: string;
  @ApiPropertyOptional({ enum: RMC_ORDER_STATUSES }) @IsOptional() @IsIn(RMC_ORDER_STATUSES as unknown as string[]) status?: RmcOrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
}

export class NoteDto {
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
}

export class BatchLineInput {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ description: 'As weighed, from the batcher’s printout' }) @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Enter the weighed quantity' }) @Min(0) @Max(1_000_000) actualQty: number;
}

/** A truck leaving the plant: the batch and its challan. The materials go out of the plant's stock at the design, or as weighed. */
export class DispatchBatchDto {
  @ApiPropertyOptional({ description: 'The phone’s own id for the batch, so a retry returns the same one' }) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID('4', { message: 'Choose the order' }) orderId: string;
  @ApiProperty({ example: 6 }) @Qty('Enter the cubic metres on the truck') quantity: number;
  @ApiPropertyOptional({ example: 'OD02AB1234' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(30) truck?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(80) driver?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pumped?: boolean;
  @ApiPropertyOptional({ example: 110 }) @IsOptional() @opt() @IsInt() @Min(0) @Max(300) slumpMm?: number | null;
  @ApiPropertyOptional({ type: [BatchLineInput], description: 'Weighed quantities where they differ from the design' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => BatchLineInput) lines?: BatchLineInput[];
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
}

export class DeliverBatchDto {
  @ApiProperty({ example: 'R. Sahoo, site engineer' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter who received the concrete' }) @MaxLength(120) receivedBy: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
}

export class RejectBatchDto {
  @ApiProperty({ example: 'Slump 40 mm at site, asked for 120' }) @trim() @IsString() @IsNotEmpty({ message: 'Say why the site turned the truck back' }) @MaxLength(500) note: string;
}

export class RmcBatchQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() plantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orderId?: string;
  @ApiPropertyOptional({ enum: RMC_BATCH_STATUSES }) @IsOptional() @IsIn(RMC_BATCH_STATUSES as unknown as string[]) status?: RmcBatchStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class RmcDayQuery {
  @ApiPropertyOptional({ description: 'Today when left out' }) @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() plantId?: string;
}

export class CreateRmcInvoiceDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the order' }) orderId: string;
  @ApiProperty() @IsDateString({}, { message: 'Choose the bill date' }) date: string;
  @ApiPropertyOptional({ description: 'The delivered challans to bill; all of the order’s unbilled ones when left out' }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true }) batchIds?: string[];
}

export class RmcInvoiceQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() plantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional({ description: 'Only bills with money still due' }) @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() due?: boolean;
}

export class CreateRmcReceiptDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the customer' }) clientId: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() invoiceId?: string | null;
  @ApiProperty() @IsDateString({}, { message: 'Choose the date' }) date: string;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter the amount received' }) @Min(0.01, { message: 'Enter the amount received' }) @Max(10_000_000_000) amount: number;
  @ApiProperty({ enum: PAYMENT_MODES }) @IsIn(PAYMENT_MODES.filter((m) => m !== 'CREDIT') as unknown as string[], { message: 'Choose how it was paid' }) mode: PaymentMode;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(100) reference?: string | null;
}

export class RmcReceiptQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
}
