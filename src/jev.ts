// Live judge backed by Jev, TypeSafe AI's "System One" decision model,
// routed through OpenRouter's Decisions API. Jev is non-generative: you send
// structured state plus typed questions and get calibrated probabilities
// back, with no free text. Only activates when OPENROUTER_API_KEY is set;
// otherwise fate uses the offline mock.
//
// Request shape follows OpenRouter's public Decisions API docs and the
// pi-typesafe client convention: POST /api/alpha/decisions with
// { model, state, questions }, where each question is
// { type: "noul", instructions }. Answers come back as
// answers: { "<id>": { type: "noul", noul: P(yes), confidence, ... } }.

import type { Judge, Judgment, NoulQuestion } from "./judge.ts";

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";
const TIMEOUT_MS = 15_000;

export function hasJevKey(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

export function jevEndpoint(): string {
  return ENDPOINT;
}

export function jevModel(): string {
  return MODEL;
}

interface JevAnswer {
  type?: string;
  noul?: number;
  confidence?: number;
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return NaN;
  return Math.min(1, Math.max(0, x));
}

export class JevJudge implements Judge {
  readonly name = `jev (${MODEL} via OpenRouter)`;

  async judge(
    state: Record<string, unknown>,
    questions: NoulQuestion[],
  ): Promise<Judgment[]> {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Set it to use the Jev judge, " +
          "or unset it to fall back to the offline mock.",
      );
    }
    if (questions.length === 0) return [];
    if (questions.length > 32) {
      throw new Error(
        `Jev accepts at most 32 questions per request, got ${questions.length}.`,
      );
    }

    const body = {
      model: MODEL,
      state,
      questions: Object.fromEntries(
        questions.map((q) => [q.id, { type: "noul", instructions: q.instructions }]),
      ),
    };

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/Anshuman-Singhal/fate",
          "X-Title": "fate",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(
        `Jev request failed before a response arrived: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? " (check that OPENROUTER_API_KEY is valid)"
          : res.status === 402
            ? " (OpenRouter credits exhausted)"
            : res.status === 429
              ? " (rate limited, try again shortly)"
              : "";
      throw new Error(`Jev request failed: HTTP ${res.status}${hint}.`);
    }

    const data = (await res.json()) as { answers?: Record<string, JevAnswer> };
    const answers = data.answers ?? {};
    const latencyMs = Date.now() - started;

    return questions.map((q) => {
      const a = answers[q.id];
      const raw = typeof a?.noul === "number" ? a.noul : undefined;
      if (raw === undefined || Number.isNaN(raw)) {
        throw new Error(
          `Jev returned no noul probability for question "${q.id}". ` +
            "The Decisions API response shape may have changed; see src/jev.ts.",
        );
      }
      return {
        id: q.id,
        pYes: clamp01(raw),
        confidence:
          typeof a?.confidence === "number" ? clamp01(a.confidence) : NaN,
        latencyMs,
      };
    });
  }
}
