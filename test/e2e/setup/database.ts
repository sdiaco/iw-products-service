import { Sequelize } from 'sequelize';

/**
 * DELETE, not TRUNCATE: MySQL refuses to truncate a table referenced by a
 * foreign key, even when the referencing table is empty.
 */
export async function resetDatabase(sequelize: Sequelize): Promise<void> {
  await sequelize.query('DELETE FROM idempotency_keys');
  await sequelize.query('DELETE FROM products');
  await sequelize.query('ALTER TABLE products AUTO_INCREMENT = 1');
}
