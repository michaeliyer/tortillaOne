const express = require("express");
const router = express.Router();
const db = require("../db/connection"); // ✅ Correctly points to the exported SQLite DB

// Helper function to determine delivery rate based on order value
function getDeliveryRateInfo(itemsSubtotal) {
  if (itemsSubtotal < 50) {
    return {
      rate: "$10.00 flat rate",
      rateText: "($10 flat rate for orders under $50)",
    };
  } else if (itemsSubtotal <= 75) {
    return { rate: "15%", rateText: "(15% for orders $51-75)" };
  } else if (itemsSubtotal <= 100) {
    return { rate: "12%", rateText: "(12% for orders $76-100)" };
  } else if (itemsSubtotal <= 150) {
    return { rate: "10%", rateText: "(10% for orders $101-150)" };
  } else if (itemsSubtotal <= 250) {
    return { rate: "8%", rateText: "(8% for orders $151-250)" };
  } else {
    return { rate: "6%", rateText: "(6% for orders over $251)" };
  }
}

// POST /orders — handle order form submission
router.post("/", (req, res) => {
  const { name, address, phone, email } = req.body;

  // Step 1: Calculate order items
  const orderItems = [];
  let totalCost = 0;

  // Process qty_* fields
  for (const fieldName in req.body) {
    if (fieldName.startsWith("qty_")) {
      const productId = parseInt(fieldName.replace("qty_", ""), 10);
      const quantity = parseInt(req.body[fieldName], 10);

      if (quantity > 0 && productId > 0) {
        orderItems.push({ productId, quantity });
      }
    }
  }

  if (orderItems.length === 0) {
    return res.send("Please select at least one item.");
  }

  // Step 2: Fetch prices from DB to calculate subtotal
  const placeholders = orderItems.map(() => "?").join(",");
  const productIds = orderItems.map((item) => item.productId);

  db.all(
    `SELECT product_id, price FROM products WHERE product_id IN (${placeholders})`,
    productIds,
    (err, rows) => {
      if (err) return res.status(500).send("Error fetching product prices.");

      const priceMap = {};
      rows.forEach((row) => {
        priceMap[row.product_id] = row.price;
      });

      // Step 3: Compute item subtotals
      orderItems.forEach((item) => {
        const price = priceMap[item.productId] || 0;
        item.subtotal = price * item.quantity;
        totalCost += item.subtotal;
      });

      // Step 4: Add delivery fee - NEW TIERED SYSTEM
      let deliveryFee = 0;

      if (totalCost < 50) {
        deliveryFee = 10.0; // $10 flat rate for orders under $50
      } else if (totalCost <= 75) {
        deliveryFee = totalCost * 0.15; // 15% for $51-75
      } else if (totalCost <= 100) {
        deliveryFee = totalCost * 0.12; // 12% for $76-100
      } else if (totalCost <= 150) {
        deliveryFee = totalCost * 0.1; // 10% for $101-150
      } else if (totalCost <= 250) {
        deliveryFee = totalCost * 0.08; // 8% for $151-250
      } else {
        deliveryFee = totalCost * 0.06; // 6% for over $251
      }

      const grandTotal = totalCost + deliveryFee;

      // Step 5: Check for existing customer and their credit balance
      // First, try to find existing customer by email (case-insensitive)
      db.get(
        "SELECT customer_id FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1",
        [email],
        (err, existingCustomer) => {
          if (err) return res.status(500).send("Error checking customer.");

          console.log(
            `Customer lookup for email '${email}':`,
            existingCustomer
          );
          let customerId = null;
          let customerCredit = 0;

          const processOrder = (custId, previousNetBalance = 0) => {
            // 1. Calculate current order total (items + delivery)
            const currentOrderTotal = grandTotal;

            // 2. Store the order with no initial payments (balance will be calculated automatically by SQL)
            // The balance column will be: total_price - payments (which starts at 0)
            // Previous balance handling will be done in the admin view calculation
            db.run(
              `INSERT INTO orders (customer_id, delivery_fee, total_price, payments) VALUES (?, ?, ?, 0)`,
              [custId, deliveryFee, currentOrderTotal],
              function (err) {
                if (err) {
                  console.error("Database error creating order:", err);
                  return res.status(500).send("Error creating order.");
                }
                const orderId = this.lastID;

                // Step 4: Insert all order_items
                const stmt = db.prepare(
                  `INSERT INTO order_items (order_id, product_id, quantity, subtotal) VALUES (?, ?, ?, ?)`
                );

                orderItems.forEach((item) => {
                  stmt.run(
                    orderId,
                    item.productId,
                    item.quantity,
                    item.subtotal
                  );
                });

                stmt.finalize(() => {
                  const rateInfo = getDeliveryRateInfo(totalCost);

                  // Calculate the total balance including previous balance
                  const totalBalance = currentOrderTotal + previousNetBalance;

                  let message = `<h2>Thank you for your order!</h2>`;
                  message += `<p>Items Subtotal: $${totalCost.toFixed(2)}</p>`;
                  message += `<p>Delivery Fee: $${deliveryFee.toFixed(2)} <em>${
                    rateInfo.rateText
                  }</em></p>`;
                  message += `<p><strong>Order Subtotal: $${currentOrderTotal.toFixed(
                    2
                  )}</strong></p>`;

                  if (previousNetBalance !== 0) {
                    if (previousNetBalance < 0) {
                      message += `<p>Previous Balance: -$${Math.abs(
                        previousNetBalance
                      ).toFixed(2)} <em>(Credit)</em></p>`;
                    } else {
                      message += `<p>Previous Balance: $${previousNetBalance.toFixed(
                        2
                      )}</p>`;
                    }
                  }

                  message += `<p><strong>Current Balance: $${totalBalance.toFixed(
                    2
                  )}</strong></p>`;
                  message += `<p><strong>Status:</strong> open</p>`;
                  res.send(message);
                });
              }
            );
          };

          if (existingCustomer) {
            // Customer exists - calculate their total credit balance
            customerId = existingCustomer.customer_id;

            // Get net balance from ALL orders for this email address
            db.get(
              `SELECT SUM(balance) as net_balance 
               FROM orders o 
               JOIN customers c ON o.customer_id = c.customer_id 
               WHERE LOWER(c.email) = LOWER(?)`,
              [email],
              (err, result) => {
                if (err)
                  return res
                    .status(500)
                    .send("Error calculating customer balance.");

                console.log(`Balance query result for email ${email}:`, result);
                const netBalance = result.net_balance || 0;
                console.log(
                  `Existing customer ${email} has $${Math.abs(
                    netBalance
                  ).toFixed(2)} in ${
                    netBalance < 0 ? "available credits" : "balance due"
                  } (net balance: $${netBalance.toFixed(2)})`
                );

                processOrder(customerId, netBalance);
              }
            );
          } else {
            // New customer - create customer record
            db.run(
              `INSERT INTO customers (name, address, phone, email) VALUES (?, ?, ?, ?)`,
              [name, address, phone, email],
              function (err) {
                if (err)
                  return res.status(500).send("Error saving customer info.");
                customerId = this.lastID;

                processOrder(customerId, 0);
              }
            );
          }
        }
      );
    }
  );
});

