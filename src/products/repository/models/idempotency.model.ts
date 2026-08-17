import type { Provider } from '@nestjs/common';
import {
  DataTypes,
  Model,
  Sequelize,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { IDEMPOTENCY_MODEL, SEQUELIZE } from '../../../database/database.tokens';

export class IdempotencyKeyModel extends Model<
  InferAttributes<IdempotencyKeyModel>,
  InferCreationAttributes<IdempotencyKeyModel>
> {
  declare id: CreationOptional<number>;
  declare idempotencyKey: string;
  declare productId: number;
  declare requestHash: string;
  declare responseStatus: number | null;
  declare responseBody: unknown;
  declare createdAt: CreationOptional<Date>;
}

export function initIdempotencyKeyModel(sequelize: Sequelize): typeof IdempotencyKeyModel {
  IdempotencyKeyModel.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      idempotencyKey: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      requestHash: { type: DataTypes.CHAR(64), allowNull: false },
      responseStatus: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
      responseBody: { type: DataTypes.JSON, allowNull: true },
      createdAt: DataTypes.DATE(3),
    },
    { sequelize, tableName: 'idempotency_keys', timestamps: false },
  );
  return IdempotencyKeyModel;
}

export const idempotencyModelProvider: Provider = {
  provide: IDEMPOTENCY_MODEL,
  inject: [SEQUELIZE],
  useFactory: (sequelize: Sequelize): typeof IdempotencyKeyModel =>
    initIdempotencyKeyModel(sequelize),
};
