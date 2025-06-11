const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const { getDeliveryRateInfo } = require("../utils/delivery");

router.get("/", (req, res) => {
  const searchEmail = req.query.search || "";
  let whereClause = "";
  let params = [];

  if (searchEmail) {
    whereClause = "WHERE c.email LIKE ?";
    params.push(`%${searchEmail}%`);
  }

  const sql = `
    SELECT 
      o.order_id, o.customer_id, o.order_date, o.delivery_fee, o.total_price, o.payments, o.balance, o.status,
      c.name, c.email
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause}
    ORDER BY o.order_date DESC, o.order_id DESC
  `;

  db.all(sql, params, (err, orders) => {
    if (err) {
      return res.status(500).send("Database error retrieving orders.");
    }

    const itemsSql = `SELECT * FROM order_items`;
    db.all(itemsSql, [], (err, items) => {
      if (err) {
        return res.status(500).send("Database error retrieving order items.");
      }

      const ordersByEmail = {};
      orders.forEach((order) => {
        if (!ordersByEmail[order.email]) {
          ordersByEmail[order.email] = [];
        }
        ordersByEmail[order.email].push(order);
      });

      orders.forEach((order) => {
        order.items = items.filter((i) => i.order_id === order.order_id);
        order.itemsSubtotal = order.items.reduce(
          (sum, item) => sum + item.subtotal,
          0
        );

        const customerOrders = ordersByEmail[order.email];
        const orderIndex = customerOrders.findIndex(
          (o) => o.order_id === order.order_id
        );
        const previousOrders = customerOrders.slice(0, orderIndex);

        order.previousBalance = previousOrders.reduce((sum, prevOrder) => {
          return sum + (prevOrder.total_price - prevOrder.payments);
        }, 0);
      });

      res.render("admin", {
        orders: orders,
        getDeliveryRateInfo: getDeliveryRateInfo,
        success: req.query.success,
        searchEmail: searchEmail,
      });
    });
  });
});

router.post("/record-payment", (req, res) => {
  const { order_id, payment_amount } = req.body;
  if (!order_id || !payment_amount) {
    return res.status(400).send("Missing order ID or payment amount.");
  }

  db.run(
    "UPDATE orders SET payments = payments + ? WHERE order_id = ?",
    [payment_amount, order_id],
    (err) => {
      if (err) {
        return res.status(500).send("Database error recording payment.");
      }
      res.redirect("/admin?success=Payment recorded");
    }
  );
});

router.post("/update-delivery", (req, res) => {
  const { order_id, new_delivery_fee } = req.body;
  db.run(
    "UPDATE orders SET delivery_fee = ? WHERE order_id = ?",
    [new_delivery_fee, order_id],
    (err) => {
      if (err) {
        return res.status(500).send("Error updating delivery fee.");
      }
      res.redirect("/admin?success=Delivery fee updated");
    }
  );
});

module.exports = router;
