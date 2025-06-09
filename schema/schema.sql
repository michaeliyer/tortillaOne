PRAGMA foreign_keys = ON;

-- Drop existing tables (optional for dev resets)
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS products;

-- Products: each tortilla variant and its price
CREATE TABLE products (
  product_id INTEGER PRIMARY KEY AUTOINCREMENT,
  color TEXT NOT NULL,               -- e.g., Yellow, White, Blue
  variant TEXT NOT NULL,             -- e.g., 8 Pack, Masa
  price REAL NOT NULL
);

-- Customers: ordering info
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

-- Orders: main order record
CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  order_date TEXT DEFAULT (datetime('now', 'localtime')),
  delivery_fee REAL NOT NULL,
  total_price REAL NOT NULL,         -- full cost (items + delivery)
  payments REAL DEFAULT 0.0,         -- payments received (can be partial)
  balance REAL GENERATED ALWAYS AS (total_price - payments) STORED,
  status TEXT DEFAULT 'open',        -- 'open' or 'closed'
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Order Items: line items linked to orders
CREATE TABLE order_items (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);


-- your CREATE TABLE statements...

-- Seed product data
INSERT INTO products (color, variant, price) VALUES
('Yellow', '8 Pack', 5.00),
('Yellow', '12 Pack', 7.00),
('Yellow', '1 Pound', 4.00),
('Yellow', '2 Pound', 7.50),
('Yellow', 'Chips', 3.00),
('Yellow', 'Masa', 2.00),
('White', '8 Pack', 5.00),
('White', '12 Pack', 7.00),
('White', '1 Pound', 4.00),
('White', '2 Pound', 7.50),
('White', 'Masa', 2.00),
('Blue', '8 Pack', 6.00),
('Blue', '12 Pack', 8.00),
('Blue', '1 Pound', 5.00),
('Blue', '2 Pound', 8.50),
('Blue', 'Masa', 2.50);