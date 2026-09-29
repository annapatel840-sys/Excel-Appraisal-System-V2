"use strict";

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

module.exports = (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  return send(res, 200, {
    success: true,
    diagnostic: true,
    method: req.method,
    message: "budgetmasterapi runtime reached successfully.",
  });
};
