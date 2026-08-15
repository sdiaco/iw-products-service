import { Matches } from 'class-validator';
import { PRODUCT_TOKEN_PATTERN } from '../../products.constants';

export class ProductTokenParam {
  @Matches(PRODUCT_TOKEN_PATTERN, { message: 'productToken must be 8-64 URL-safe characters' })
  readonly productToken!: string;
}
