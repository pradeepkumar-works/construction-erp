import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EWAY_MAX_KM, EWB_CANCEL_REASONS, GST_STATES, EWB_EXTEND_REASONS, GST_SOURCE_KINDS, IRN_CANCEL_REASONS, TRANSPORT_MODES, VEHICLE_TYPES, type GstSourceKind, type TransportMode, type VehicleType } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class GstSourceParams {
  @ApiProperty({ enum: GST_SOURCE_KINDS }) @IsIn(GST_SOURCE_KINDS) sourceKind: GstSourceKind;
  @ApiProperty() @IsString() @MaxLength(64) sourceId: string;
}

/** An IRN takes nothing; an e-way bill takes how the goods go. */
export class GenerateGstDocumentDto {
  @ApiPropertyOptional({ enum: Object.keys(TRANSPORT_MODES), default: '1', description: 'E-way bill: 1 road, 2 rail, 3 air, 4 ship' }) @IsOptional() @IsIn(Object.keys(TRANSPORT_MODES)) mode?: TransportMode;
  @ApiPropertyOptional({ example: 'OD02AB1234', description: 'E-way bill by road: the vehicle number' }) @IsOptional() @trim() @IsString() @MaxLength(20) vehicleNo?: string | null;
  @ApiPropertyOptional({ enum: Object.keys(VEHICLE_TYPES), default: 'R' }) @IsOptional() @IsIn(Object.keys(VEHICLE_TYPES)) vehicleType?: VehicleType;
  @ApiPropertyOptional({ example: 42, description: 'E-way bill: the distance by road in km' }) @IsOptional() @IsInt() @Min(1) @Max(EWAY_MAX_KM) distanceKm?: number;
}

export class CancelGstDocumentDto {
  @ApiProperty({ example: '2', description: `IRN: ${JSON.stringify(IRN_CANCEL_REASONS)}; e-way bill: ${JSON.stringify(EWB_CANCEL_REASONS)}` }) @IsIn(['1', '2', '3', '4']) reason: string;
  @ApiProperty({ example: 'Wrong quantity typed' }) @trim() @IsString() @MinLength(3) @MaxLength(100) remark: string;
}

export class ExtendEwayBillDto {
  @ApiProperty({ example: 'Near Cuttack 753001', description: 'Where the goods are now, with its PIN code' }) @trim() @IsString() @MaxLength(200) fromPlace: string;
  @ApiProperty({ enum: Object.keys(GST_STATES), example: '21', description: 'The GST state the goods are in now' })
  @IsIn(Object.keys(GST_STATES), { message: 'Choose the state the goods are in now' })
  fromState: string;
  @ApiProperty({ example: 40 }) @IsInt() @Min(1) @Max(EWAY_MAX_KM) remainingKm: number;
  @ApiPropertyOptional({ example: 'OD02AB1234' }) @IsOptional() @trim() @IsString() @MaxLength(20) vehicleNo?: string | null;
  @ApiPropertyOptional({ enum: Object.keys(TRANSPORT_MODES), default: '1' }) @IsOptional() @IsIn(Object.keys(TRANSPORT_MODES)) mode?: TransportMode;
  @ApiProperty({ example: '5', description: JSON.stringify(EWB_EXTEND_REASONS) }) @IsIn(Object.keys(EWB_EXTEND_REASONS)) reason: string;
  @ApiProperty({ example: 'The truck broke down' }) @trim() @IsString() @MinLength(3) @MaxLength(50) remark: string;
}
