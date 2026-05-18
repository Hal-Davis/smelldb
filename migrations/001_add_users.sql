-- Migration: Add users table and link carts/orders to users

-- 1. Create users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add user_id to cart_items (nullable for guest carts)
ALTER TABLE cart_items ADD COLUMN user_id INTEGER REFERENCES users(id);

-- 3. Add user_id to orders (nullable for guest orders)
ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id);
