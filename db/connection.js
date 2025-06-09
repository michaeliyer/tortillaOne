// db/connection.js
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./db/tortillaOne.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to tortillaOne.db from db/connection.js');
  }
});

module.exports = db;