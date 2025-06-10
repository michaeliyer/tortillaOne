const express = require("express");
const router = express.Router();
const db = require("../db/connection");

// Helper function to calculate standard delivery fee
function calculateStandardDeliveryFee(itemsSubtotal) {
  if (itemsSubtotal < 50) {
    return 10.0; // $10 flat rate for orders under $50
  } else if (itemsSubtotal <= 75) {
    return itemsSubtotal * 0.15; // 15% for orders $51-75
  } else if (itemsSubtotal <= 100) {
    return itemsSubtotal * 0.12; // 12% for orders $76-100
  } else if (itemsSubtotal <= 150) {
    return itemsSubtotal * 0.1; // 10% for orders $101-150
  } else if (itemsSubtotal <= 250) {
    return itemsSubtotal * 0.08; // 8% for orders $151-250
  } else {
    return itemsSubtotal * 0.06; // 6% for orders over $251
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

      // Attach items to their matching order and detect special rates
      orders.forEach((order) => {
        order.items = items.filter((i) => i.order_id === order.order_id);

        // Calculate items subtotal
        const itemsSubtotal = order.items.reduce(
          (sum, item) => sum + item.subtotal,
          0
        );

        // Calculate what the standard delivery fee should be
        const standardDeliveryFee = calculateStandardDeliveryFee(itemsSubtotal);

        // Calculate what the standard total should be
        const standardTotal = itemsSubtotal + standardDeliveryFee;

        // Check if special rates have been applied
        const deliveryFeeAdjusted =
          Math.abs(order.delivery_fee - standardDeliveryFee) > 0.01;
        const discountApplied = order.total_price < standardTotal - 0.01;

        // Set flags for special rates
        order.hasSpecialRate = deliveryFeeAdjusted || discountApplied;
        order.specialRateType = [];

        if (deliveryFeeAdjusted) {
          if (order.delivery_fee < standardDeliveryFee) {
            order.specialRateType.push("Reduced Delivery Fee");
          } else {
            order.specialRateType.push("Adjusted Delivery Fee");
          }
        }

        if (discountApplied) {
          const discountAmount = standardTotal - order.total_price;
          order.specialRateType.push(
            `$${discountAmount.toFixed(2)} Discount Applied`
          );
        }

        // Store calculated values for display
        order.itemsSubtotal = itemsSubtotal;
        order.standardDeliveryFee = standardDeliveryFee;
        order.standardTotal = standardTotal;
      });

      // Calculate customer totals for summary
      const customerTotals = {};
      orders.forEach((order) => {
        const customerKey = `${order.customer_id}-${order.email}`;
        if (!customerTotals[customerKey]) {
          customerTotals[customerKey] = {
            customer_id: order.customer_id,
            email: order.email,
            name: order.name,
            totalBalance: 0,
            orderCount: 0,
          };
        }
        customerTotals[customerKey].totalBalance += order.balance;
        customerTotals[customerKey].orderCount += 1;
      });

      // Convert to array and filter customers with outstanding balances
      const customerSummary = Object.values(customerTotals)
        .filter((customer) => customer.totalBalance > 0)
        .sort((a, b) => b.totalBalance - a.totalBalance);

      res.render("admin", {
        orders,
        customerSummary,
      });
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

// POST route to mark order as delivered
router.post("/mark-delivered/:id", (req, res) => {
  const orderId = req.params.id;

  db.run(
    "UPDATE orders SET status = 'closed' WHERE order_id = ?",
    [orderId],
    (err) => {
      if (err)
        return res.status(500).send("Failed to mark order as delivered.");
      res.redirect("/admin");
    }
  );
});

// POST route to reopen a closed order
router.post("/reopen/:id", (req, res) => {
  const orderId = req.params.id;

  db.run(
    "UPDATE orders SET status = 'open' WHERE order_id = ?",
    [orderId],
    (err) => {
      if (err) return res.status(500).send("Failed to reopen order.");
      res.redirect("/admin");
    }
  );
});

module.exports = router;
