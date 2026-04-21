// index.ts — Cloudflare Worker Server Entrypoint

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Max-Age": "86400"
        };

        // Handle CORS preflight
        if (method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }

        // ============================================================
        // PRODUCTS COUNT
        // ============================================================
        if (path === "/api/products/count" && method === "GET") {
            try {
                const { results } = await env.DB.prepare(
                    `SELECT COUNT(*) as count FROM products WHERE is_active = 1`
                ).all();

                return new Response(JSON.stringify({ count: results[0]?.count ?? 0 }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Error fetching product count: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // ============================================================
        // PRODUCTS LIST
        // ============================================================
        if (path === "/api/products" && method === "GET") {
            try {
                const { results } = await env.DB.prepare(
                    `SELECT 
                        p.*,
                        (
                            SELECT image_url 
                            FROM product_images 
                            WHERE product_id = p.id 
                            ORDER BY sort_order 
                            LIMIT 1
                        ) AS main_image
                    FROM products p
                    WHERE p.is_active = 1`
                ).all();

                return new Response(JSON.stringify(results), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Error fetching products: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // ============================================================
        // PRODUCT BY ID (LEGACY ENDPOINT)
        // ============================================================
        if (path.startsWith("/api/products/id/") && method === "GET") {
            try {
                const idStr = path.split("/api/products/id/")[1];
                const id = parseInt(idStr, 10);

                if (isNaN(id)) {
                    return new Response("Invalid product ID", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                const product = await env.DB.prepare(
                    `SELECT * FROM products WHERE id = ? AND is_active = 1`
                ).bind(id).first();

                if (!product) {
                    return new Response("Product not found", {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                const { results: images } = await env.DB.prepare(
                    `SELECT * FROM product_images 
                     WHERE product_id = ? 
                     ORDER BY sort_order`
                ).bind(product.id).all();

                return new Response(JSON.stringify({ ...product, images }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Error fetching product: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // ============================================================
        // PRODUCT BY SLUG OR ID (SMART RESOLVER)
        // ============================================================
        if (path.startsWith("/api/products/") && method === "GET") {
            try {
                const value = path.split("/").pop();

                // If numeric → treat as ID
                if (/^\d+$/.test(value)) {
                    const id = parseInt(value, 10);

                    const product = await env.DB.prepare(
                        `SELECT * FROM products WHERE id = ? AND is_active = 1`
                    ).bind(id).first();

                    if (!product) {
                        return new Response("Product not found", {
                            status: 404,
                            headers: corsHeaders
                        });
                    }

                    const { results: images } = await env.DB.prepare(
                        `SELECT * FROM product_images 
                         WHERE product_id = ? 
                         ORDER BY sort_order`
                    ).bind(product.id).all();

                    return new Response(JSON.stringify({ ...product, images }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }

                // Otherwise treat as slug
                const slug = value;

                const product = await env.DB.prepare(
                    `SELECT * FROM products WHERE slug = ? AND is_active = 1`
                ).bind(slug).first();

                if (!product) {
                    return new Response("Product not found", {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                const { results: images } = await env.DB.prepare(
                    `SELECT * FROM product_images 
                     WHERE product_id = ? 
                     ORDER BY sort_order`
                ).bind(product.id).all();

                return new Response(JSON.stringify({ ...product, images }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (err) {
                return new Response("Error fetching product: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // ============================================================
        // CART ENDPOINTS (UNCHANGED)
        // ============================================================

        // GET CART
        if (path === "/api/cart" && method === "GET") {
            try {
                let sessionId = request.headers.get("Cookie")?.match(/session_id=([^;]+)/)?.[1];
                if (!sessionId) sessionId = crypto.randomUUID();

                const { results } = await env.DB.prepare(
                    `SELECT 
                        c.id,
                        c.product_id,
                        c.quantity,
                        p.name,
                        p.price,
                        (
                            SELECT image_url 
                            FROM product_images 
                            WHERE product_id = p.id 
                            ORDER BY sort_order 
                            LIMIT 1
                        ) AS main_image
                    FROM cart_items c
                    JOIN products p ON p.id = c.product_id
                    WHERE c.session_id = ?`
                ).bind(sessionId).all();

                return new Response(JSON.stringify(results), {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                        "Set-Cookie": `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
                    }
                });
            } catch (err) {
                return new Response("Error fetching cart: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // ADD TO CART
        if (path === "/api/cart/items" && method === "POST") {
            try {
                const body = await request.json();
                const { product_id, quantity } = body;

                if (!product_id || !quantity) {
                    return new Response("Missing product_id or quantity", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                let sessionId = request.headers.get("Cookie")?.match(/session_id=([^;]+)/)?.[1];
                if (!sessionId) sessionId = crypto.randomUUID();

                const existing = await env.DB.prepare(
                    `SELECT id, quantity 
                     FROM cart_items 
                     WHERE session_id = ? AND product_id = ?`
                ).bind(sessionId, product_id).first();

                if (existing) {
                    const newQty = existing.quantity + quantity;

                    await env.DB.prepare(
                        `UPDATE cart_items 
                         SET quantity = ? 
                         WHERE id = ?`
                    ).bind(newQty, existing.id).run();
                } else {
                    await env.DB.prepare(
                        `INSERT INTO cart_items (session_id, product_id, quantity)
                         VALUES (?, ?, ?)`
                    ).bind(sessionId, product_id, quantity).run();
                }

                return new Response(JSON.stringify({ success: true }), {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                        "Set-Cookie": `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
                    }
                });
            } catch (err) {
                return new Response("Error adding to cart: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // UPDATE CART ITEM
        if (path.startsWith("/api/cart/items/") && method === "PATCH") {
            try {
                const cartItemId = path.split("/").pop();
                const body = await request.json();
                const { quantity } = body;

                if (!quantity || quantity < 1) {
                    return new Response("Invalid quantity", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                const sessionId = request.headers.get("Cookie")?.match(/session_id=([^;]+)/)?.[1];
                if (!sessionId) {
                    return new Response("No active cart session", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                const existing = await env.DB.prepare(
                    `SELECT id FROM cart_items 
                     WHERE id = ? AND session_id = ?`
                ).bind(cartItemId, sessionId).first();

                if (!existing) {
                    return new Response("Cart item not found", {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                await env.DB.prepare(
                    `UPDATE cart_items 
                     SET quantity = ? 
                     WHERE id = ?`
                ).bind(quantity, cartItemId).run();

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Error updating cart item: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // DELETE CART ITEM
        if (path.startsWith("/api/cart/items/") && method === "DELETE") {
            try {
                const cartItemId = path.split("/").pop();

                const sessionId = request.headers.get("Cookie")?.match(/session_id=([^;]+)/)?.[1];
                if (!sessionId) {
                    return new Response("No active cart session", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                const existing = await env.DB.prepare(
                    `SELECT id FROM cart_items 
                     WHERE id = ? AND session_id = ?`
                ).bind(cartItemId, sessionId).first();

                if (!existing) {
                    return new Response("Cart item not found", {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                await env.DB.prepare(
                    `DELETE FROM cart_items WHERE id = ?`
                ).bind(cartItemId).run();

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Error deleting cart item: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // ============================================================
        // ORDERS (UNCHANGED)
        // ============================================================

        // CREATE ORDER
        if (path === "/api/orders" && method === "POST") {
            try {
                const body = await request.json();
                const { items, total } = body;

                if (!items || !Array.isArray(items) || items.length === 0) {
                    return new Response("Order must contain items", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                if (!total || total <= 0) {
                    return new Response("Invalid order total", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                const sessionId = request.headers.get("Cookie")?.match(/session_id=([^;]+)/)?.[1];
                if (!sessionId) {
                    return new Response("No active cart session", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                const orderId = crypto.randomUUID();

                await env.DB.prepare(
                    `INSERT INTO orders (id, session_id, total, created_at)
                     VALUES (?, ?, ?, datetime('now'))`
                ).bind(orderId, sessionId, total).run();

                for (const item of items) {
                    await env.DB.prepare(
                        `INSERT INTO order_items (order_id, product_id, quantity, price)
                         VALUES (?, ?, ?, ?)`
                    ).bind(orderId, item.product_id, item.quantity, item.price).run();
                }

                await env.DB.prepare(
                    `DELETE FROM cart_items WHERE session_id = ?`
                ).bind(sessionId).run();

                return new Response(JSON.stringify({ success: true, order_id: orderId }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Error creating order: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // GET ORDER
        if (path.startsWith("/api/orders/") && method === "GET") {
            try {
                const orderId = path.split("/").pop();

                const order = await env.DB.prepare(
                    `SELECT * FROM orders WHERE id = ?`
                ).bind(orderId).first();

                if (!order) {
                    return new Response("Order not found", {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                const { results: items } = await env.DB.prepare(
                    `SELECT 
                        oi.product_id,
                        oi.quantity,
                        oi.price,
                        p.name,
                        (
                            SELECT image_url 
                            FROM product_images 
                            WHERE product_id = p.id 
                            ORDER BY sort_order 
                            LIMIT 1
                        ) AS main_image
                    FROM order_items oi
                    JOIN products p ON p.id = oi.product_id
                    WHERE oi.order_id = ?`
                ).bind(orderId).all();

                return new Response(JSON.stringify({ ...order, items }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Error fetching order: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // ============================================================
        // FALLBACK
        // ============================================================
        return new Response("Not Found", {
            status: 404,
            headers: corsHeaders
        });
    }
};
