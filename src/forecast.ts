// Log-odds aggregation of independent evidence.
//
// Each factor is a claim with a judged P(claim is true) and a direction:
// +1 means the claim's truth supports YES, -1 means it supports NO.
// We convert every probability to log-odds, take the weight-averaged signed
// evidence, and add it to the prior log-odds. Simple, transparent, and honest
// about its independence assumption: correlated factors will double count,
// which is why the CLI shows every factor's contribution.

export interface FactorInput {
  text: string;
  direction: 1 | -1;
  weight: number;
}

export interface JudgedFactor extends FactorInput {
  pTrue: number;
  confidence: number;
}

export interface Forecast {
  pYes: number;
  prior: number;
  judgeName: string;
  factors: JudgedFactor[];
}

const EPS = 1e-6;

export function clampProb(p: number): number {
  if (Number.isNaN(p)) return 0.5;
  return Math.min(1 - EPS, Math.max(EPS, p));
}

export function logit(p: number): number {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function aggregate(
  prior: number,
  factors: JudgedFactor[],
  judgeName: string,
): Forecast {
  const p0 = clampProb(prior);
  let weightedEvidence = 0;
  let totalWeight = 0;
  for (const f of factors) {
    const w = f.weight > 0 && Number.isFinite(f.weight) ? f.weight : 1;
    weightedEvidence += f.direction * w * logit(f.pTrue);
    totalWeight += w;
  }
  const pYes =
    totalWeight === 0 ? p0 : sigmoid(logit(p0) + weightedEvidence / totalWeight);
  return { pYes, prior: p0, judgeName, factors };
}
