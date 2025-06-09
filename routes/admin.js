const express = require("express");
const router = express.Router();
const db = require("../db/connection");

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

// Show all recent orders with customer info
router.get("/", (req, res) => {
  const orderSql = `
    SELECT o.order_id, o.order_date, o.total_price, o.delivery_fee, o.payments, o.balance, o.status,
           c.customer_id, c.name, c.address, c.phone, c.email
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    ORDER BY o.order_date DESC
  `;

  db.all(orderSql, [], (err, orders) => {
    if (err) return res.status(500).send("Error retrieving orders.");

    const orderIds = orders.map((o) => o.order_id);
    if (orderIds.length === 0) return res.render("admin", { orders: [] });

    const placeholders = orderIds.map(() => "?").join(",");
    const itemSql = `
      SELECT oi.order_id, p.color, p.variant, oi.quantity, oi.subtotal
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      WHERE oi.order_id IN (${placeholders})
    `;

    db.all(itemSql, orderIds, (err, items) => {
      if (err) return res.status(500).send("Error retrieving items.");

      // Attach items to their matching order
      orders.forEach((order) => {
        order.items = items.filter((i) => i.order_id === order.order_id);
      });

      // Calculate customer total outstanding balances
      const customerBalancesSql = `
        SELECT customer_id, SUM(balance) as total_outstanding_balance
        FROM orders 
        WHERE balance > 0
        GROUP BY customer_id
      `;

      db.all(customerBalancesSql, [], (err, customerBalances) => {
        if (err)
          return res.status(500).send("Error calculating customer balances.");

        // Create a map of customer_id to total outstanding balance
        const customerBalanceMap = {};
        customerBalances.forEach((cb) => {
          customerBalanceMap[cb.customer_id] = cb.total_outstanding_balance;
        });

        // Calculate previous balance for each order (balance from orders before this one)
        const promises = orders.map((order) => {
          return new Promise((resolve, reject) => {
            const previousBalanceSql = `
              SELECT SUM(balance) as previous_balance
              FROM orders 
              WHERE customer_id = ? AND order_date < ? AND balance > 0
            `;

            db.get(
              previousBalanceSql,
              [order.customer_id, order.order_date],
              (err, result) => {
                if (err) {
                  reject(err);
                } else {
                  order.previous_balance = result.previous_balance || 0;
                  order.customer_total_outstanding =
                    customerBalanceMap[order.customer_id] || 0;
                  resolve(order);
                }
              }
            );
          });
        });

        Promise.all(promises)
          .then(() => {
            res.render("admin", { orders, getDeliveryRateInfo });
          })
          .catch((err) => {
            console.error("Error calculating previous balances:", err);
            res.status(500).send("Error calculating previous balances");
          });
      });
    });
  });
});

// POST route to mark an order as delivered
router.post("/close/:id", (req, res) => {
  const orderId = req.params.id;
  db.run(
    "UPDATE orders SET status = ? WHERE order_id = ?",
    ["closed", orderId],
    (err) => {
      if (err) return res.status(500).send("Failed to update status.");
      res.redirect("/admin");
    }
  );
});

// POST route to reopen a closed order
router.post("/reopen/:id", (req, res) => {
  const orderId = req.params.id;
  db.run(
    "UPDATE orders SET status = ? WHERE order_id = ?",
    ["open", orderId],
    (err) => {
      if (err) return res.status(500).send("Failed to reopen order.");
      res.redirect("/admin");
    }
  );
});

// POST route to record a payment
router.post("/pay/:id", (req, res) => {
  const orderId = req.params.id;
  const paymentAmount = parseFloat(req.body.payment);

  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).send("Invalid payment amount.");
  }

  // Get current payment amount to add to it
  db.get(
    "SELECT payments FROM orders WHERE order_id = ?",
    [orderId],
    (err, order) => {
      if (err) return res.status(500).send("Error retrieving order.");
      if (!order) return res.status(404).send("Order not found.");

      const newPaymentTotal = order.payments + paymentAmount;

      // Allow overpayments - creates customer credit
      db.run(
        "UPDATE orders SET payments = ? WHERE order_id = ?",
        [newPaymentTotal, orderId],
        (err) => {
          if (err) return res.status(500).send("Failed to record payment.");
          res.redirect("/admin");
        }
      );
    }
  );
});

module.exports = router;
