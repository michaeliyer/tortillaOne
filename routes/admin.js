const express = require("express");
const router = express.Router();
const db = require("../db/connection");

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
    if (err) {
      console.error("Error retrieving orders:", err);
      return res.status(500).send("Error retrieving orders.");
    }

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
      if (err) {
        console.error("Error retrieving items:", err);
        return res.status(500).send("Error retrieving items.");
      }

      // Attach items to their matching order
      orders.forEach((order) => {
        order.items = items.filter((i) => i.order_id === order.order_id);
      });

      res.render("admin", { orders });
    });
  });
});

// POST route to record payment
router.post("/pay/:id", (req, res) => {
  const orderId = req.params.id;
  const paymentAmount = parseFloat(req.body.payment);

  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).send("Invalid payment amount.");
  }

  // Get current order details
  db.get(
    "SELECT payments FROM orders WHERE order_id = ?",
    [orderId],
    (err, order) => {
      if (err) return res.status(500).send("Error retrieving order.");
      if (!order) return res.status(404).send("Order not found.");

      const newPayments = order.payments + paymentAmount;

      db.run(
        "UPDATE orders SET payments = ? WHERE order_id = ?",
        [newPayments, orderId],
        (err) => {
          if (err) return res.status(500).send("Failed to record payment.");
          res.redirect("/admin");
        }
      );
    }
  );
});

// POST route to adjust delivery fee
router.post("/adjust-delivery/:id", (req, res) => {
  const orderId = req.params.id;
  const newDeliveryFee = parseFloat(req.body.delivery_fee);

  if (isNaN(newDeliveryFee) || newDeliveryFee < 0) {
    return res.status(400).send("Invalid delivery fee amount.");
  }

  // Get current order details
  db.get(
    "SELECT delivery_fee, total_price FROM orders WHERE order_id = ?",
    [orderId],
    (err, order) => {
      if (err) return res.status(500).send("Error retrieving order.");
      if (!order) return res.status(404).send("Order not found.");

      // Calculate new total: (old total - old delivery fee) + new delivery fee
      const itemsSubtotal = order.total_price - order.delivery_fee;
      const newTotalPrice = itemsSubtotal + newDeliveryFee;

      db.run(
        "UPDATE orders SET delivery_fee = ?, total_price = ? WHERE order_id = ?",
        [newDeliveryFee, newTotalPrice, orderId],
        (err) => {
          if (err)
            return res.status(500).send("Failed to adjust delivery fee.");
          res.redirect("/admin");
        }
      );
    }
  );
});

// POST route to add discount
router.post("/add-discount/:id", (req, res) => {
  const orderId = req.params.id;
  const discountAmount = parseFloat(req.body.discount);

  if (isNaN(discountAmount) || discountAmount <= 0) {
    return res.status(400).send("Invalid discount amount.");
  }

  // Get current order details
  db.get(
    "SELECT total_price FROM orders WHERE order_id = ?",
    [orderId],
    (err, order) => {
      if (err) return res.status(500).send("Error retrieving order.");
      if (!order) return res.status(404).send("Order not found.");

      // Apply discount by reducing total price
      const newTotalPrice = Math.max(0, order.total_price - discountAmount);

      db.run(
        "UPDATE orders SET total_price = ? WHERE order_id = ?",
        [newTotalPrice, orderId],
        (err) => {
          if (err) return res.status(500).send("Failed to apply discount.");
          res.redirect("/admin");
        }
      );
    }
  );
});

module.exports = router;
