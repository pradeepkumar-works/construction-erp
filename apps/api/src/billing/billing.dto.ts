import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { GSTIN_PATTERN, GST_STATES } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value));

export class BillingDetailsInput {
  @ApiProperty({ example: 'Demo Infra Projects Pvt Ltd', description: 'Legal name on the invoice' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional({ example: '21AAACD1234F1Z5' }) @IsOptional() @upper() @ValidateIf((_, v) => v !== null) @Matches(GSTIN_PATTERN, { message: 'GSTIN must be 15 characters, like 21AAAGO1234F1Z5' }) gstin?: string | null;
  @ApiProperty({ example: 'Plot 12, Saheed Nagar, Bhubaneswar 751007' }) @trim() @IsString() @IsNotEmpty() @MaxLength(500) address: string;
  @ApiPropertyOptional({ example: '21', description: 'GST state code of the place of supply; taken from the GSTIN when one is given' })
  @IsOptional()
  @IsIn(Object.keys(GST_STATES))
  stateCode?: string | null;
}

export class CreateOrderDto {
  @ApiProperty({ enum: [1, 12], description: 'Pay for a month, or a year (charged as 10 months)' }) @IsIn([1, 12]) months: 1 | 12;
}

export class VerifyPaymentDto {
  @ApiProperty({ description: 'razorpay_order_id from Checkout' }) @IsString() @MaxLength(100) orderId: string;
  @ApiProperty({ description: 'razorpay_payment_id from Checkout' }) @IsString() @MaxLength(100) paymentId: string;
  @ApiProperty({ description: 'razorpay_signature from Checkout' }) @IsString() @MaxLength(200) signature: string;
}
