# Randomization and the Pre-registration Lock

This page explains how the schedule of "with" and "without" days is randomized, and what the pre-registration lock does and does not protect. It describes what the app does today.

## The schedule

The experiment is a run of **blocks**. Each block has exactly one A period and one B period, in random order. A and B are your two conditions (the form's first and second condition names).

- Every period lasts the planned number of days.
- Periods run back to back from the start date, with no gaps.
- So the experiment lasts **blocks × 2 × period length** days.

Worked example: seed `seed26`, 4 blocks, 3-day periods, starting 2026-10-01.

| Block | First period | Second period |
|---|---|---|
| 1 | B 10-01 to 10-03 | A 10-04 to 10-06 |
| 2 | B 10-07 to 10-09 | A 10-10 to 10-12 |
| 3 | A 10-13 to 10-15 | B 10-16 to 10-18 |
| 4 | A 10-19 to 10-21 | B 10-22 to 10-24 |

That is 4 × 2 × 3 = 24 days.

## The randomness

The order in each block comes from a seeded random number generator (`makeSchedule` in `src/engine/schedule.js`, `rng` and `hashString` in `src/engine/rng.js`):

1. The seed text is turned into a number with an FNV-1a hash.
2. That number starts a mulberry32 generator.
3. For each block, one draw is made. If it is below 0.5, A goes first; otherwise B goes first.

The same seed always gives the same schedule. For example, seed `other` always gives the order B A, A B, B A, A B.

**Where the seed comes from.** The form has no seed field. The seed defaults to the experiment's id, which the app does not show. Each experiment therefore gets its own schedule, and the seed is stored in the locked plan.

**Is it fair?** Over 10,000 different seeds, A came first in the first block 4,942 times, about half.

**Why randomize.** Trends and moods drift over weeks. If the order were fixed (say, all A then all B), a drift could look like an effect of the condition. With a random order inside each block, drift is as likely to help one condition as the other. The analysis compares the two periods inside each block, so each comparison is between neighbouring periods. See [RESULTS.md](RESULTS.md).

## What the lock covers

Pressing **Lock plan & start** hashes the plan with SHA-256. The input is a canonical JSON (keys sorted, so the same plan always gives the same text) of exactly these fields:

- the question
- both condition labels
- the outcome's name, unit, better direction (higher or lower) and resolution
- the smallest meaningful change
- the expected daily spread
- period length
- planned blocks
- alpha (always 0.05)
- start date
- seed

Text fields are trimmed first, so extra spaces at the ends do not change the fingerprint.

The **Pre-registration** card on the experiment page shows:

- the lock time, to the minute, in UTC;
- the first 16 characters of the fingerprint;
- the result of a check, redone every time the page is viewed: either **plan unchanged since locking** or **plan was edited after locking**.

The check rehashes the stored plan and compares it with the stored fingerprint. In testing, changing the smallest meaningful change, the planned blocks, the seed, a condition label or the start date each made the check fail.

For the check that runs when you import a backup, see [DATA.md](DATA.md) instead of repeating it here.

## What the lock does not cover

- **Logged values, the followed setting and notes.** These are meant to change as you log.
- **The status and the stop record.** Stopping an experiment is not an edit to the plan.
- **The lock time itself.** The same plan locked at a different time gives the same fingerprint (measured). The form says the plan is locked "with a timestamped fingerprint". That means the plan records when it was locked, not that the time is inside the hash. Anyone with access to the stored data could change the lock time without the check noticing.

Logging days and stopping both leave the card showing **plan unchanged since locking**.

There is no screen to edit a locked plan. To change the plan, stop the experiment and start a new one.

## The built-in sample

The sample experiment is **simulated data**. It has its own fixed seed, `sample-putting`, and the app labels it as simulated. It is never presented as a real experiment.
