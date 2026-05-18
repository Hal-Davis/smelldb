-- Migration: Add session_id to cart_items for session-based cart management

ALTER TABLE cart_items ADD COLUMN session_id TEXT;
-- If you want to enforce uniqueness for (session_id, product_id), you can add a unique index:
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_session_product ON cart_items(session_id, product_id);
