# Project 02: N-of-1 Lab. Specification (Project Engine, 2026-10-01)

## The real problem
**People change their routines all the time hoping they'll help:**
- caffeine timing and sleep
- a warm-up and golf scores
- a study method and quiz results
- a supplement and energy

**Then they judge the change by feel, or with a before/after comparison.**
- **That comparison is confounded by trends, seasons, moods and regression to the mean.** Validation run 2: "try it for 30 days, then compare" declared a nonexistent effect in 100% of simulated experiments with a gentle trend, and in about 41% with ordinary day-to-day autocorrelation.
- **Tracking apps make it worse:** they show correlations in observational data.
- **The method that answers "does it work *for me*?" already exists:** the randomized n-of-1 trial, used in clinical research. Ordinary people almost never get access to it.

**N-of-1 Lab gives anyone that method in a calm, private app:**
1. plan
2. randomize
3. log one number a day
4. know whether the change works for you, **with honest uncertainty, and safe to check every day**

## Target user
- **People optimizing something personal and measurable:** athletes (golf, running), students, people with sleep or energy questions, and quantified-self users.
- **Blake** is a golfer and a student with questions of exactly this shape: does a putting warm-up lower putts per round? does retrieval practice beat rereading?

## Why it matters
Bad personal decisions come from mistaking noise for effect. A randomized, pre-registered personal trial is the cheapest way to replace "I think it helps" with evidence, or with an honest "this can't be told apart from noise".

## Why the Second Brain selected it (assessment 2026-10-01)
- **Rank 2 gap:** [[Experiment vs Observational Analysis]] (score 11). Never exercised in Blake's own work, and listed as not demonstrated in three projects. **311 doesn't touch it.**
- **Unaddressed draft frameworks and concepts** this project *forces*:
  - [[Choosing an Experimental Design]] (rank 8)
  - [[Reading an Experiment Result]]
  - [[Effect Size]] (rank 9)
  - [[Statistical Power]]
  - [[Measurement System Analysis]]
  - the [[Pseudoreplication]] failure pattern
- **Home "Currently learning":** *"Statistical inference and experimental design"* is an active skill gap, with about ten misreadings across interview sessions.
- **North Star "recurring across projects":** *real users with measured outcomes* (missing in all five personal projects), and *causal measurement of impact*.
- **Ranks 1 and 3–6 aren't re-targeted.** 311 targets them and is still collecting live evidence. Its capabilities are **not** treated as demonstrated.

