# Planning an experiment

A plain-language guide to the **Design an experiment** form and the planner behind it. It describes what the code does today (`src/engine/planner.js`, the form in `src/app/main.js`, `validateProtocol` in `src/app/model.js`). To read the result screen afterwards, see `docs/RESULTS.md`.

## The inputs and their limits

| Input | What it is | Limit |
|---|---|---|
| Smallest change that would matter to you (MME) | The smallest difference you would care about | Above 0 |
| How much it varies day to day (typical spread) | Day-to-day spread of your outcome | Above 0 |
| Smallest step your measure shows | Resolution of your instrument (e.g. 1 for whole numbers) | Optional |
| Period length | Days in each "with" or "without" period | Choose 1, 2, 3 or 7 days |
| Start date | First day of the experiment | Required |
| Planned blocks | One block = one "with" and one "without" period | Whole number, 4 to 60 |

The form hints at the spread like this: think of a typical week; about half the days fall within plus or minus this amount of your average.

`validateProtocol` enforces the same rules when you start (it also accepts any period length from 1 to 14 days, but the form offers only 1, 2, 3 and 7).

## How the planner models noise

Each block gives one difference between the two period averages. The planner treats days as independent, so the spread of that difference is

    sqrt(2) × daily spread / sqrt(period length)

For example, a daily spread of 6 with 3-day periods gives about 4.90. Longer periods average away more noise.

## How power is estimated

"Power" is the chance the experiment detects a real change of the MME.

- The planner simulates experiments in which each block difference is normal noise around a true effect equal to the MME.
- Each simulated experiment is analysed with the same anytime-valid betting test the app uses on real data, checked after every block, at alpha 0.05.
- Power is the share of simulations that reject "no effect".
- The form runs 300 simulations with a fixed seed, so the same inputs always give the same answer.

The recommendation is the smallest **even** number of blocks from 4 to 40 that reaches at least 80% power. It is shown as **Recommended: N blocks**, with the total days (N × 2 × period length) and a **Use N** button that fills in the planned blocks.

If even 40 blocks fall short, the form says the change is hard to detect and shows the power at 40 blocks. The form also shows the chance for the number of blocks you entered.

## Worked examples (300 simulations)

| MME | Spread | Period | Result |
|---|---|---|---|
| 1 | 1 | 3 days | 16 blocks, 96 days, power 0.81 |
| 3 | 6 | 7 days | 22 blocks, 308 days |
| 3 | 6 | 3 days (the form's placeholder values) | Hard to detect: about 72% at 40 blocks |

## The resolution check

When you give a smallest step, the form warns if the MME is less than twice the step. It suggests averaging several readings per period or using a finer measure.

- Step 1, MME 1.9: warns.
- Step 1, MME 2: no warning.
- Step 2, MME 3: warns.

With no step there is no check.

## Known limitation: short plans

No interval can appear before 8 complete blocks (see `docs/RESULTS.md`). So:

- A plan of 4 to 7 blocks can never produce a result.
- A plan of 8 to 10 blocks often will not.
- An experiment like that, once it reaches its planned length, keeps showing **Collecting data**. It never shows **Inconclusive** at the planned length.

Measured on the current code (found 2026-10-14): with 1-day periods, every day logged and a perfectly consistent effect of 3 against an MME of 1, 4-block and 8-block plans end on Collecting data, while a 12-block plan ends on Meaningful benefit.

The planner itself reports 0 power below 10 blocks in that kind of case. With MME 1, spread 1 and 7-day periods: 0 at 4, 6, 7 and 8 blocks, 0.15 at 10, 0.73 at 12. So follow its recommendation rather than choosing a short plan.

Whether to change the allowed block range (the form and `validateProtocol` accept 4 to 60) or the verdict rule is an open owner decision. It is not changed here.

## Assumptions and checks

The planner assumes normal, independent days. Real data may have heavier tails and day-to-day carry-over (autocorrelation). The validation suite checks this: criterion V3 in `docs/VALIDATION_PROTOCOL.md` requires the planner's predicted power to be within 0.10 of simulated power (gap at most 0.10), including under heavier tails. For the outcome, see that file and `reports/validation.md`.

The real analysis averages each period first, so it does not treat days as independent.
