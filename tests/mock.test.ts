import { test } from "node:test";
import assert from "node:assert/strict";
import { MockJudge } from "../src/mock.ts";

test("mock is deterministic for the same input", async () => {
  const j = new MockJudge();
  const q = [{ id: "f0", instructions: "Is the sky blue?" }];
  const a = await j.judge({ question: "x" }, q);
  const b = await j.judge({ question: "x" }, q);
  assert.equal(a[0].pYes, b[0].pYes);
});

test("mock probabilities stay in a sane range", async () => {
  const j = new MockJudge();
  for (let i = 0; i < 50; i++) {
    const [r] = await j.judge({ n: i }, [{ id: "f0", instructions: `claim ${i}` }]);
    assert.ok(r.pYes >= 0.15 && r.pYes <= 0.85, `out of range: ${r.pYes}`);
    assert.ok(Number.isFinite(r.confidence));
  }
});

test("different questions usually give different answers", async () => {
  const j = new MockJudge();
  const seen = new Set<number>();
  for (let i = 0; i < 20; i++) {
    const [r] = await j.judge({}, [{ id: "f0", instructions: `totally different claim ${i}` }]);
    seen.add(Math.round(r.pYes * 1e6));
  }
  assert.ok(seen.size > 5, "mock looks constant across questions");
});

test("mock handles an empty question list", async () => {
  const j = new MockJudge();
  assert.deepEqual(await j.judge({}, []), []);
});
