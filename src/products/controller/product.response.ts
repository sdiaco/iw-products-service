import { ApiProperty } from '@nestjs/swagger';
import type { PageMeta, Product } from '../product';

export class ProductResponse {
  @ApiProperty({ example: 'SKU-000123' }) readonly productToken: string;
  @ApiProperty({ example: 'Blue cotton shirt' }) readonly name: string;
  @ApiProperty({ type: String, example: '19.99' }) readonly price: string;
  @ApiProperty({ example: 10 }) readonly stock: number;
  @ApiProperty({ example: '2026-08-14T10:00:00.000Z' }) readonly createdAt: string;
  @ApiProperty({ example: '2026-08-14T10:00:00.000Z' }) readonly updatedAt: string;

  private constructor(product: Product) {
    this.productToken = product.productToken;
    this.name = product.name;
    this.price = product.price;
    this.stock = product.stock;
    this.createdAt = product.createdAt.toISOString();
    this.updatedAt = product.updatedAt.toISOString();
  }

  /** Explicit field by field, so a new column cannot leak into the API. */
  static from(product: Product): ProductResponse {
    return new ProductResponse(product);
  }
}

export interface DataResponse<T> {
  readonly data: T;
}

export interface PagedResponse<T> {
  readonly data: readonly T[];
  readonly meta: PageMeta;
}
