// index.ts — Cloudflare Worker Server Entrypoint

export default {
    async fetch(request: Request, env: any) {
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

        // helper: hash passwords using SHA-256
        async function hashPassword(pwd: string) {
            const enc = new TextEncoder();
            const data = enc.encode(pwd);
            const digest = await crypto.subtle.digest('SHA-256', data);
            const arr = Array.from(new Uint8Array(digest));
            return arr.map(b => b.toString(16).padStart(2, '0')).join('');
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

        // Duplicate login handler removed; using consolidated login later


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

                // Otherwise treat as slug/sku — try to resolve by slug or sku (case-sensitive)
                const lookupValue = value;

                // Defensive: invalid identifier values (often caused by front-end bugs)
                if (!lookupValue || lookupValue === 'NaN' || lookupValue.trim() === '') {
                    return new Response("Invalid product identifier", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                // Try to find by slug OR sku in a single query to tolerate different client identifiers
                const product = await env.DB.prepare(
                    `SELECT * FROM products WHERE (slug = ? OR sku = ?) AND is_active = 1 LIMIT 1`
                ).bind(lookupValue, lookupValue).first();

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
    // REGISTER: store email and password hash (SHA-256)
    if (path === "/api/register" && method === "POST") {
        try {
            const { email, password } = await request.json();
            if (!email || !password) {
                return new Response("Missing email or password", { status: 400, headers: corsHeaders });
            }
            // Check if user already exists
            const existing = await env.DB.prepare(
                `SELECT id FROM users WHERE email = ?`
            ).bind(email).first();
            if (existing) {
                return new Response(JSON.stringify({ error: "User already exists" }), {
                    status: 409,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
            const hash = await hashPassword(password);
            await env.DB.prepare(
                `INSERT INTO users (email, password_hash) VALUES (?, ?)`
            ).bind(email, hash).run();
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        } catch (err) {
            return new Response("Registration error: " + err, { status: 500, headers: corsHeaders });
        }
    }
        // ============================================================
        // CART ENDPOINTS (UNCHANGED)
        // ============================================================

        // GET CART
        if (path === "/api/cart" && method === "GET") {
            try {
                let sessionId = request.headers.get("X-Session-Id");
                if (!sessionId) {
                    return new Response("Missing X-Session-Id header", {
                        status: 400,
                        headers: corsHeaders
                    });
                }
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
                        "Content-Type": "application/json"
                    }
                });
            } catch (err) {
                return new Response("Error fetching cart: " + err, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // LOGIN: verify password using stored SHA-256 hash
        if (path === "/api/login" && method === "POST") {
            try {
                const { email, password } = await request.json();
                if (!email || !password) {
                    return new Response("Missing email or password", { status: 400, headers: corsHeaders });
                }
                const user = await env.DB.prepare(
                    `SELECT * FROM users WHERE email = ?`
                ).bind(email).first();
                if (!user) {
                    return new Response("Invalid credentials", { status: 401, headers: corsHeaders });
                }
                const hash = await hashPassword(password);
                if (user.password_hash !== hash) {
                    return new Response("Invalid credentials", { status: 401, headers: corsHeaders });
                }
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response("Login error: " + err, { status: 500, headers: corsHeaders });
            }
        }

        // ADD TO CART
        if (path === "/api/cart/items" && method === "POST") {
            try {
                const body = await request.json();
                const { product_id, quantity, cart_id } = body;

                if (!product_id || !quantity) {
                    return new Response("Missing product_id or quantity", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                let sessionId = request.headers.get("X-Session-Id");
                if (!sessionId) {
                    return new Response("Missing X-Session-Id header", {
                        status: 400,
                        headers: corsHeaders
                    });
                }

                // Use cart_id if provided, otherwise null
                const cartIdValue = cart_id ?? null;

                // Check for existing cart item by cart_id (if provided), else by session_id
                let existing;
                if (cartIdValue !== null) {
                    existing = await env.DB.prepare(
                        `SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?`
                    ).bind(cartIdValue, product_id).first();
                } else {
                    existing = await env.DB.prepare(
                        `SELECT id, quantity FROM cart_items WHERE session_id = ? AND product_id = ?`
                    ).bind(sessionId, product_id).first();
                }

                if (existing) {
                    const newQty = existing.quantity + quantity;
                    await env.DB.prepare(
                        `UPDATE cart_items SET quantity = ? WHERE id = ?`
                    ).bind(newQty, existing.id).run();
                } else {
                    if (cartIdValue !== null) {
                        await env.DB.prepare(
                            `INSERT INTO cart_items (cart_id, session_id, product_id, quantity) VALUES (?, ?, ?, ?)`
                        ).bind(cartIdValue, sessionId, product_id, quantity).run();
                    } else {
                        await env.DB.prepare(
                            `INSERT INTO cart_items (session_id, product_id, quantity) VALUES (?, ?, ?)`
                        ).bind(sessionId, product_id, quantity).run();
                    }
                }

                return new Response(JSON.stringify({ success: true }), {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json"
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

                const sessionId = request.headers.get("X-Session-Id");
                if (!sessionId) {
                    return new Response("Missing X-Session-Id header", {
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

                const sessionId = request.headers.get("X-Session-Id");
                if (!sessionId) {
                    return new Response("Missing X-Session-Id header", {
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
