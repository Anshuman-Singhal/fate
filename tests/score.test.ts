import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePredictions } from "../src/score.ts";
import type { Prediction } from "../src/store.ts";

function pred(pYes: number, outcome: "yes" | "no"): Prediction {
  return {
    id: `id${Math.random()}`,
    ts: new Date().toISOString(),
    question: "q",
    prior: 0.5,
    factors: [],
    pYes,
    judge: "mock",
    outcome,
  };
}

test("no resolved predictions: n is 0", () => {
  const r = scorePredictions([pred(0.7, "yes")].map((p) => ({ ...p, outcome: undefined })));
  assert.equal(r.n, 0);
  assert.deepEqual(r.bins, []);
});

test("perfect forecaster: brier 0, skill 1", () => {
  const r = scorePredictions([pred(1, "yes"), pred(0, "no"), pred(1, "yes")]);
  assert.equal(r.n, 3);
  assert.ok(Math.abs(r.brier) < 1e-9);
  assert.ok(Math.abs(r.skill - 1) < 1e-9);
});

test("always saying 50%: brier 0.25, skill 0", () => {
  const r = scorePredictions([pred(0.5, "yes"), pred(0.5, "no")]);
  assert.ok(Math.abs(r.brier - 0.25) < 1e-9);
  assert.ok(Math.abs(r.skill) < 1e-9);
});

test("calibration bins bucket correctly", () => {
  const r = scorePredictions(
    [pred(0.9, "yes"), pred(0.85, "no"), pred(0.1, "no"), pred(0.2, "no")],
    5,
  );
  const top = r.bins.find((b) => b.lo === 0.8);
  assert.ok(top);
  assert.equal(top.n, 2);
  assert.ok(Math.abs(top.meanPredicted - 0.875) < 1e-9);
  assert.equal(top.actualRate, 0.5);
  const bottom = r.bins.find((b) => b.lo === 0.0);
  assert.ok(bottom);
  assert.equal(bottom.n, 1); // p=0.2 lands in the [0.2, 0.4) bin (half-open)
  assert.equal(bottom.actualRate, 0);
  const second = r.bins.find((b) => b.lo === 0.2);
  assert.ok(second);
  assert.equal(second.n, 1);
  assert.ok(Math.abs(second.meanPredicted - 0.2) < 1e-9);
});
