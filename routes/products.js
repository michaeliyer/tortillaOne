const express = require("express");
const router = express.Router();
const db = require("../db/connection"); // Fixed: Now correctly points to the exported SQLite DB

router.get("/", (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

module.exports = router;
