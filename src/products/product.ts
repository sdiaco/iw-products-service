/** What the repository returns and the service works with. Never the model. */
export interface Product {
  readonly productToken: string;
  readonly name: string;
  readonly price: string;
  readonly stock: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewProduct {
  readonly productToken: string;
  readonly name: string;
  readonly price: string;
  readonly stock: number;
}

export interface PageMeta {
  readonly page: number;
  readonly size: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly meta: PageMeta;
}