## How it advances beyond existing projects
| | Existing portfolio (incl. 311) | N-of-1 Lab |
|---|---|---|
| Question type | prediction, ranking, forecasting | **causal**: did *this change* cause *that outcome* |
| Validity source | held-out data, backtests | **design-based**: randomization makes the test exact |
| Peeking | one-shot or fixed-horizon evaluation | **anytime-valid** inference (test-by-betting, Ville's inequality) |
| Independence | rows treated as samples | an explicit **unit of analysis** (block), days aggregated |
| Evidence | synthetic or offline only | **a real user with measured outcomes** (Blake), plus labelled method verification |
| Architecture | server, pipelines, models | **local-first**: privacy enforced by the Content-Security-Policy |
| Product | reports, internal tools | a consumer product with onboarding, planning and a decision UI |

## Frameworks exercised, and the decision each one forces
| Framework / concept | Decision the project can't avoid |
|---|---|
| [[Experiment vs Observational Analysis]] | Randomize, not before/after; show why (baseline B2) |
| [[Choosing an Experimental Design]] | Block crossover; period length (carryover); randomized order; roles of variables |
| [[Pseudoreplication]] | The block is the independent unit; days are averaged within a period |
| [[Statistical Power]] / [[Effect Size]] | The user states the smallest meaningful change; the planner sizes the trial by simulation |
| [[Reading an Experiment Result]] | Verdicts against the meaningful-change zone, including "no meaningful effect" and "inconclusive" |
| [[Measurement System Analysis]] | Resolution check: can the instrument see the effect? |
| [[Choosing Validation Evidence for a Model]] | Simulation is method verification (rung 2); real use is the applied evidence |

**Failure modes addressed:**
- peeking inflation (B1: 22–28% false positives for a naive t-test)
- confounding by trend or autocorrelation (B2)
- pseudoreplication
- post-hoc rule changes (hash-locked pre-registration; import rejects tampering)
- underpowered "nothing happened" conclusions (the planner, plus an explicit "inconclusive")
- an instrument too coarse to resolve the effect
- [[Synthetic Validation Overclaim]] (simulation is labelled as method verification only)

## Architecture (simplest that works)
```
[D] Plan → [D] seeded block-crossover schedule → [D] daily log (browser storage)
  → [D] period means → block differences → [D] anytime-valid betting test + confidence sequence
  → [D] verdict vs the smallest meaningful change → UI
```
- **Everything is deterministic** given the data. There's no model to train and no LLM.
- **Probabilistic only:** the randomization (by design) and the planner's Monte Carlo.
- **Stack:** static ES modules with zero dependencies; SVG charts; CSP `connect-src 'none'`. Hosted as a Render static site at $0.

## Data strategy
- **Real data:** only what the user logs, kept on their device. Export/import is a JSON file, and a pre-registration hash is verified on import.
- **No server, no accounts, no analytics.**
- **Simulated data appears in two places only, both labelled:**
  - the validation suite
  - the sample experiment ("simulated data" banner)

## Evaluation strategy, baselines, validation
- **Method verification** (`docs/VALIDATION_PROTOCOL.md`, fixed before running): 8 scenarios × 4,000 simulated experiments, with criteria V1–V3.
  - **Baselines:** B1, a naive t-test with peeking; B2, an observational before/after comparison.
  - **Run 2:** V1, V2 and V3 all met. The engine's false positives were 1.1–1.5% in every scenario.
- **Engineering:** unit tests for the schedule, the pseudoreplication guard, validity, intervals, verdicts, reference t values, the planner, the pre-registration lock, round-trip and tamper rejection, and privacy (no network APIs plus a CSP check).
- **Applied evidence** (the real test): Blake runs real pre-registered experiments.

## Production considerations, monitoring, security and privacy
- **Production:** static hosting with auto-deploy on push, and CI on every push (tests plus a reduced validation run).
- **Monitoring:**
  - There's no server telemetry by design. That's a privacy choice, and the cost is that real-world usage can't be observed except through Blake's own experiments.
  - Correctness is monitored by CI re-validation on every change.
- **Security and privacy:**
  - No third-party requests.
  - A CSP blocks all connections.
  - All user text is escaped.
  - Data lives in localStorage only. Losing the browser's data loses the experiments, which is why backup export exists.

## Success criteria (fixed 2026-10-01)
| # | Criterion | Met | Not met | Evidence tier |
|---|---|---|---|---|
| 1 | Method validity: V1–V3 in `docs/VALIDATION_PROTOCOL.md` | all met | any not met | method verification, rung 2 |
| 2 | Privacy by architecture | CSP `connect-src 'none'`, no network APIs in the source (tests), no third-party requests on the deployed site | any violation | engineering |
| 3 | Integrity | the pre-registration hash is verified, and tampering is rejected on import (tests) | — | engineering |
| 4 | Product flow verified on the deployed site at desktop and mobile widths: plan → lock → assignment → log → result | verified and recorded | not verified | engineering |
| 5 | Product quality: no horizontal overflow at 375 px; keyboard-reachable controls; labelled inputs; text contrast at least 4.5:1 | all | any | engineering |
| 6 | **Real use:** Blake completes at least one real pre-registered experiment to its planned end, or to a decisive early stop, and records the verdict in the vault, whatever the result | done | not done within 8 weeks of start | **applied** |
| 7 | **A second real experiment** with a different outcome type, to check the method holds for something other than the first case | done | — | applied (stretch) |

**Validation status:** the project is `validated` only when criteria 1–6 are met. Criterion 6 can't be met by building or deploying.

## Evidence target and complexity
- **Complexity level: L3.** A validated method with honest uncertainty and criteria fixed in advance, delivered as a product.
- The ladder allows the current level here, because the project closes a high-ranked gap that L3 left open.
- **Evidence target:**
  - method verification (rung 2), labelled as such
  - applied personal use (real data, n = 1 person)
- **No population or usefulness claims beyond Blake.**

## Scope cuts
- **Not included:**
  - accounts, sync and a server
  - multiple arms and multiple primary outcomes
  - binary or ordinal-only outcomes (numeric only)
  - modelling carryover (handled by period length plus guidance)
  - reminders and notifications
  - wearable integrations
  - pooling across users
  - an LLM
- **Stretch:** reminders via a calendar (.ics) export; a washout-day option; CSV export.

## Definition of done
1. Criteria 1–5 are met and recorded.
2. It's deployed and verified on Render.
3. It's registered in the portfolio with its real status.
4. Criterion 6 is met with a real experiment, and its result is in the vault.
5. A retrospective is written into the Second Brain:
   - lessons
   - framework evidence lines (`applied` only where genuinely exercised)
   - new gaps
