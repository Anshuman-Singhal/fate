// A Judge answers yes/no ("noul") questions with a probability, never prose.
// This mirrors the decision-model interface: typed questions in, calibrated
// numbers out. Two implementations ship: a deterministic offline mock and a
// live adapter for Jev through the OpenRouter Decisions API.

export interface NoulQuestion {
  id: string;
  instructions: string;
}

export interface Judgment {
  id: string;
  pYes: number; // P(yes), in [0, 1]
  confidence: number; // distribution concentration, not proof of correctness
  latencyMs: number;
}

export interface Judge {
  name: string;
  judge(
    state: Record<string, unknown>,
    questions: NoulQuestion[],
  ): Promise<Judgment[]>;
}
