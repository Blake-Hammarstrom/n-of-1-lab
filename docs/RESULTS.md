# Reading a result screen

This guide describes what the result screen does today. It comes from `confidenceSequence` and `verdict` in `src/engine/stats.js`, `analyze` in `src/app/model.js`, and `VERDICT_COPY` and the stop prompt in `src/app/main.js`. It describes the code only. It makes no claim about how useful the results are.

## What the interval is

The interval is the effect of the B condition versus the A condition on your outcome.

- **One number per complete block.** For each block, the app averages your logged days within the A period and within the B period. The block's number is the B mean minus the A mean. Days are averaged first, so individual days are not treated as independent data points.
- **Positive means better.** If you said lower is better for the outcome, the sign is flipped before the interval is computed.
- **Only complete blocks count.** A block counts only if it has at least one logged value in both periods.
- **95% anytime-valid confidence sequence** (alpha 0.05). Checking after every block is safe. Looking early does not inflate the false-positive rate the way repeated ordinary tests would.
- **Constant additive effect.** The interval assumes the B condition shifts the outcome by the same amount in every block.

An interval can be open on one or both sides. An open side is shown as unbounded.

## The 8 verdicts

`MME` is the smallest meaningful change you set when you planned the experiment. The code checks the verdicts in this order, and the first one that matches is the verdict shown. "Lower" and "upper" are the ends of the interval.

| # | Label on screen | Rule | Message |
|---|---|---|---|
| 1 | Collecting data | Interval is open on both sides | Keep logging. No interval can appear before 8 complete blocks, and it often takes more. |
| 2 | Meaningful benefit | lower ≥ MME | The whole interval is beyond the smallest change you said would matter. You can stop here. |
| 3 | Meaningfully worse | upper ≤ −MME | The whole interval is worse than the smallest change that matters. You can stop here. |
| 4 | Helps, but maybe not enough to matter | lower > 0 | It helps, but the interval still includes changes too small to matter. |
| 5 | Worse, but maybe not enough to matter | upper < 0 | It's worse, but the interval still includes changes too small to matter. |
| 6 | No meaningful effect | lower > −MME and upper < MME (both strict) | Any effect is smaller than what you said would matter. You can stop here. |
| 7 | Inconclusive at the planned length | None of the above, and complete blocks ≥ planned blocks | The planned length is done and the evidence is still mixed. That's a real result: the effect, if any, is hard to see at this size. |
| 8 | Not enough evidence yet | None of the above, and complete blocks < planned blocks | Not decisive yet. Keep going: checking every day is safe with this method. |

Notes:

- With fewer than 8 complete blocks the interval is always open on both sides, so the verdict is always Collecting data. It can stay that way longer.
- An interval with only one open side still gets a verdict. For example, a lower bound above 0 with no upper bound is "Helps, but maybe not enough to matter".

## Worked examples

These use MME = 1 and 8 planned blocks.

| Interval | Complete blocks | Verdict | Why |
|---|---|---|---|
| 1 to 3 | any | Meaningful benefit | The lower bound equals the MME, and the boundary counts. |
| 0.99 to 3 | any | Helps, but maybe not enough to matter | The lower bound is above 0 but below the MME. |
| 0.5 to open-ended | any | Helps, but maybe not enough to matter | A one-sided interval still gives a verdict. |
| −0.5 to 0.8 | any | No meaningful effect | The lower bound is above −1 and the upper bound is below 1. |
| 0 to 0.5 | any | No meaningful effect | The lower bound is not above 0, so it is not "Helps". It is inside ±1. |
| −0.5 to 1 | 4 | Not enough evidence yet | The upper bound reaches the MME, so it is not "No meaningful effect". Fewer than 8 blocks are done. |
| −0.5 to 1 | 8 | Inconclusive at the planned length | Same interval, but the planned 8 blocks are complete. |
| −3 to −1 | any | Meaningfully worse | The upper bound is at or below −MME. |
| −3 to −0.2 | any | Worse, but maybe not enough to matter | The upper bound is below 0 but above −MME. |

## Stopping

The decisive verdicts are **Meaningful benefit**, **Meaningfully worse** and **No meaningful effect**. Their messages say you can stop here.

You can stop at any other time too. If the verdict is not decisive, the app asks "Stop before the evidence is decisive? This is recorded. Why?" If it is decisive, it asks you to note why, and a note is optional. Cancelling the prompt does not stop the experiment.

Stopping records these with the experiment: the stop time, your reason, whether the result was decisive, and the verdict.

## What not to conclude

- **Helps, but maybe not enough to matter** is not evidence of a meaningful benefit. The interval still includes changes smaller than the MME.
- **No meaningful effect** does not mean the effect is exactly zero. It means the effect is smaller than the MME.
- **Inconclusive at the planned length** is a real result: any effect is hard to see at this size. It is not proof of no effect.
- A result applies to one person under the conditions tested.
- The built-in sample result is simulated data. The screen labels it "Sample result · simulated data, not a real person's experiment".
