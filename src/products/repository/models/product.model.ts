import type { Provider } from '@nestjs/common';
import {
  DataTypes,
  Model,
  Sequelize,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { PRODUCT_MODEL, SEQUELIZE } from '../../../database/database.tokens';
import type { Product } from '../../product';

export class ProductModel extends Model<
  InferAttributes<ProductModel>,
  InferCreationAttributes<ProductModel>
> {
  declare readonly id: CreationOptional<number>;
  declare readonly productToken: string;
  declare readonly name: string;
  declare readonly price: string;
  declare readonly stock: number;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initProductModel(sequelize: Sequelize): typeof ProductModel {
  ProductModel.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      productToken: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: 'uq_products_productToken',
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      // mysql2 hands DECIMAL back as a string, which is exactly what we want.
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      stock: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: DataTypes.DATE(3),
      updatedAt: DataTypes.DATE(3),
    },
    { sequelize, tableName: 'products', timestamps: true },
  );
  return ProductModel;
}

/** `id` is deliberately absent: it must never leave the repository. */
export function toProduct(row: ProductModel): Product {
  return {
    productToken: row.productToken,
    name: row.name,
    price: row.price,
    stock: row.stock,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const productModelProvider: Provider = {
  provide: PRODUCT_MODEL,
  inject: [SEQUELIZE],
  useFactory: (sequelize: Sequelize): typeof ProductModel => initProductModel(sequelize),
};
