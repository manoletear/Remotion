import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeRut } from "./validators.js";

test("normalizeRut accepts a valid RUT and normalizes formatting", () => {
  assert.equal(normalizeRut("12345678-5"), "12345678-5");
  assert.equal(normalizeRut("12.345.678-5"), "12345678-5");
  assert.equal(normalizeRut("123456785"), "12345678-5");
});

test("normalizeRut accepts a lowercase or uppercase K check digit", () => {
  assert.equal(normalizeRut("1000005-K"), "1000005-K");
  assert.equal(normalizeRut("1000005-k"), "1000005-K");
});

test("normalizeRut rejects a wrong check digit", () => {
  assert.equal(normalizeRut("12345678-6"), null);
});

test("normalizeRut rejects malformed input", () => {
  assert.equal(normalizeRut("not-a-rut"), null);
  assert.equal(normalizeRut(""), null);
  assert.equal(normalizeRut("123-4"), null); // body too short
});
