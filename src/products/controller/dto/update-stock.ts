import { IsInt, Max, Min, NotEquals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { INT_MAX } from '../../products.constants';

export class UpdateStockDto {
  @ApiProperty({ example: -3, description: 'Non-zero signed change in stock' })
  @IsInt()
  @NotEquals(0)
  @Min(-INT_MAX)
  @Max(INT_MAX)
  readonly delta!: number;
}
