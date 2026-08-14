CREATE DATABASE IF NOT EXISTS ecommerce      CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS ecommerce_test CHARACTER SET utf8mb4;

CREATE USER IF NOT EXISTS 'products'@'%' IDENTIFIED BY 'products';
GRANT ALL PRIVILEGES ON ecommerce.*      TO 'products'@'%';
GRANT ALL PRIVILEGES ON ecommerce_test.* TO 'products'@'%';
FLUSH PRIVILEGES;
