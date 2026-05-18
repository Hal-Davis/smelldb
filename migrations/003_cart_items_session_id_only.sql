-- Migration: Make cart_id nullable in cart_items (for session-based carts)

-- SQLite does not support ALTER COLUMN directly, so we need to recreate the table if we want to change constraints.
-- The following is a safe pattern for SQLite migrations:

PRAGMA foreign_keys=off;

CREATE TABLE cart_items_new AS SELECT * FROM cart_items;

DROP TABLE cart_items;

CREATE TABLE cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id),
    -- cart_id is removed or made nullable (if you want to keep it, add: cart_id INTEGER)
    -- add other columns as needed
    FOREIGN KEY(product_id) REFERENCES products(id)
);

INSERT INTO cart_items (id, session_id, product_id, quantity, user_id)
SELECT id, session_id, product_id, quantity, user_id FROM cart_items_new;

DROP TABLE cart_items_new;

PRAGMA foreign_keys=on;
