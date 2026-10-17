// Deterministic offline judge. It hashes each question (plus the shared
// state) and maps the hash to a probability, so the same question always gets
// the same answer and demos are reproducible with no network and no API key.
// It is a stand-in, not a model: real judgments come from the Jev adapter.

import type { Judge, Judgment, NoulQuestion } from "./judge.ts";

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class MockJudge implements Judge {
  readonly name = "mock (deterministic, offline)";

  async judge(
    state: Record<string, unknown>,
    questions: NoulQuestion[],
  ): Promise<Judgment[]> {
    const stateJson = JSON.stringify(state);
    return questions.map((q) => {
      const h = fnv1a(`${q.id}::${q.instructions}::${stateJson}`);
      const pYes = 0.15 + 0.7 * (h / 0xffffffff);
      const h2 = fnv1a(`confidence::${q.id}::${q.instructions}`);
      const confidence = 0.55 + 0.4 * (h2 / 0xffffffff);
      return { id: q.id, pYes, confidence, latencyMs: 0 };
    });
  }
}
