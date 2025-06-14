const express = require("express");
const router = express.Router();
const db = require("../db/connection");

// Function to get delivery rate info for display
function getDeliveryRateInfo(itemsSubtotal) {
  if (itemsSubtotal < 50) {
    return { rate: "$10.00 flat rate", percentage: null };
  } else if (itemsSubtotal >= 50 && itemsSubtotal < 100) {
    return { rate: "18% price tier", percentage: 18 };
  } else if (itemsSubtotal >= 100 && itemsSubtotal < 150) {
    return { rate: "16% price tier", percentage: 16 };
  } else if (itemsSubtotal >= 150 && itemsSubtotal < 200) {
    return { rate: "14% price tier", percentage: 14 };
  } else {
    return { rate: "12% price tier", percentage: 12 };
  }
}

// Function to calculate standard delivery fee
function calculateStandardDeliveryFee(itemsSubtotal) {
  if (itemsSubtotal < 50) {
    return 10; // Flat rate for orders under $50
  } else {
    const info = getDeliveryRateInfo(itemsSubtotal);
    return (itemsSubtotal * info.percentage) / 100;
  }
}

// GET /admin route
router.get("/", (req, res) => {
  const orderSql = `
    SELECT 
      o.order_id, o.customer_id, o.total_price, o.delivery_fee, o.payments, o.status, o.order_date, o.balance,
      c.name, c.phone, c.email, c.address
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
    if (orderIds.length === 0)
      return res.render("admin", {
        orders: [],
        customerSummary: [],
        selectedDate: "",
        getDeliveryRateInfo,
      });

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

      // Group orders by customer email to calculate previous balances
      const ordersByEmail = {};
      orders.forEach((order) => {
        if (!ordersByEmail[order.email]) {
          ordersByEmail[order.email] = [];
        }
        ordersByEmail[order.email].push(order);
      });

      // Sort orders by date for each customer to calculate previous balances
      Object.keys(ordersByEmail).forEach((email) => {
        ordersByEmail[email].sort(
          (a, b) => new Date(a.order_date) - new Date(b.order_date)
        );
      });

      // Identify the most recent order for each customer
      const mostRecentOrdersByCustomer = {};
      orders.forEach((order) => {
        const customerKey = `${order.customer_id}-${order.email}`;
        if (
          !mostRecentOrdersByCustomer[customerKey] ||
          new Date(order.order_date) >
            new Date(mostRecentOrdersByCustomer[customerKey].order_date)
        ) {
          mostRecentOrdersByCustomer[customerKey] = order;
        }
      });

      // Attach items to their matching order and calculate previous balances
      orders.forEach((order) => {
        order.items = items.filter((i) => i.order_id === order.order_id);

        // Calculate items subtotal
        const itemsSubtotal = order.items.reduce(
          (sum, item) => sum + item.subtotal,
          0
        );

        // Calculate previous balance for this order (sum of all previous orders' balances for this customer)
        const customerOrders = ordersByEmail[order.email];
        const orderIndex = customerOrders.findIndex(
          (o) => o.order_id === order.order_id
        );

        // Get all previous orders for this customer
        const previousOrders = customerOrders.slice(0, orderIndex);

        // Sum up the balances of all previous orders
        order.previousBalance = previousOrders.reduce((sum, prevOrder) => {
          return sum + prevOrder.balance;
        }, 0);

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
        order.deliveryRateLabel = getDeliveryRateInfo(itemsSubtotal).rate;

        // Determine if this order should show admin controls
        const customerKey = `${order.customer_id}-${order.email}`;
        order.showAdminControls =
          mostRecentOrdersByCustomer[customerKey].order_id === order.order_id;
      });

      // Calculate customer totals for summary (sum all balances per customer)
      const customerTotals = {};
      orders.forEach((order) => {
        const customerKey = `${order.customer_id}-${order.email}`;
        if (!customerTotals[customerKey]) {
          customerTotals[customerKey] = {
            customer_id: order.customer_id,
            email: order.email,
            name: order.name,
            phone: order.phone,
            totalBalance: 0,
            orderCount: 0,
          };
        }
        // Sum all individual order balances for this customer
        customerTotals[customerKey].totalBalance += order.balance;
        customerTotals[customerKey].orderCount += 1;
      });

      // Convert to array and filter customers with outstanding balances (positive only)
      const customerSummary = Object.values(customerTotals)
        .filter((customer) => customer.totalBalance > 0)
        .sort((a, b) => b.totalBalance - a.totalBalance);

      res.render("admin", {
        orders,
        customerSummary: customerSummary || [],
        selectedDate: "",
        getDeliveryRateInfo,
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

  // Get current order details and items to recalculate standardTotal
  db.get(
    `SELECT o.order_id, o.delivery_fee FROM orders o WHERE o.order_id = ?`,
    [orderId],
    (err, order) => {
      if (err) return res.status(500).send("Error retrieving order.");
      if (!order) return res.status(404).send("Order not found.");

      db.all(
        `SELECT subtotal FROM order_items WHERE order_id = ?`,
        [orderId],
        (err, items) => {
          if (err) return res.status(500).send("Error retrieving items.");

          const itemsSubtotal = items.reduce(
            (sum, item) => sum + item.subtotal,
            0
          );
          // Recalculate standard delivery fee and total
          const standardDeliveryFee =
            calculateStandardDeliveryFee(itemsSubtotal);
          const standardTotal = itemsSubtotal + standardDeliveryFee;

          // Apply discount from standardTotal
          const newTotalPrice = Math.max(0, standardTotal - discountAmount);

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
    }
  );
});

// POST route to cancel/remove discount
router.post("/cancel-discount/:id", (req, res) => {
  const orderId = req.params.id;
  // Get current order details and items to recalculate standardTotal
  db.get(
    `SELECT o.order_id, o.delivery_fee FROM orders o WHERE o.order_id = ?`,
    [orderId],
    (err, order) => {
      if (err) return res.status(500).send("Error retrieving order.");
      if (!order) return res.status(404).send("Order not found.");

      db.all(
        `SELECT subtotal FROM order_items WHERE order_id = ?`,
        [orderId],
        (err, items) => {
          if (err) return res.status(500).send("Error retrieving items.");

          const itemsSubtotal = items.reduce(
            (sum, item) => sum + item.subtotal,
            0
          );
          // Recalculate standard delivery fee and total
          const standardDeliveryFee =
            calculateStandardDeliveryFee(itemsSubtotal);
          const standardTotal = itemsSubtotal + standardDeliveryFee;

          // Restore to pre-discount value
          db.run(
            "UPDATE orders SET total_price = ? WHERE order_id = ?",
            [standardTotal, orderId],
            (err) => {
              if (err)
                return res.status(500).send("Failed to cancel discount.");
              res.redirect("/admin");
            }
          );
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
