# Data Storage and Transfer

N-of-1 Lab is local-first: experiments live in this browser's localStorage and never leave the device except when you explicitly export them.

## Storage location

All experiments are stored under a single localStorage key: `n1lab.experiments.v1`. The data stays on this device and is never transmitted to a server.

## Export format

When you export experiments, the app creates a JSON document with four fields:

- **`app`**: Always `"n-of-1-lab"`, used to identify exports from this application
- **`schema`**: The current schema version (presently `1`)
- **`exportedAt`**: ISO 8601 timestamp of the export
- **`experiments`**: Array of experiment objects (each with `protocol`, `prereg`, `entries`, and other fields)

Example export:
```json
{
  "app": "n-of-1-lab",
  "schema": 1,
  "exportedAt": "2026-10-14T15:30:00.000Z",
  "experiments": [...]
}
```

## Import validation and tamper checks

When you import an export file, the app validates it in this order:

1. **App marker**: The document must have `app === "n-of-1-lab"` and `experiments` must be an array. If not, the import is rejected with "Not an N-of-1 Lab export."

2. **Experiment completeness**: Every experiment must have a `protocol` object, a `prereg` object, and an `entries` object (even if empty). If any experiment lacks these, the import is rejected with "An experiment in the file is incomplete."

3. **Pre-registration hash**: For each experiment, the app recomputes `SHA-256(canonical(protocol))` and compares it with the stored hash in `prereg.hash`. If the hashes don't match, the import is rejected with an error message naming the question: `"[question]" was edited after it was pre-registered.`

## What the tamper check covers

The pre-registration hash validation covers only the **protocol** — the question, condition labels, outcome definition, smallest meaningful effect, variability estimate, period length, block count, and other experiment parameters. It does not cover the `entries` object (logged values, notes, and metadata). Logged entries cannot be tamper-detected because they are always added after the protocol is locked.

## Importing an experiment with an existing ID

If you import an experiment whose ID already exists locally, the imported version **replaces** the local one entirely, including all logged entries. This applies even if the local experiment has more recent data.

Example: if you have a running experiment `e-abc123` locally with 50 logged days, and you import a backup that contains `e-abc123` with only 20 logged days, the local experiment is overwritten and you keep only the 20 imported days.
