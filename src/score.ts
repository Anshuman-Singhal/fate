// Proper scoring for your forecasting track record.
//
// Brier score: mean squared error between predicted probabilities and actual
// outcomes (0 is perfect, 0.25 is what always-guessing-50% earns). The skill
// score compares you against that coin-flip baseline: 1 is perfect, 0 means
// you forecast exactly as well as always saying 50%, negative means worse.
// The calibration table buckets predictions and shows, per bucket, what you
// predicted on average versus how often YES actually happened.

import type { Prediction } from "./store.ts";

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  meanPredicted: number;
  actualRate: number;
}

export interface ScoreReport {
  n: number;
  brier: number;
  skill: number;
  bins: CalibrationBin[];
}

export function scorePredictions(
  preds: Prediction[],
  binCount = 5,
): ScoreReport {
  const resolved = preds.filter(
    (p): p is Prediction & { outcome: "yes" | "no" } => p.outcome !== undefined,
  );
  const n = resolved.length;
  if (n === 0) {
    return { n: 0, brier: NaN, skill: NaN, bins: [] };
  }

  let sumSq = 0;
  for (const p of resolved) {
    const outcome = p.outcome === "yes" ? 1 : 0;
    sumSq += (p.pYes - outcome) ** 2;
  }
  const brier = sumSq / n;
  const skill = 1 - brier / 0.25;

  const bins: CalibrationBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = i / binCount;
    const hi = (i + 1) / binCount;
    const inBin = resolved.filter(
      (p) => p.pYes >= lo && (i === binCount - 1 ? p.pYes <= hi : p.pYes < hi),
    );
    if (inBin.length === 0) continue;
    const meanPredicted =
      inBin.reduce((s, p) => s + p.pYes, 0) / inBin.length;
    const actualRate =
      inBin.filter((p) => p.outcome === "yes").length / inBin.length;
    bins.push({ lo, hi, n: inBin.length, meanPredicted, actualRate });
  }

  return { n, brier, skill, bins };
}
