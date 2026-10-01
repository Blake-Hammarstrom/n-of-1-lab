# N-of-1 Lab

**Does it actually work for you?** Run randomized, pre-registered experiments on yourself, privately, with an answer that's safe to check every day.

Project 02 of Blake's Second Brain. Spec: `docs/SPEC.md`.

## How it works
1. **Plan:** one change, one outcome, and the smallest difference that would matter. The planner sizes the trial by simulation.
2. **Randomize:** a seeded block crossover. Each block has one "with" and one "without" period, in random order. Starting **locks** the plan with a SHA-256 fingerprint.
3. **Log:** one number a day.
4. **Know:** days are averaged within each period (blocks are the independent unit). An exact randomization-based betting test then gives an **anytime-valid** confidence sequence, read against your smallest meaningful change.

**Private by architecture:**
- There's no server and no account.
- A Content-Security-Policy with `connect-src 'none'` means the app can't send data anywhere.
- Back up with Export/Import.

## Evidence (honest)
- **Method verification on synthetic data** (`reports/validation.md`, protocol `docs/VALIDATION_PROTOCOL.md`, fixed in advance):
  - **The engine:** false positives 1.1–1.5% in all 8 scenarios despite checking after every block, and its intervals keep covering the truth.
  - **For comparison:** a naive t-test checked after every block gives 22–28% false positives, and "30 days without, then 30 days with" gives up to 100% under a trend.
- **Real-world usefulness isn't established yet.** That's success criterion 6: a real experiment run by Blake.

## Commands
```bash
npm test          # engine + app tests (node:test, no dependencies)
npm run validate  # full Monte Carlo validation (~3 min) → reports/
npm run serve     # build + http://localhost:4174
```
