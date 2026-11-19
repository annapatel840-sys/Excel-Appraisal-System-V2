"use strict";

/*
 * Protection for every outside call lettersapi makes (Data Store / ZCQL and
 * Stratus), copied from how employeesapi, payrollcycleapi and accessapi cope
 * with this project's Catalyst limits:
 *
 *   - GATE:    at most MAX_IN_FLIGHT calls at once per instance. Catalyst
 *              answers "429 concurrency limit reached" when too many Data Store
 *              calls run together (the other functions use 2-4 at a time).
 *   - RETRY:   a 429 / temporary network error is retried with a short,
 *              growing wait (same shape as withDataStoreRetry / whenNotBusy).
 *   - TIMEOUT: one call that does not answer within `ms` fails with a clear
 *              message instead of leaving the whole request "pending" until
 *              Catalyst kills it (~30 s) with no explanation.
 */

const MAX_IN_FLIGHT = 3;
const DEFAULT_TIMEOUT_MS = 9000;
const MAX_RETRIES = 3;

let active = 0;
const waiting = [];

function acquire() {
  if (active < MAX_IN_FLIGHT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); // the slot passes straight to the next waiter
  else active -= 1;
}

const TRANSIENT = /concurren|too many|rate limit|timed? ?out|econnreset|etimedout|socket hang up|\b429\b|\b502\b|\b503\b|\b504\b/i;
function isTransient(error) {
  if (!error) return false;
  if (error.statusCode === 429 || error.code === "TOO_MANY_REQUESTS" || error.code === "ECONNRESET" || error.code === "ETIMEDOUT") return true;
  return TRANSIENT.test(String(error.message || error));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`${label} did not answer within ${Math.round(ms / 1000)} seconds.`);
      e.timeout = true;
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* guarded(fn, label, ms): run fn() through the gate, with retry and a time limit. */
async function guarded(fn, label = "A request to the server", ms = DEFAULT_TIMEOUT_MS) {
  for (let attempt = 0; ; attempt += 1) {
    await acquire();
    try {
      return await withTimeout(Promise.resolve().then(fn), ms, label);
    } catch (error) {
      if (error && error.timeout) throw error; // a call that already waited its limit is not repeated
      if (attempt >= MAX_RETRIES || !isTransient(error)) throw error;
      const delay = 250 * 2 ** attempt + Math.floor(Math.random() * 200);
      console.warn("lettersapi: retrying", label, "attempt", attempt + 1, String(error.message || error).slice(0, 120));
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      release();
    }
  }
}

module.exports = { guarded, withTimeout, isTransient };
