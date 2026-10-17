#!/usr/bin/env bun
// fate: a Magic 8-ball with a statistics degree.
//
// Ask yes/no questions, back them with evidence, get a calibrated
// probability instead of a platitude. Judgments come from a decision model
// (Jev via the OpenRouter Decisions API) when OPENROUTER_API_KEY is set,
// otherwise from a deterministic offline mock. Log predictions, resolve
// them, and watch your Brier score.

import { createInterface } from "node:readline/promises";
import type { Judge } from "./judge.ts";
import { MockJudge } from "./mock.ts";
import { JevJudge, hasJevKey, jevEndpoint, jevModel } from "./jev.ts";
import { aggregate, type FactorInput, type JudgedFactor } from "./forecast.ts";
import {
  loadPredictions,
  makeId,
  resolvePrediction,
  savePrediction,
  storeDir,
} from "./store.ts";
import { scorePredictions } from "./score.ts";
import {
  bold,
  cyan,
  dim,
  green,
  red,
  renderAsk,
  renderCalibration,
  renderList,
  yellow,
} from "./ui.ts";

const VERSION = "1.0.0";

function selectJudge(forceMock: boolean): Judge {
  if (!forceMock && hasJevKey()) return new JevJudge();
  return new MockJudge();
}

const HELP = `
${bold("fate")} ${dim(`v${VERSION}`)}: a Magic 8-ball with a statistics degree.

${bold("Usage")}
  fate ask "Will ...?" [--for "evidence"] [--against "evidence"] [options]
  fate list [--json]
  fate resolve <id> <yes|no>
  fate score [--json]
  fate doctor [--live]
  fate help

${bold("ask options")}
  --for "text"        evidence supporting YES (repeatable)
  --against "text"    evidence supporting NO (repeatable)
  --weight N          weight for the most recent --for/--against (default 1)
  --prior P           your base rate before evidence, 0..1 exclusive (default 0.5)
  --log               save this prediction to your log (~/.fate, or $FATE_HOME)
  --json              machine-readable output
  --mock              use the offline mock even if OPENROUTER_API_KEY is set
  -i, --interactive   prompt for the question and evidence

  With no evidence flags in a terminal, ask prompts you interactively.

${bold("Judges")}
  mock  deterministic and offline (default). Same question, same answer.
  jev   TypeSafe AI's System One decision model via the OpenRouter Decisions
        API. Activates automatically when OPENROUTER_API_KEY is set.

${bold("Examples")}
  fate ask "Will I ship before dinner?" \\
    --for "core code is written" --against "demos always overrun" --log
  fate resolve a3f9 yes
  fate score
`.trim();

const ASK_HELP = `
${bold("fate ask")} "Will ...?" [--for "x"] [--against "y"] [--weight N]
          [--prior P] [--log] [--json] [--mock] [-i]

Each --for/--against factor becomes one yes/no judgment ("is this claim
true?") answered by the judge, then combined with your prior by log-odds
averaging. Use --weight N right after a factor to count it N times.
`.trim();

function fail(msg: string): number {
  console.error(`${red("fate:")} ${msg}`);
  return 1;
}

function parseOutcome(s: string): "yes" | "no" | undefined {
  const t = s.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(t)) return "yes";
  if (["no", "n", "false", "0"].includes(t)) return "no";
  return undefined;
}

async function promptAsk(existingQuestion: string): Promise<{
  question: string;
  factors: FactorInput[];
}> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let question = existingQuestion;
    if (!question) {
      question = (await rl.question(bold("Your yes/no question: "))).trim();
    }
    const factors: FactorInput[] = [];
    console.log(dim('Evidence FOR a "yes" answer (blank line to finish):'));
    for (;;) {
      const line = (await rl.question("  for> ")).trim();
      if (!line) break;
      factors.push({ text: line, direction: 1, weight: 1 });
    }
    console.log(dim('Evidence AGAINST (blank line to finish):'));
    for (;;) {
      const line = (await rl.question("  against> ")).trim();
      if (!line) break;
      factors.push({ text: line, direction: -1, weight: 1 });
    }
    return { question, factors };
  } finally {
    rl.close();
  }
}

