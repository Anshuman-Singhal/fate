import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  clampProb,
  logit,
  sigmoid,
  type JudgedFactor,
} from "../src/forecast.ts";

function f(pTrue: number, direction: 1 | -1 = 1, weight = 1): JudgedFactor {
  return { text: "x", direction, weight, pTrue, confidence: 1 };
}

test("logit and sigmoid are inverses", () => {
  for (const p of [0.01, 0.2, 0.5, 0.8, 0.99]) {
    assert.ok(Math.abs(sigmoid(logit(p)) - p) < 1e-12);
  }
});

test("no factors: answer equals the prior", () => {
  const r = aggregate(0.3, [], "mock");
  assert.equal(r.pYes, 0.3);
});

test("one strong for-factor moves probability to the factor", () => {
  const r = aggregate(0.5, [f(0.9)], "mock");
  assert.ok(Math.abs(r.pYes - 0.9) < 1e-9);
});

test("symmetric for/against evidence cancels out", () => {
  const r = aggregate(0.5, [f(0.8, 1), f(0.8, -1)], "mock");
  assert.ok(Math.abs(r.pYes - 0.5) < 1e-9);
});

test("against-factor pushes below the prior", () => {
  const r = aggregate(0.5, [f(0.9, -1)], "mock");
  assert.ok(Math.abs(r.pYes - 0.1) < 1e-9);
});

test("weights tilt the average toward the heavier factor", () => {
  const light = aggregate(0.5, [f(0.9, 1, 1), f(0.9, -1, 3)], "mock");
  assert.ok(light.pYes < 0.5, `expected < 0.5, got ${light.pYes}`);
  const heavy = aggregate(0.5, [f(0.9, 1, 3), f(0.9, -1, 1)], "mock");
  assert.ok(heavy.pYes > 0.5, `expected > 0.5, got ${heavy.pYes}`);
});

test("extreme probabilities are clamped, never NaN", () => {
  const r = aggregate(0.5, [f(1), f(0, -1)], "mock");
  assert.ok(Number.isFinite(r.pYes));
  assert.ok(r.pYes > 0.5);
});

test("prior shifts the starting point", () => {
  const low = aggregate(0.2, [f(0.6)], "mock");
  const high = aggregate(0.8, [f(0.6)], "mock");
  assert.ok(low.pYes < high.pYes);
});

test("clampProb handles NaN and out-of-range input", () => {
  assert.equal(clampProb(NaN), 0.5);
  assert.ok(clampProb(2) < 1 && clampProb(2) > 0.99);
  assert.ok(clampProb(-3) > 0 && clampProb(-3) < 0.01);
});
