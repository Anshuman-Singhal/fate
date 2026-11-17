# fate

A Magic 8-ball with a statistics degree. Ask yes/no questions, back them with
evidence, and get a calibrated probability instead of a platitude.

## Why this exists

Most language models answer judgment questions with confident prose that is
hard to score. Decision models are a new model class that flips this: typed
questions in, calibrated probabilities out, no free text. fate is a playground
for that interface, built around Jev (TypeSafe AI's System One decision
model), wrapped in the most disarming UI possible: a Magic 8-ball. Underneath
the joke is a real forecasting practice tool: log predictions, resolve them,
and measure your Brier score and calibration like a professional forecaster.

## How it works

- **Judges.** The `Judge` interface answers yes/no ("noul") questions with
  P(yes). Two implementations ship: a deterministic offline mock (default, so
  everything works with no key and no network) and a live Jev adapter that
  POSTs to OpenRouter's Decisions API (`/api/alpha/decisions`,
  model `typesafe/jev-1.13`) and activates automatically when
  `OPENROUTER_API_KEY` is set. All factors are judged in one batched request.
- **Aggregation.** Each factor is a claim with a judged P(true) and a stance
  (for/against). Probabilities become log-odds, the weight-averaged signed
  evidence is added to your prior, and the result is squashed back to a
  probability. Transparent math with an honest independence assumption, and
  every factor's contribution is shown.
- **Tracking.** Predictions append to `~/.fate/predictions.jsonl` (JSON lines,
  `$FATE_HOME` overrides). `fate score` computes Brier score, skill versus an
  always-say-50% baseline, and a text calibration chart.

## Run it

Requires Bun (install from bun.sh with their one-line installer).
Zero dependencies otherwise. Also runs on Node 24+ via type stripping.

```bash
./demo.sh
```

The demo runs the test suite, then a full loop (ask, log, resolve, score,
doctor) against the mock judge in a temp dir, so your real `~/.fate` is
untouched. Under a minute.

Or drive it yourself:

```bash
bun src/main.ts ask "Will the Fed cut rates in December?" \
  --for "inflation is cooling" \
  --for "labor market is softening" --weight 2 \
  --against "the chair sounded hawkish last week" \
  --prior 0.4 --log

bun src/main.ts ask "Should I take the later flight?" -i   # interactive mode
bun src/main.ts list
bun src/main.ts resolve <id> yes
bun src/main.ts score
bun src/main.ts doctor --live   # checks the real Jev API (needs a key)
bun test                        # 23 tests
```

With an OpenRouter key, the same commands use the real Jev model with no code
changes:

```bash
export OPENROUTER_API_KEY=sk-or-...
bun src/main.ts ask "Will this refactor break the build?" --for "..." --against "..."
```

## Tech stack

- **TypeScript on Bun.** Native TS, built-in test runner, zero dependencies.
  Written with erasable types only, so it also runs on Node 24+.
- **Decision-model integration.** Typed `noul` questions over the OpenRouter
  Decisions API, batched per turn, with a deterministic mock behind the same
  interface so the demo never needs a key.
- **Small, pure core.** Log-odds aggregation, Brier scoring, and calibration
  are dependency-free functions with unit tests; rendering is separated from
  logic; storage is plain JSON lines.

## Project structure

```
fate/
  src/
    main.ts      CLI: arg parsing and subcommands (ask, list, resolve, score, doctor)
    judge.ts     Judge interface: yes/no questions in, probabilities out
    mock.ts      deterministic offline judge (FNV-1a hash to probability)
    jev.ts       live Jev adapter via the OpenRouter Decisions API (key-gated)
    forecast.ts  factor model and log-odds aggregation (pure, tested)
    store.ts     JSONL prediction log under ~/.fate or $FATE_HOME
    score.ts     Brier score, skill, calibration buckets (pure, tested)
    ui.ts        8-ball art, meters, verdicts, tables (pure, no side effects)
  tests/         23 tests (bun test), runnable on Node too
  demo.sh        one-command full demo in a temp dir
```

## Design decisions and tradeoffs

- **Mock first, live model as a config change.** The deterministic judge is
  the default and the Jev adapter sits behind the same `Judge` interface.
  That makes the whole tool testable offline, and it mirrors how AI features
  actually get deployed: you build and demo against a stand-in before the
  customer can hand you credentials, then flip one environment variable.
- **Average the evidence, don't sum it.** Factors are combined in log-odds
  space and divided by total weight. Summing would let someone push any
  answer toward 0% or 100% just by listing more reasons. Averaging means a
  forecast moves because the evidence is strong, not because it is long.
- **State the independence assumption instead of hiding it.** Correlated
  factors will double count. Rather than pretend otherwise, the CLI prints
  every factor's contribution so you can see when two reasons are really
  one.
- **Score with a proper scoring rule.** Brier score rewards honest
  probabilities: you cannot game it by always saying 90% or always saying
  50%. Skill is reported against an always-50% baseline, so "good" has a
  concrete meaning.
- **One batched request per question.** All factors go to the model in a
  single call, which keeps latency and cost flat as the factor count grows.

## License

MIT. See LICENSE.
