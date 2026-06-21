require("dotenv").config();
const express = require("express");
const app = express();

app.use(express.json());

app.post("/reforzar", async (req, res) => {
  res.json({ test: "reforzar" });
});

app.post("/delete", async (req, res) => {
  res.json({ test: "delete" });
});

// Print all routes
console.log("\n=== REGISTERED ROUTES ===");
app._router.stack.forEach(middleware => {
  if (middleware.route) {
    const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());
    console.log(`${methods.join(',')} ${middleware.route.path}`);
  } else if (middleware.name === 'router') {
    middleware.handle.stack.forEach(handler => {
      const route = handler.route;
      if (route) {
        const methods = Object.keys(route.methods).map(m => m.toUpperCase());
        console.log(`${methods.join(',')} ${route.path}`);
      }
    });
  }
});
console.log("========================\n");

process.exit(0);
