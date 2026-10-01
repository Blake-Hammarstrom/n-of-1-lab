# Method validation protocol: FIXED 2026-10-01, before the first validation run

**What this is:** a Monte Carlo verification of the *inference engine*, using simulated data.
- It's **method verification (evidence rung 2, synthetic)**: it shows the engine keeps its statistical promises under conditions it wasn't tuned on.
- It **does not** show that the product is useful, or that any real experiment's conclusion is right. That needs real use: success criterion 6 in `docs/SPEC.md`.

**Development/validation separation:**
- The engine's two settings (clip C = 1.5, bet sizes ±0.1…0.9) were chosen on 2026-10-01 from a comparison on **iid-normal data only** (seeds 1, 3, 7).
- Validation uses seed 20261001 + scenario index, and adds conditions not used in development.

## Pipeline under test
For each simulated experiment, the full product path runs:
1. Generate a randomized block crossover schedule (`makeSchedule`).
2. Generate **daily** outcomes under the scenario.
3. Average days within each period, then take block differences (`blockDiffs`).
4. Run the anytime-valid test (`bet`) **after every block** (continuous peeking, as a real user would), up to 30 blocks.

## Scenarios (daily noise SD ≈ 1 unless stated; 4,000 simulated experiments each)
| ID | Noise | Period |
|---|---|---|
| S1 | iid normal | 1 day |
| S2 | heavy tails: Student t, 3 df | 1 day |
| S3 | autocorrelated: AR(1) daily, ρ = 0.7 | 1 day |
| S4 | linear trend: +0.05 per day, plus iid normal | 1 day |
| S5 | skewed: centred lognormal(0, 0.8) | 1 day |
| S6 | coarse instrument: normal (SD 0.8) rounded to whole units | 1 day |
| S7 | iid normal | 3 days |
| S8 | AR(1) ρ = 0.7 | 3 days |

- **Null runs:** effect 0.
- **Effect runs:** a true additive effect of +0.7 on B days.

## Fixed criteria
| ID | Claim | Met | Not met |
|---|---|---|---|
| V1 | **False positives stay ≤ 5% despite daily peeking**: share of null runs that ever declare an effect | ≤ 0.0638 (= 0.05 + 2 MC SE) in **every** scenario | above 0.0638 in any scenario |
| V2 | **The confidence sequence covers the truth at every look**: share of effect runs whose interval ever excludes the true effect | ≤ 0.0638 in every scenario | above 0.0638 in any scenario |
| V3 | **The planner is honest about power**: its predicted power vs simulated power at its recommended length, for an effect of 0.7, with S7 (its own assumptions) and S2-noise with 3-day periods (heavier tails) | absolute gap ≤ 0.10 in both | gap > 0.10 in either |

**Reported, not criteria:**
- the power of each effect scenario at 30 blocks
- **Baseline B1:** a naive paired t-test re-run after every block (α = 0.05). It shows what peeking does to a classic test.
- **Baseline B2:** the observational "try it and see" design: 30 days without, then 30 days with, compared with a Welch t-test on daily values. It shows what trends and autocorrelation do without randomization, and what treating days as independent does.

**These rules don't change after the results are seen.** If a criterion fails, the result is reported and the engine is revised under a new, dated protocol version.

## Run history
- **Run 1 (2026-10-01):** V1–V3 met.
  - **Baseline B1's numbers were invalid.** The t-distribution code returned p-values that were too small (e.g. 0.18 for t = 1, df = 9, instead of 0.34), so the naive-peeking false-positive rate read 87%.
  - Fixed with a standard incomplete-beta continued fraction, and verified against reference values in `test/engine.test.mjs`.
  - **The engine was unaffected:** it doesn't use the t-distribution.
- **Run 2 (2026-10-01): the reported run** (`reports/validation.md`). The protocol and the engine are unchanged from Run 1. V1–V3 met.
