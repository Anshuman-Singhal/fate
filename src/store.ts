// Prediction log: one JSON object per line, easy to inspect, grep, and back
// up. Lives in ~/.fate/predictions.jsonl, or in $FATE_HOME when set (the demo
// uses a temp dir so it never touches your real log).

import { homedir } from "node:os";
import { join } from "node:path";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

export interface StoredFactor {
  text: string;
  direction: 1 | -1;
  weight: number;
  pTrue: number;
}

export interface Prediction {
  id: string;
  ts: string;
  question: string;
  prior: number;
  factors: StoredFactor[];
  pYes: number;
  judge: string;
  outcome?: "yes" | "no";
  resolvedTs?: string;
}

export function storeDir(): string {
  return process.env.FATE_HOME ?? join(homedir(), ".fate");
}

function filePath(): string {
  const dir = storeDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, "predictions.jsonl");
}

export function makeId(): string {
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `${Date.now().toString(36)}${rand}`;
}

export function loadPredictions(): Prediction[] {
  const path = filePath();
  if (!existsSync(path)) return [];
  const preds: Prediction[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const p = JSON.parse(trimmed) as Prediction;
      if (typeof p.id === "string" && typeof p.question === "string") {
        preds.push(p);
      }
    } catch {
      // skip corrupt lines rather than losing the whole log
    }
  }
  return preds;
}

export function savePrediction(p: Prediction): void {
  appendFileSync(filePath(), JSON.stringify(p) + "\n", "utf8");
}

function rewriteAll(preds: Prediction[]): void {
  writeFileSync(
    filePath(),
    preds.map((p) => JSON.stringify(p)).join("\n") + "\n",
    "utf8",
  );
}

export function findPrediction(idPrefix: string): Prediction {
  const matches = loadPredictions().filter((p) => p.id.startsWith(idPrefix));
  if (matches.length === 0) {
    throw new Error(`No prediction starts with id "${idPrefix}". See: fate list`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Id prefix "${idPrefix}" is ambiguous (${matches.length} matches). ` +
        "Use a longer prefix from: fate list",
    );
  }
  return matches[0];
}

export function resolvePrediction(idPrefix: string, outcome: "yes" | "no"): Prediction {
  const preds = loadPredictions();
  const matches = preds.filter((p) => p.id.startsWith(idPrefix));
  if (matches.length === 0) {
    throw new Error(`No prediction starts with id "${idPrefix}". See: fate list`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Id prefix "${idPrefix}" is ambiguous (${matches.length} matches). ` +
        "Use a longer prefix from: fate list",
    );
  }
  const target = matches[0];
  target.outcome = outcome;
  target.resolvedTs = new Date().toISOString();
  rewriteAll(preds);
  return target;
}
