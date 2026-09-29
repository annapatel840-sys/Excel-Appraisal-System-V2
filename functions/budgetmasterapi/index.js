"use strict";

function send(res, status, body, req) {
  const origin = req && req.headers
    ? req.headers.origin || req.headers.Origin
    : "";

  const allowedOrigin =
    origin === "https://excel-appraisal-syst-iqjipxdl.onslate.in"
      ? origin
      : "*";

  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

module.exports = (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204, {}, req);
  }

  return send(
    res,
    200,
    {
      success: true,
      diagnostic: true,
      method: req.method,
      message: "budgetmasterapi runtime reached successfully.",
    },
    req,
  );
};
