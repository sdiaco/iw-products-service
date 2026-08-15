import { DataTypes } from 'sequelize';
import type { Migration } from '../umzug';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable(
    'idempotency_keys',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      idempotencyKey: {
        type: 'VARCHAR(255) COLLATE utf8mb4_0900_as_cs',
        allowNull: false,
      },
      productId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
      requestHash: { type: DataTypes.CHAR(64), allowNull: false },
      // NULL means the request is still in flight.
      responseStatus: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
      responseBody: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    // An attribute-level `unique: 'name'` string is only collected into a named
    // constraint when a model is passed to createTable; a bare queryInterface
    // call (as here) silently drops it, so the unique key is declared explicitly.
    { uniqueKeys: { uq_idempotency_key: { fields: ['idempotencyKey'] } } },
  );
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('idempotency_keys');
};
