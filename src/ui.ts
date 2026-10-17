// All terminal rendering. Pure functions returning strings; main.ts prints.
// Color is applied only when stdout is a TTY and NO_COLOR is unset.

import type { JudgedFactor } from "./forecast.ts";
import type { ScoreReport } from "./score.ts";
import type { Prediction } from "./store.ts";

const USE_COLOR =
  !process.env.NO_COLOR && Boolean(process.stdout.isTTY);

function paint(code: string, s: string): string {
  return USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const bold = (s: string): string => paint("1", s);
export const dim = (s: string): string => paint("2", s);
export const cyan = (s: string): string => paint("36", s);
export const green = (s: string): string => paint("32", s);
export const yellow = (s: string): string => paint("33", s);
export const red = (s: string): string => paint("31", s);

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function center(s: string, width: number): string {
  const t = s.length > width ? s.slice(0, width) : s;
  const pad = width - t.length;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + t + " ".repeat(pad - left);
}

// Classic 8-ball silhouette with the probability in the answer window.
export function eightBall(label: string): string {
  const win = center(label, 9);
  return [
    "        _________        ",
    "      .'         '.      ",
    "     /             \\     ",
    "    |               |    ",
    "    |    .-\"\"\"-.    |    ",
    `    |  /${win}\\  |    `,
    "    |  \\         /  |    ",
    "    |    '-...-'    |    ",
    "    |               |    ",
    "     \\             /     ",
    "      '.         .'      ",
    "        '''''''''        ",
  ].join("\n");
}

export function meter(p: number, width = 20): string {
  const filled = Math.round(p * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `[${bar}] ${pct(p)}`;
}

export function verdict(p: number): string {
  if (p >= 0.85) return "Signs point to yes.";
  if (p >= 0.7) return "Outlook looks good.";
  if (p >= 0.58) return "Leaning yes.";
  if (p >= 0.42) return "Too close to call. Bring better evidence.";
  if (p >= 0.3) return "Leaning no.";
  if (p >= 0.15) return "Outlook looks rough.";
  return "Signs point to no.";
}

function verdictColor(p: number, s: string): string {
  if (p >= 0.58) return green(s);
  if (p >= 0.42) return yellow(s);
  return red(s);
}

export interface AskRenderInput {
  question: string;
  pYes: number;
  prior: number;
  judgeName: string;
  factors: JudgedFactor[];
  loggedId?: string;
}

export function renderFactorTable(factors: JudgedFactor[]): string {
  if (factors.length === 0) return dim("  (no evidence judged; answer equals the prior)");
  const rows = factors.map((f) => {
    const arrow = f.direction === 1 ? green("for    ") : red("against");
    const w = f.weight === 1 ? "" : dim(` x${f.weight}`);
    return `  ${arrow} ${pct(f.pTrue).padStart(4)}  ${f.text}${w}`;
  });
  return ["  stance  P(true)  claim", ...rows].join("\n");
}

export function renderAsk(a: AskRenderInput): string {
  const lines = [
    "",
    cyan(eightBall(pct(a.pYes))),
    "",
    `${bold("Q:")} ${a.question}`,
    "",
    renderFactorTable(a.factors),
    "",
    `  ${meter(a.pYes)}  ${verdictColor(a.pYes, bold(verdict(a.pYes)))}`,
    "",
    dim(
      `  prior ${pct(a.prior)}, judge: ${a.judgeName}` +
        (a.loggedId ? `, logged as ${a.loggedId}` : ", not logged (use --log to track it)"),
    ),
    "",
  ];
  return lines.join("\n");
}

export function renderCalibration(r: ScoreReport): string {
  if (r.n === 0) {
    return "No resolved predictions yet. Log some with: fate ask ... --log\nthen resolve them with: fate resolve <id> yes|no";
  }
  const lines = [
    "",
    `${bold("Forecasting scorecard")}  (${r.n} resolved)`,
    "",
    `  Brier score   ${r.brier.toFixed(3)}  ${dim("(0 is perfect, 0.25 is coin-flip)")}`,
    `  Skill vs 50%  ${r.skill >= 0 ? "+" : ""}${r.skill.toFixed(2)}  ${dim("(1 is perfect, 0 matches always saying 50%)")}`,
    "",
    "  Calibration: when you said X%, how often was it YES?",
    "",
  ];
  for (const b of r.bins) {
    const label = `${pct(b.lo)}-${pct(b.hi)}`.padStart(9);
    const bar = "█".repeat(Math.round(b.actualRate * 16)).padEnd(16, "░");
    const mark =
      Math.abs(b.meanPredicted - b.actualRate) <= 0.15
        ? green("calibrated")
        : yellow("off");
    lines.push(
      `  ${label}  n=${String(b.n).padStart(3)}  [${bar}] actual ${pct(b.actualRate).padStart(4)}  ${mark}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function shortTs(ts: string): string {
  return ts.slice(0, 10);
}

export function renderList(preds: Prediction[]): string {
  if (preds.length === 0) {
    return "Nothing logged yet. Try: fate ask \"Will it rain tomorrow?\" --for \"dark clouds\" --log";
  }
  const lines = ["", `${bold("Logged predictions")} (${preds.length})`, ""];
  for (const p of [...preds].reverse()) {
    const status =
      p.outcome === undefined
        ? yellow("pending")
        : p.outcome === "yes"
          ? green("YES")
          : red("NO ");
    const id = dim(p.id.slice(0, 8));
    const q =
      p.question.length > 52 ? p.question.slice(0, 51) + "…" : p.question;
    lines.push(`  ${id}  ${shortTs(p.ts)}  ${meter(p.pYes, 10)}  ${status}  ${q}`);
  }
  lines.push("");
  return lines.join("\n");
}
