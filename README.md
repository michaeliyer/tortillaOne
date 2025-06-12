# TortillaOne - Tortilla Ordering System

## Overview

TortillaOne is a Node.js and Express-based web application for ordering custom tortillas. It provides functionality for managing customers, browsing products, creating orders, applying payments, and viewing outstanding balances—all backed by a lightweight SQLite database and rendered with EJS templates.

## Features Implemented

### Customer & Order Management

- Customer search by email, name, or phone directly on the admin page.
- Create new orders with item selection, subtotal calculation, and delivery fee logic.
- Computed `balance` column in SQLite (`total_price - payments`) to track amount due or credit.
- Automatic handling of customer credits: unused credits apply to subsequent orders.
- Simple payment recording interface for each order.

### Delivery Fee Calculation

- Flat $10 delivery fee for item subtotals under $50.
- Percentage-based fees for larger orders:
  - 18% for subtotals between $50 and $100
  - 16% for subtotals between $100 and $150
  - 14% for subtotals between $150 and $200
  - 12% for subtotals $200 and above

### Admin Dashboard

- Integrated customer lookup and outstanding balance summary at top of page.
- Summary cards displaying:
  - Total Owed (sum of all positive balances)
  - Total Credits (sum of all negative balances)
- Simplified order display: shows items subtotal, delivery fee, order subtotal, previous balance, current balance, and status.
- Forms for recording payments and updating order status.

### Frontend & Static Assets

- EJS templates under `views/` for HTML generation.
- Static assets served from `public/` with `express.static("public")`:
  - `/css/style.css` for styling
  - `/js/script.js` for frontend behavior

## Technical Stack

- Node.js & Express for server-side logic and routing
- SQLite3 database with computed columns for balances
- EJS templating engine for dynamic HTML
- Vanilla CSS and JavaScript for styling and interactivity

## Project Structure

```
/ (project root)
├── db/
│   └── connection.js      # SQLite3 connection setup
├── public/
│   ├── css/
│   │   └── style.css      # Custom styles
│   └── js/
│       └── script.js      # Frontend scripts
├── routes/
│   ├── customers.js       # Routes for customer/order creation
│   └── admin.js           # Admin dashboard routes
├── views/
│   ├── index.ejs          # Landing page template
│   └── admin.ejs          # Admin dashboard template
├── server.js              # Express app entry point
└── README.md              # Project documentation
```

## Getting Started

1. Ensure you have Node.js (v14+) installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Visit `http://localhost:3000` to access the app.

## Future Improvements

- **Authentication & Authorization**: Add login and role-based access control.
- **Input Validation & Sanitization**: Prevent invalid or malicious data.
- **Automated Testing**: Unit and integration tests for routes, templates, and database logic.
- **Enhanced UI/UX**: Use a front-end framework (React, Vue) or component library for a modern interface.
- **Database Migrations & Seed Scripts**: Streamline schema changes and test data setup.
- **Error Handling & Logging**: Implement robust error middleware and centralized logging.
- **Deployment**: Dockerize the app, configure environment variables, and deploy to cloud platforms.
- **Real-Time Updates**: Use WebSockets (Socket.io) for live order and balance notifications.
- **Accessibility & Internationalization**: Make the UI WCAG compliant and support multiple languages.

---

_This README was generated to document the current state of the app and suggest next development steps._
