// server.js
const db = require("./db/connection"); // ✅ NEW import
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const qs = require("querystring");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - use querystring for better array parsing
app.use(
  bodyParser.urlencoded({
    extended: true, // Back to qs library
    parameterLimit: 1000,
    limit: "50mb",
  })
);
app.use(bodyParser.json());

// Custom middleware to fix quantities parsing
app.use((req, res, next) => {
  if (req.body && req.body.quantities && Array.isArray(req.body.quantities)) {
    // Convert quantities array back to object format
    const newQuantities = {};

    // Parse the raw body to extract indices
    const rawBody = require("querystring").parse(
      require("url").parse(req.url).query || ""
    );

    // This is a workaround - we'll handle this in the route instead
    console.log("Quantities array detected, will handle in route");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
const productRoutes = require("./routes/products");
const customerRoutes = require("./routes/customers");
const adminRoutes = require("./routes/admin");

app.use(express.static("public"));

app.use("/products", productRoutes);
app.use("/orders", customerRoutes); // customers submit orders here
app.use("/admin", adminRoutes); // admin dashboard

// Customer order lookup routes
app.use("/", customerRoutes); // This will handle /my-orders routes

// API endpoint to check customer balance
app.post("/api/check-balance", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  // Query to get total balance across all orders for this email
  const query = `
    SELECT 
      SUM(o.balance) as totalBalance,
      COUNT(o.order_id) as orderCount
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    WHERE LOWER(c.email) = LOWER(?)
  `;

  db.get(query, [email], (err, result) => {
    if (err) {
      console.error("Balance check error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const totalBalance = result.totalBalance || 0;
    const orderCount = result.orderCount || 0;

    res.json({
      totalBalance: totalBalance,
      orderCount: orderCount,
      hasOrders: orderCount > 0,
    });
  });
});

// Root route → render the customer order form
app.get("/", (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    if (err) {
      return res.status(500).send("Error fetching products");
    }
    res.render("index", { products: rows });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Export db so routes can access it
module.exports = db;
