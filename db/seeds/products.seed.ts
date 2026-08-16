import { Sequelize } from 'sequelize';

const catalogue = [
  { productToken: 'SKU-000001', name: 'Blue cotton shirt', price: '19.99', stock: 10 },
  { productToken: 'SKU-000002', name: 'Leather belt', price: '34.50', stock: 3 },
  { productToken: 'SKU-000003', name: 'Wool scarf', price: '24.00', stock: 0 },
  { productToken: 'SKU-000004', name: 'Canvas tote', price: '12.75', stock: 42 },
  { productToken: 'SKU-000005', name: 'Sample sachet', price: '0.00', stock: 100 },
];

async function seed(): Promise<void> {
  const sequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'ecommerce',
    username: process.env.DB_USER ?? 'products',
    password: process.env.DB_PASSWORD ?? 'products',
    logging: false,
  });

  for (const product of catalogue) {
    await sequelize.query(
      `INSERT IGNORE INTO products (productToken, name, price, stock, createdAt, updatedAt)
       VALUES (:productToken, :name, :price, :stock, NOW(3), NOW(3))`,
      { replacements: product },
    );
  }

  await sequelize.close();
}

void seed();
