# NOVA — Archive

Documents kept for the record, never for instruction.

Nothing here is authoritative. When an archived document and a live one
disagree, the live one wins — that is the whole point of moving a file here
instead of deleting it: the reasoning survives, the rules do not.

## What lands here

- **`superseded/`** — a document another one explicitly replaces. The
  replacement says so at the top; the file is kept only so old references and
  commit messages still make sense.
- **`session-reports/`** — dated snapshots of repository facts (branch, test
  count, measurements at a given moment). They are evidence of a past state,
  not a description of the current one: `docs/STATE.md` owns that.

## What does not land here

Live contracts (`docs/game/`, `docs/adr/`), the engineering docs the index
points at (`docs/ENGINEERING-INDEX.md`), and the step log (`docs/roadmap/`) —
the roadmap is a history of decisions that is still read while working, so it
stays where it is.

State the date in any file you archive. A document without a date cannot be
told apart from a current one a year later.
