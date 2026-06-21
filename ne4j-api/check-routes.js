require("dotenv").config({ path: ".env" });

// Monkey-patch app.post to log route registration
const express = require("express");
const originalPost = express.application.post;

const routes = [];
express.application.post = function(path, ...handlers) {
  routes.push(`POST ${path}`);
  return originalPost.apply(this, arguments);
};

// Now require the server
require("./server.js");

// List routes
console.log("\n=== ROUTES REGISTERED ===");
routes.forEach(r => console.log(r));
console.log("========================\n");

setTimeout(() => process.exit(0), 100);
