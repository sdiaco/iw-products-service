import { DataTypes } from 'sequelize';
import type { Migration } from '../umzug';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable(
    'products',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      // Explicitly case-sensitive: MySQL 8.4 defaults to a case-insensitive
      // collation, under which 'SKU-1' and 'sku-1' would collide on the unique key.
      productToken: {
        type: 'VARCHAR(64) COLLATE utf8mb4_0900_as_cs',
        allowNull: false,
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      // Signed on purpose: with UNSIGNED, `stock + :delta >= 0` does unsigned
      // arithmetic and raises ER_DATA_OUT_OF_RANGE instead of not matching.
      stock: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: { type: DataTypes.DATE(3), allowNull: false },
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    // An attribute-level `unique: 'name'` string is only collected into a named
    // constraint when a model is passed to createTable; a bare queryInterface
    // call (as here) silently drops it, so the unique key is declared explicitly.
    { uniqueKeys: { uq_products_productToken: { fields: ['productToken'] } } },
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE products ADD CONSTRAINT ck_products_price CHECK (price >= 0)',
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE products ADD CONSTRAINT ck_products_stock CHECK (stock >= 0)',
  );
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('products');
};
