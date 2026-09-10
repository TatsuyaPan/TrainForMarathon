# Training Session Web Design

## Goal

Complete the Web experience for the `TrainingSession` lifecycle while preserving the core repository as an independent, open-source Git repository. A plan day may contain zero or more training sessions, and each session may contain at most one completed training record.

## Repository Boundary

- `D:\GitBook\TrainForMarathon` is the read-only source for the one-time synchronization.
- All synchronization, implementation, testing, and future edits happen under `D:\GitBook\train-for-marathon-wapp`.
- `D:\GitBook\train-for-marathon-wapp\core` remains a Git submodule and the working checkout of the independent public core repository.
- The Web application remains inside that public repository at `core/web`.
- The parent private repository tracks the resulting core commit by updating only its submodule pointer, plus any necessary repository documentation. Existing uncommitted mini-program changes are not included in this work.

## Domain Relationships

```text
PlanDay 1 ---- 0..N TrainingSession
TrainingSession 1 ---- 0..1 TrainingRecord (logical concept)
```

The training record remains embedded in `TrainingSession` through `actualWorkout`, `actualDistanceKm`, `actualDurationMinutes`, `actualRpe`, `log`, and `finishedAt`; no separate collection is introduced.

- `planned`: the training exists and has no completed record.
- `done`: the training was performed and owns one record.
- `skipped`: the training was not performed and owns no record.
- Editing a completed training overwrites the same embedded record.
- Multiple trainings on one day are represented by multiple sessions, never by multiple records on one session.

## Daily Progress Aggregation

Calendar and weekly statistics require one aggregate status per plan day. Sessions are grouped by `dayId` before conversion to progress records.

- All sessions are `done`: `completed`.
- All sessions are `skipped`: `skipped`.
- Terminal states are mixed, or any terminal session coexists with a `planned` session: `partial`.
- All sessions remain `planned`: no progress record.
- No sessions exist: no progress record.

The aggregate distance and duration are sums of completed sessions only. The aggregate timestamp is the most recent session update or finish time. Session-derived progress continues to take precedence over legacy progress for the same day.

## Web Information Architecture

### Training day

`TrainingDay.vue` renders zero or more session cards in ascending `seq` order.

- `planned`: offers **Record and finish** and **Not performed**.
- `done`: offers **View or edit record**.
- `skipped`: offers **Change to completed**.
- **Add training** creates another `planned` session for the same day.
- A rest day starts with zero sessions but may receive an extra session.

The page delegates lifecycle transitions to core workflow functions. It does not directly construct status transitions or write session documents.

### Session record

A dedicated `SessionRecord.vue` route owns the unique record form for one session.

- On first entry, `actualWorkout` is initialized as a deep copy of `plannedWorkout` when a plan exists.
- The default mode is **Completed as planned**.
- The runner may switch to **Adjust actual content** and edit a structured Workout with the visual editor.
- Distance, duration, RPE, and training log are edited on the same page.
- Saving calls `completeSession`, changes the session to `done`, and returns to the training day.
- Opening a `done` session restores and updates its existing unique record.
- A session without planned content may still be completed with metrics and/or a log; structured actual content is optional, matching the core model.

The form model itself is platform-neutral and lives in core (`packages/core/src/session-record.ts`): `createSessionRecordForm` initializes or restores the record, `toCompleteSessionInput` validates and normalizes it into the completion payload, `resetActualWorkoutToPlan` returns to "completed as planned". `SessionRecord.vue` only renders that model, so the mini program can reuse the same rules without copying them.

### Shared workout editor

The reusable workout composition UI is extracted into `WorkoutEditorPanel.vue`. Both the existing plan editor and the session record page use it so that runners never need to enter the internal Workout DSL. DSL import/export remains an advanced function of the plan editor and is not the primary record input.

### Plan adjustment

Running life is not static: the same training day sometimes has to move. The training day page exposes **调整课表**, offering two operations and never guessing silently.

- **Swap with another day of the same week** — training content (label, items, structured Workout, planned distance/duration) moves to the other day. Dates and day identifiers stay in place, so an existing record never changes its date.
- **Adopt a declared alternative** — the day's items switch to the alternative, and the structured Workout is rebuilt for the runner's current volume tier (same `buildDayWorkout` context used at instantiation). Alternatives carry no Workout themselves, so a stale one is dropped instead of kept.

Rules enforced in core (`swapTrainingDays` / `applyDayAlternative`):

| Situation | Behaviour |
| --- | --- |
| The day already has `done` / `skipped` sessions | Adjustment is refused with a readable reason and the stored plan is untouched |
| The day becomes a rest day | Its plan-slot session is deleted; extra sessions the runner added stay |
| The day is (still) a training day | The plan-slot session is synced to the new content; finished sessions are never rewritten |
| A rest day | Never carries a structured Workout — asserted by the browser smoke test |

Sessions therefore carry an explicit origin: `plan` (the slot that follows the plan) or `extra` (something the runner added, including on a rest day). `sessionOrigin()` infers the value for legacy rows from the sequence, and `isPlanSlotSession()` is the single rule shared by core, Web, and the future mini program: only plan slots are protected from removal and follow plan edits.

## Data Flow

```text
TrainingDay
  -> ensureDaySessions / addExtraSession / skipSession
  -> SessionRecord route
       -> createSessionRecordForm (core): initialize from the unique record or planned workout
       -> optional visual Workout adjustment
       -> toCompleteSessionInput (core): validate and normalize record fields
       -> completeSession
       -> TrainingDay reloads sessions and daily aggregate progress
```

Errors leave the runner on the current page and display a clear message. Missing plans, days, or sessions do not create replacement data implicitly. Workout validation runs only when structured actual content is present. Distance and duration must be positive when supplied, and RPE must be an integer from 1 through 10.

## Testing

Implementation follows test-driven development.

- Core tests cover daily aggregation for all-completed, all-skipped, mixed terminal states, terminal plus planned, all-planned, totals, and legacy precedence.
- Pure Web form-state tests cover deep-copy initialization, an unplanned extra session, editing an existing record, input normalization, and validation failures.
- Web component tests cover zero-to-many session cards, status-specific actions, extra-session creation, record-page defaults, completion, return navigation, and refresh.
- Final verification runs the complete core test suite, type checking, Web tests, the Web production build, and one browser-based lifecycle smoke test.

## Scope Exclusions

- No mini-program lifecycle UI is implemented in this phase.
- No separate `TrainingRecord` collection is added.
- No history of edits to a completed record is stored.
- No changes are made in `D:\GitBook\TrainForMarathon`.
