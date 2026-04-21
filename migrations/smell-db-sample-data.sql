-- Sample data for products
INSERT INTO products (name, slug, description, price, sale_price, sku, stock_qty, is_active) VALUES
('Lavender Soap', 'lavender-soap', 'Handmade lavender soap bar', 800, 700, 'LSOAP001', 50, 1),
('Citrus Candle', 'citrus-candle', 'Soy wax candle with citrus scent', 1200, NULL, 'CCANDLE001', 30, 1),
('Herbal Shampoo', 'herbal-shampoo', 'Natural herbal shampoo', 1500, 1200, 'HSHAMPOO001', 20, 1);

-- Sample data for product_images
INSERT INTO product_images (product_id, image_url, sort_order) VALUES
(1, 'https://example.com/images/lavender-soap-1.jpg', 1),
(2, 'https://example.com/images/citrus-candle-1.jpg', 1),
(3, 'https://example.com/images/herbal-shampoo-1.jpg', 1);

-- Sample data for categories
INSERT INTO categories (name, slug, parent_id) VALUES
('Bath', 'bath', NULL),
('Candles', 'candles', NULL),
('Hair Care', 'hair-care', NULL);

-- Sample data for product_categories
INSERT INTO product_categories (product_id, category_id) VALUES
(1, 1),
(2, 2),
(3, 3);

-- Sample data for carts
INSERT INTO carts (id, user_id) VALUES
('cart1', 1),
('cart2', 2);

-- Sample data for cart_items
INSERT INTO cart_items (cart_id, product_id, quantity) VALUES
('cart1', 1, 2),
('cart1', 2, 1),
('cart2', 3, 3);

-- Sample data for orders
INSERT INTO orders (user_id, cart_id, total, status) VALUES
(1, 'cart1', 2300, 'pending'),
(2, 'cart2', 3600, 'completed');

-- Sample data for order_items
INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES
(1, 1, 2, 700),
(1, 2, 1, 1200),
(2, 3, 3, 1200);
