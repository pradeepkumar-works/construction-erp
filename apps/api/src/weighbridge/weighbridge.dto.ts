import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { WEIGH_MAX_KG, WEIGH_MIN_KG } from '@erp/shared';
import { IsQuantity } from '../common/quantity';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const qty = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

export class WeighbridgeQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

/** A weight for a ticket: the bridge's weighing, or one typed when the bridge's reading is not there. */
export class WeightDto {
  @ApiPropertyOptional({ description: "The bridge's weighing (Stock › Weighbridge, On the bridge). Send this or weightKg." })
  @ValidateIf((o: WeightDto) => o.weightKg === undefined || o.weightKg === null)
  @IsUUID()
  weighingId?: string;
  @ApiPropertyOptional({ example: 26420, description: 'A weight typed from the indicator, when the Connector did not send it; the ticket shows it as typed' })
  @ValidateIf((o: WeightDto) => !o.weighingId)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Type the weight in kilograms' })
  @Min(WEIGH_MIN_KG, { message: `A truck weighs at least ${WEIGH_MIN_KG} kg` })
  @Max(WEIGH_MAX_KG, { message: `A weighbridge weighs up to ${WEIGH_MAX_KG.toLocaleString('en-IN')} kg` })
  weightKg?: number;
}

export class TicketDetailsDto {
  @ApiPropertyOptional({ description: 'An approved, open purchase order of the project; the GRN is drafted against it' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() purchaseOrderId?: string | null;
  @ApiPropertyOptional({ description: "The order's line the truck brings" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() purchaseOrderLineId?: string | null;
  @ApiPropertyOptional({ example: 'CH-2231' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @trim() @MaxLength(60) challanNo?: string | null;
  @ApiPropertyOptional({ example: '18', description: "The challan's quantity in the order line's unit, checked against the net weight" }) @IsOptional() @ValidateIf((_, v) => v !== null) @qty() @IsQuantity() challanQty?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) remarks?: string | null;
}

export class CreateWeighTicketDto extends TicketDetailsDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'OD 02 AB 1234' }) @IsString() @trim() @MinLength(3, { message: "Type the truck's number" }) @MaxLength(30) vehicleNo: string;
  @ApiProperty({ type: WeightDto, description: 'The first weight' }) @ValidateNested() @Type(() => WeightDto) first: WeightDto;
}

export class UpdateWeighTicketDto extends TicketDetailsDto {
  @ApiPropertyOptional({ example: 'OD 02 AB 1234' }) @IsOptional() @IsString() @trim() @MinLength(3, { message: "Type the truck's number" }) @MaxLength(30) vehicleNo?: string;
}

export class CancelWeighTicketDto {
  @ApiProperty({ example: 'Truck turned back, wrong material' }) @IsString() @trim() @MinLength(3, { message: 'Say why the ticket is cancelled' }) @MaxLength(300) reason: string;
}