// Route to show order lookup form
router.get("/my-orders", (req, res) => {
  res.render("order-lookup");
});

// Route to display customer's orders
router.post("/my-orders", (req, res) => {
  const { email, name, phone } = req.body;

  // Check if at least one search field is provided
  if (!email && !name && !phone) {
    return res.send(
      '<h2>Please enter at least one search field</h2><p>Please enter your email, name, or phone number to find your orders.</p><a href="/my-orders">Try again</a>'
    );
  }

  // Build dynamic query based on provided fields
  let whereConditions = [];
  let searchParams = [];

  if (email && email.trim()) {
    whereConditions.push("LOWER(c.email) LIKE LOWER(?)");
    searchParams.push(`%${email.trim()}%`);
  }

  if (name && name.trim()) {
    whereConditions.push("LOWER(c.name) LIKE LOWER(?)");
    searchParams.push(`%${name.trim()}%`);
  }

  if (phone && phone.trim()) {
    // Clean phone number for flexible matching
    const cleanPhone = phone.replace(/[^\d]/g, ""); // Remove all non-digits
    whereConditions.push(
      "REPLACE(REPLACE(REPLACE(c.phone, '(', ''), ')', ''), '-', '') LIKE ?"
    );
    searchParams.push(`%${cleanPhone}%`);
  }

  // Get all orders for this customer with full details
  const query = `
    SELECT 
      o.order_id,
      o.order_date,
      o.delivery_fee,
      o.total_price,
      o.payments,
      o.balance,
      o.status,
      c.name,
      c.address,
      c.phone,
      c.email
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    WHERE ${whereConditions.join(" OR ")}
    ORDER BY o.order_date DESC
  `;

  db.all(query, searchParams, (err, orders) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }

    if (orders.length === 0) {
      const searchInfo = [];
      if (email) searchInfo.push(`email: ${email}`);
      if (name) searchInfo.push(`name: ${name}`);
      if (phone) searchInfo.push(`phone: ${phone}`);

      return res.send(`
        <h2>No orders found</h2>
        <p>No orders found for ${searchInfo.join(", ")}</p>
        <p>Please check your spelling or try a different search term.</p>
        <a href="/my-orders">Try again</a>
      `);
    }

    // Get order items for each order
    const orderPromises = orders.map((order) => {
      return new Promise((resolve, reject) => {
        const itemQuery = `
          SELECT 
            oi.quantity,
            oi.subtotal,
            p.color,
            p.variant,
            p.price
          FROM order_items oi
          JOIN products p ON oi.product_id = p.product_id
          WHERE oi.order_id = ?
          ORDER BY p.color, p.variant
        `;

        db.all(itemQuery, [order.order_id], (err, items) => {
          if (err) {
            reject(err);
          } else {
            order.items = items;
            resolve(order);
          }
        });
      });
    });

    Promise.all(orderPromises)
      .then((ordersWithItems) => {
        // Determine search description for display
        const searchInfo = [];
        if (email) searchInfo.push(`email: ${email}`);
        if (name) searchInfo.push(`name: ${name}`);
        if (phone) searchInfo.push(`phone: ${phone}`);

        // Calculate total balance across all orders
        const totalBalance = ordersWithItems.reduce(
          (sum, order) => sum + order.balance,
          0
        );

        res.render("customer-orders", {
          orders: ordersWithItems,
          customerEmail: searchInfo.join(", "),
          totalBalance: totalBalance,
          getDeliveryRateInfo: getDeliveryRateInfo,
        });
      })
      .catch((err) => {
        console.error("Error fetching order items:", err);
        res.status(500).send("Error loading order details");
      });
  });
});

module.exports = router;
