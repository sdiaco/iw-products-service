import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { INT_MAX, PRICE_PATTERN, PRODUCT_TOKEN_PATTERN } from '../../products.constants';
import { toDecimalString, trimValue } from './transformers';

export class CreateProductDto {
  @ApiProperty({ example: 'SKU-000123' })
  @Matches(PRODUCT_TOKEN_PATTERN, { message: 'productToken must be 8-64 URL-safe characters' })
  readonly productToken!: string;

  @ApiProperty({ example: 'Blue cotton shirt' })
  @Transform(trimValue)
  @IsString()
  @Length(1, 255)
  readonly name!: string;

  @ApiProperty({ type: String, example: '19.99' })
  @Transform(toDecimalString)
  @Matches(PRICE_PATTERN, { message: 'price must have at most 8 integer digits and 2 decimals' })
  readonly price!: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  @Max(INT_MAX)
  readonly stock!: number;
}
