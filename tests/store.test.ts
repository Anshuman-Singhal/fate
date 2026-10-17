import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, appendFileSync } from "node:fs";
import {
  findPrediction,
  loadPredictions,
  resolvePrediction,
  savePrediction,
  type Prediction,
} from "../src/store.ts";

function sample(id: string): Prediction {
  return {
    id,
    ts: "2026-10-13T00:00:00.000Z",
    question: "Will the tests pass?",
    prior: 0.5,
    factors: [{ text: "they usually do", direction: 1, weight: 1, pTrue: 0.8 }],
    pYes: 0.8,
    judge: "mock",
  };
}

beforeEach(() => {
  process.env.FATE_HOME = mkdtempSync(join(tmpdir(), "fate-test-"));
});

test("save then load round-trips predictions", () => {
  savePrediction(sample("abc123"));
  savePrediction(sample("def456"));
  const loaded = loadPredictions();
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].question, "Will the tests pass?");
  assert.equal(loaded[1].id, "def456");
});

test("empty store loads as empty", () => {
  assert.deepEqual(loadPredictions(), []);
});

test("resolve marks the outcome", () => {
  savePrediction(sample("abc123"));
  const r = resolvePrediction("abc", "yes");
  assert.equal(r.outcome, "yes");
  assert.ok(r.resolvedTs);
  assert.equal(loadPredictions()[0].outcome, "yes");
});

test("prefix lookup finds by prefix, rejects unknown ids", () => {
  savePrediction(sample("abc123"));
  assert.equal(findPrediction("abc1").id, "abc123");
  assert.throws(() => findPrediction("zzz"), /No prediction/);
});

test("ambiguous prefix is rejected", () => {
  savePrediction(sample("abc123"));
  savePrediction(sample("abc999"));
  assert.throws(() => findPrediction("abc"), /ambiguous/);
  assert.throws(() => resolvePrediction("abc", "no"), /ambiguous/);
});

test("corrupt lines are skipped, not fatal", () => {
  savePrediction(sample("abc123"));
  appendFileSync(join(process.env.FATE_HOME!, "predictions.jsonl"), "not json\n");
  assert.equal(loadPredictions().length, 1);
});
