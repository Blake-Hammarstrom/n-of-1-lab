# Logging days

How to log days in an experiment, and what the app does with what you log. This describes the current behavior of `logValue` and `analyze` in `src/app/model.js` and the today card, Missing days list and stats in `src/app/main.js`. For reading the result itself, see [RESULTS.md](RESULTS.md).

## What followed means (read this first)

**The "I followed today's assignment" checkbox does not change the result.**

Every logged value counts in the analysis as the day's *assigned* condition, whether or not you followed it. This is an intention-to-treat analysis: you are comparing the conditions you were assigned, not the ones you actually did.

Measured on current code: an experiment with every day logged and a B minus A difference of 3 gives the same estimate, 3, whether all days are marked followed or none are.

Followed only feeds two things:

- **The followed assignment percentage:** followed days divided by logged days. For example, 1 of 2 logged days followed shows 50%. With nothing logged it shows a dash.
- **The faded, unfilled dots** on the Every day chart (days saved as not followed).

So be honest on the checkbox. It costs you nothing in the analysis, and it tells you how closely you kept to the plan.

## What can be logged

- One number per scheduled day.
- A blank, missing or non-numeric value is refused with `Enter a number.`
- A day outside the schedule is refused with `That day isn't part of the experiment.`
- A stopped experiment refuses logging with `This experiment is no longer running.`
- Logging the same day again **replaces** the earlier value (and its followed setting).
- "Today" is your device's local date.

## The today card

What the card at the top of an experiment shows depends on where you are in the schedule:

- **Before the start date:** the start date and the condition of your first period.
- **During the experiment:** today's block number (for example "block 2 of 4") and today's condition, a value field, and an **I followed today's assignment** checkbox. The checkbox is ticked unless today's entry was saved unticked. The button reads **Log today**, or **Update** if today already has a value.
- **After the planned end:** it says the planned length is complete and to log any missing days.
- **Stopped experiments** show a short message instead of the form (for example "This experiment is stopped.").

The built-in sample is read-only: it has no today card, no Missing days list and no logging.

## Missing days

Missing days are past scheduled days with no value, not counting today. Of these, the most recent 7 are shown as buttons, labelled with the date.

- Tapping one asks for the value.
- Cancelling, or leaving it blank, does nothing.
- A value logged this way is **always recorded as followed**. There is no checkbox here, so if you did not follow the assignment that day, this route can't record it.
- Entering something that isn't a number shows the `Enter a number.` message.

The app only offers today and past missing days, never future days. If more than 7 days are missing, the older ones have no button. They are still counted in the days logged stat and are simply left out of the analysis.

## Missing values in the analysis

- Days without a value are left out. They are not filled in or guessed.
- A block counts only when both of its periods have at least one value. A block missing one whole period is skipped (it shows a dash in Block by block). See [RESULTS.md](RESULTS.md) for how counted blocks become the interval.
- The **days logged** stat shows logged past days out of past scheduled days, for example `12/14`. Future days are not in the denominator.

## Notes

Entries can hold a note of up to 280 characters (longer text is cut off), and the CSV export includes it in a `note` column. The current screens have no field to enter one, so notes are empty for anything logged in the app.

## Quick reference

| You do | Result |
| --- | --- |
| Log a number for today | Saved with your followed setting |
| Log today again | Replaces the earlier value |
| Leave the value blank | `Enter a number.` |
| Log a day before the start or after the end | `That day isn't part of the experiment.` |
| Log after stopping | `This experiment is no longer running.` |
| Tap a Missing days button and enter a number | Saved as followed |
| Tick or untick followed | Changes only the followed % and chart dots, never the estimate |