async function cmdAsk(raw: string[]): Promise<number> {
  let prior = 0.5;
  let doLog = false;
  let asJson = false;
  let forceMock = false;
  let interactive = false;
  const factors: FactorInput[] = [];
  const positionals: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "--for" || a === "--against") {
      const text = raw[++i];
      if (text === undefined || text.startsWith("-")) {
        return fail(`Missing value for ${a}. Usage: ${a} "some evidence"`);
      }
      factors.push({ text, direction: a === "--for" ? 1 : -1, weight: 1 });
    } else if (a === "--weight") {
      const w = Number(raw[++i]);
      if (!Number.isFinite(w) || w <= 0) {
        return fail("--weight needs a positive number, right after a --for/--against.");
      }
      if (factors.length === 0) {
        return fail("--weight must follow a --for or --against flag.");
      }
      factors[factors.length - 1].weight = w;
    } else if (a === "--prior") {
      const p = Number(raw[++i]);
      if (!Number.isFinite(p) || p <= 0 || p >= 1) {
        return fail("--prior must be between 0 and 1 (exclusive), e.g. --prior 0.3.");
      }
      prior = p;
    } else if (a === "--log") doLog = true;
    else if (a === "--json") asJson = true;
    else if (a === "--mock") forceMock = true;
    else if (a === "-i" || a === "--interactive") interactive = true;
    else if (a === "-h" || a === "--help") {
      console.log(ASK_HELP);
      return 0;
    } else if (a.startsWith("-")) {
      return fail(`Unknown flag: ${a}. See: fate help`);
    } else {
      positionals.push(a);
    }
  }

  let question = positionals.join(" ").trim();
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (interactive || (factors.length === 0 && tty && !asJson)) {
    const res = await promptAsk(question);
    question = res.question;
    factors.push(...res.factors);
  }
  if (!question) return fail('Ask a yes/no question: fate ask "Will ...?"');
  if (factors.length === 0) {
    return fail(
      "Give at least one --for or --against factor, or run with -i in a terminal.",
    );
  }
  if (factors.length > 32 && !forceMock && hasJevKey()) {
    return fail("Jev judges at most 32 factors per request; use --mock for more.");
  }

  const judge = selectJudge(forceMock);
  const state = {
    question,
    factors: factors.map((f, i) => ({
      id: `f${i}`,
      claim: f.text,
      stance: f.direction === 1 ? "supports-yes" : "supports-no",
    })),
  };
  const questions = factors.map((f, i) => ({
    id: `f${i}`,
    instructions:
      `Question under judgment: "${question}". ` +
      `Claim: "${f.text}". Is the claim true? ` +
      "Judge only whether the claim is true, not whether it matters.",
  }));

  let judgments;
  try {
    judgments = await judge.judge(state, questions);
  } catch (err) {
    console.error(`${red("Judge failed:")} ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  const judged: JudgedFactor[] = factors.map((f, i) => ({
    ...f,
    pTrue: judgments[i].pYes,
    confidence: judgments[i].confidence,
  }));
  const forecast = aggregate(prior, judged, judge.name);

  let loggedId: string | undefined;
  if (doLog) {
    loggedId = makeId();
    savePrediction({
      id: loggedId,
      ts: new Date().toISOString(),
      question,
      prior: forecast.prior,
      factors: judged.map((f) => ({
        text: f.text,
        direction: f.direction,
        weight: f.weight,
        pTrue: f.pTrue,
      })),
      pYes: forecast.pYes,
      judge: judge.name,
    });
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          question,
          prior: forecast.prior,
          pYes: forecast.pYes,
          judge: judge.name,
          factors: judged,
          ...(loggedId ? { id: loggedId } : {}),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(renderAsk({ question, ...forecast, loggedId }));
  }
  return 0;
}

function cmdList(raw: string[]): number {
  const asJson = raw.includes("--json");
  const preds = loadPredictions();
  if (asJson) {
    console.log(JSON.stringify(preds, null, 2));
  } else {
    console.log(renderList(preds));
  }
  return 0;
}

function cmdResolve(raw: string[]): number {
  const [idPrefix, outcomeRaw] = raw;
  if (!idPrefix || !outcomeRaw) {
    return fail("Usage: fate resolve <id> <yes|no>  (id prefix from: fate list)");
  }
  const outcome = parseOutcome(outcomeRaw);
  if (!outcome) return fail(`Outcome must be yes or no, got "${outcomeRaw}".`);
  try {
    const p = resolvePrediction(idPrefix, outcome);
    console.log(
      `${green("Resolved")} ${dim(p.id.slice(0, 8))} as ${bold(outcome.toUpperCase())}: ${p.question}`,
    );
    return 0;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

function cmdScore(raw: string[]): number {
  const asJson = raw.includes("--json");
  const report = scorePredictions(loadPredictions());
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderCalibration(report));
  }
  return 0;
}

async function cmdDoctor(raw: string[]): Promise<number> {
  const live = raw.includes("--live");
  const judge = selectJudge(false);
  const preds = loadPredictions();
  const resolved = preds.filter((p) => p.outcome !== undefined).length;

  console.log("");
  console.log(`${bold("fate doctor")}`);
  console.log("");
  console.log(`  judge        ${cyan(judge.name)}`);
  console.log(`  api key      ${hasJevKey() ? green("OPENROUTER_API_KEY is set") : yellow("not set (using mock)")}`);
  if (hasJevKey()) {
    console.log(`  endpoint     ${dim(jevEndpoint())}`);
    console.log(`  model        ${dim(jevModel())}`);
  }
  console.log(`  storage      ${dim(storeDir())}`);
  console.log(`  logged       ${preds.length} predictions, ${resolved} resolved`);
  if (live) {
    if (!hasJevKey()) {
      console.log(`  live check   ${yellow("skipped: no API key, mock needs no network")}`);
    } else {
      try {
        const started = Date.now();
        const [j] = await new JevJudge().judge(
          { probe: "connectivity check" },
          [{ id: "probe", instructions: "Is this sentence written in English?" }],
        );
        console.log(
          `  live check   ${green("ok")} (${Date.now() - started} ms, P(yes) = ${j.pYes.toFixed(2)})`,
        );
      } catch (err) {
        console.log(
          `  live check   ${red("failed")}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return 2;
      }
    }
  }
  console.log("");
  return 0;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "ask":
      return cmdAsk(rest);
    case "list":
    case "ls":
      return cmdList(rest);
    case "resolve":
      return cmdResolve(rest);
    case "score":
      return cmdScore(rest);
    case "doctor":
      return cmdDoctor(rest);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      return 0;
    case "--version":
    case "-v":
      console.log(`fate v${VERSION}`);
      return 0;
    default:
      console.error(`${red("fate:")} unknown command "${cmd}".`);
      console.log(HELP);
      return 1;
  }
}

process.exit(await main());
