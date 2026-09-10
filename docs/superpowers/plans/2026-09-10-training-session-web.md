# Training Session Web Implementation Plan

> **状态（2026-09-11 核对）：已实施。** 七项任务全部完成：core 日聚合、纯函数记录表单模型、
> 可复用可视化编排面板、独立训练记录页、训练日会话生命周期界面、文档与父仓库指针更新。
> 验收见 `packages/core/test/sessions.test.ts`、`web/test/SessionRecord.test.js`、
> `web/test/TrainingDay.test.js` 与 `web/test/e2e_session_lifecycle.py`。
> 下方步骤清单保留当时的执行顺序，未逐项勾选。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Web training-day lifecycle where one plan day owns zero or more sessions and each completed session owns one editable actual-training record.

**Architecture:** Keep lifecycle and daily aggregation in the platform-independent core workflow. Keep Web record-form conversion in a pure helper, reuse the visual Workout editor, and route each session to a dedicated record page. Work only in the `train-for-marathon-wapp/core` submodule checkout, then update the parent repository's submodule pointer without touching mini-program changes.

**Tech Stack:** TypeScript, Vitest, Vue 3, Vue Router, TDesign Vue Next, Vue Test Utils, happy-dom, Vite.

---

## File Map

- Modify `packages/core/src/workflow.ts`: aggregate many sessions into one daily progress record.
- Modify `packages/core/test/sessions.test.ts`: specify daily aggregation and legacy precedence.
- Modify `web/package.json`: add Web test command and component-test dependencies.
- Create `web/vitest.config.js`: run Web unit/component tests in happy-dom.
- Create `web/src/session-record-form.js`: initialize, validate, and normalize the unique embedded record.
- Create `web/test/session-record-form.test.js`: test record form conversion without UI coupling.
- Create `web/src/views/WorkoutEditorPanel.vue`: reusable structured Workout composition panel.
- Modify `web/src/views/EditWorkout.vue`: consume the shared editor panel.
- Create `web/src/views/SessionRecord.vue`: dedicated actual-training record page.
- Create `web/test/SessionRecord.test.js`: test first-record defaults, editing, validation, save, and navigation.
- Modify `web/src/views/TrainingDay.vue`: render lifecycle cards and route record actions.
- Create `web/test/TrainingDay.test.js`: test zero-to-many cards and status-specific operations.
- Modify `web/src/router.js`: register the session-record route.
- Modify `README.md`: document the session lifecycle and Web commands.
- Modify parent `README.md`: state that future public core/Web work is performed through the `core` submodule checkout.

### Task 1: Synchronize the Approved Core and Web Baseline

**Files:**
- Copy from read-only source: `D:\GitBook\TrainForMarathon\packages`
- Copy from read-only source: `D:\GitBook\TrainForMarathon\scripts`
- Copy from read-only source: `D:\GitBook\TrainForMarathon\web`
- Copy from read-only source: root `package.json`, `package-lock.json`, `tsconfig.json`, and `.gitignore`
- Preserve: `D:\GitBook\train-for-marathon-wapp\core\.git`
- Preserve user changes: the already staged image rename and modified citation README

- [ ] **Step 1: Record both working trees before synchronization**

Run:

```powershell
git -C D:\GitBook\TrainForMarathon status --short -- packages scripts web package.json package-lock.json tsconfig.json .gitignore
git -C D:\GitBook\train-for-marathon-wapp\core status --short
```

Expected: the source lists the completed uncommitted core/Web work; the destination lists the pre-existing generated content, image rename, and citation changes plus this plan.

- [ ] **Step 2: Copy only the approved baseline paths**

Use PowerShell `Copy-Item -LiteralPath ... -Destination ... -Recurse -Force` for the listed paths. Do not copy `.git`, `node_modules`, `dist`, `ebook`, or files under the parent `wapp` directory.

- [ ] **Step 3: Verify repository boundaries and baseline availability**

Run:

```powershell
git status --short
Test-Path web\src\views\TrainingDay.vue
Test-Path packages\core\test\sessions.test.ts
git -C D:\GitBook\TrainForMarathon status --short -- packages web
```

Expected: the destination contains the synchronized files; the source status is unchanged; the pre-existing destination changes remain present.

- [ ] **Step 4: Run the synchronized core baseline**

Run: `npm test`

Expected: 104 tests pass before the aggregation correction begins.

- [ ] **Step 5: Commit only the synchronized baseline paths**

```powershell
git add packages scripts web package.json package-lock.json tsconfig.json .gitignore
git diff --cached --stat
git commit -m "feat: synchronize core and web baseline"
```

Expected: the completed core/Web baseline is committed. The pre-existing `src/image` rename and `src/md/5-引用说明/README.md` change remain outside this commit.

### Task 2: Aggregate Multiple Sessions Per Day in Core

**Files:**
- Modify: `packages/core/test/sessions.test.ts`
- Modify: `packages/core/src/workflow.ts`

- [ ] **Step 1: Write failing daily aggregation tests**

Add tests that call `sessionsToProgress` with explicit sessions and assert:

```ts
expect(sessionsToProgress([done0, done1])).toEqual([
  expect.objectContaining({ dayId: "day-1", status: "completed", actualDistanceKm: 15 }),
]);
expect(sessionsToProgress([skipped0, skipped1])[0].status).toBe("skipped");
expect(sessionsToProgress([done0, skipped1])[0].status).toBe("partial");
expect(sessionsToProgress([done0, planned1])[0].status).toBe("partial");
expect(sessionsToProgress([planned0])).toEqual([]);
```

Also assert durations sum only `done` sessions and the newest finish/update timestamp wins.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- packages/core/test/sessions.test.ts`

Expected: failures show duplicate records or last-session overwrite behavior, proving the aggregation requirement is not implemented.

- [ ] **Step 3: Implement one record per day**

Change `sessionsToProgress` to group by `dayId`, derive one status, sum completed metrics, and choose the latest timestamp. Keep all-planned groups out of the result.

```ts
export function sessionsToProgress(sessions: readonly TrainingSession[]): ProgressRecord[] {
  const byDay = new Map<string, TrainingSession[]>();
  for (const session of sessions) {
    const group = byDay.get(session.dayId) ?? [];
    group.push(session);
    byDay.set(session.dayId, group);
  }
  return [...byDay.entries()].flatMap(([dayId, group]) => {
    if (group.every((session) => session.status === "planned")) return [];
    const status = aggregateSessionStatus(group);
    const completed = group.filter((session) => session.status === "done");
    return [{
      dayId,
      status,
      actualDistanceKm: sumOptional(completed.map((session) => session.actualDistanceKm)),
      actualDurationMinutes: sumOptional(completed.map((session) => session.actualDurationMinutes)),
      updatedAt: latestSessionTimestamp(group),
    }];
  });
}
```

Keep helpers private and focused.

- [ ] **Step 4: Run focused and full core verification**

Run:

```powershell
npm test -- packages/core/test/sessions.test.ts
npm test
npm run typecheck
```

Expected: all session tests, the full suite, and TypeScript checks pass.

- [ ] **Step 5: Commit the aggregation behavior without unrelated user changes**

```powershell
git add packages/core/src/workflow.ts packages/core/test/sessions.test.ts
git commit -m "fix: aggregate multiple training sessions by day"
```

### Task 3: Build the Pure Record Form Model

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.js`
- Create: `web/test/session-record-form.test.js`
- Create: `web/src/session-record-form.js`

- [ ] **Step 1: Add the Web test harness**

Add `"test": "vitest run"` and dev dependencies for `vitest`, `@vue/test-utils`, and `happy-dom`. Configure alias `@core` to `../packages/core/src/index.ts` and happy-dom as the test environment.

- [ ] **Step 2: Write failing form-state tests**

Specify this API:

```js
import { createSessionRecordForm, toCompleteSessionInput } from "../src/session-record-form.js";

const form = createSessionRecordForm(plannedSession);
expect(form.adjustActualWorkout).toBe(false);
expect(form.actualWorkout).toEqual(plannedSession.plannedWorkout);
expect(form.actualWorkout).not.toBe(plannedSession.plannedWorkout);

const edited = createSessionRecordForm(doneSession);
expect(edited.actualWorkout).toEqual(doneSession.actualWorkout);
expect(edited.log).toBe("状态稳定");

expect(() => toCompleteSessionInput({ ...form, rpe: 11 })).toThrow("RPE");
```

Also test an extra session with no planned workout and normalization of blank/zero optional values.

- [ ] **Step 3: Run and verify RED**

Run: `npm test -- session-record-form.test.js` from `web`.

Expected: failure because `session-record-form.js` does not exist.

- [ ] **Step 4: Implement minimal pure conversion**

`createSessionRecordForm(session)` deep-copies the existing actual workout or planned workout. `toCompleteSessionInput(form)` validates positive distance/duration, integer RPE 1-10, validates structured Workout only when enabled/present, trims the log, and returns the core input shape.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm test -- session-record-form.test.js` from `web`.

Expected: all form-state tests pass.

- [ ] **Step 6: Commit the form model**

```powershell
git add web/package.json web/package-lock.json web/vitest.config.js web/src/session-record-form.js web/test/session-record-form.test.js
git commit -m "feat: model unique session record form"
```

### Task 4: Extract the Reusable Visual Workout Editor

**Files:**
- Create: `web/src/views/WorkoutEditorPanel.vue`
- Modify: `web/src/views/EditWorkout.vue`
- Create: `web/test/WorkoutEditorPanel.test.js`

- [ ] **Step 1: Write a failing editor interaction test**

Mount the panel with `{ goal: "恢复", segments: [] }`, click **添加步骤**, and assert the emitted model contains one default step. Also cover removing and copying a segment.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- WorkoutEditorPanel.test.js` from `web`.

Expected: failure because the shared panel does not exist.

- [ ] **Step 3: Extract the minimal shared panel**

Move structured goal/segment editing and `SegmentEditor` operations into a `v-model` component. Keep plan-only library, custom-library, persistence, and DSL controls in `EditWorkout.vue`.

- [ ] **Step 4: Replace duplicated plan editing controls**

Use:

```vue
<WorkoutEditorPanel v-model="workout" />
```

in `EditWorkout.vue`, preserving its existing save, library, and DSL behavior.

- [ ] **Step 5: Run tests and Web build**

Run from `web`:

```powershell
npm test -- WorkoutEditorPanel.test.js
npm run build
```

Expected: editor test passes and Vite production build exits 0.

- [ ] **Step 6: Commit the shared editor**

```powershell
git add web/src/views/WorkoutEditorPanel.vue web/src/views/EditWorkout.vue web/test/WorkoutEditorPanel.test.js
git commit -m "refactor: share visual workout editor"
```

### Task 5: Implement the Dedicated Session Record Page

**Files:**
- Create: `web/test/SessionRecord.test.js`
- Create: `web/src/views/SessionRecord.vue`
- Modify: `web/src/router.js`

- [ ] **Step 1: Write failing record-page tests**

Mount with stubbed service/router dependencies and assert:

- a planned session starts in **按计划完成** mode with copied planned content;
- **调整实际内容** displays `WorkoutEditorPanel`;
- a done session restores its existing record;
- invalid RPE shows an error and does not call `completeSession`;
- valid save calls `completeSession` once with the normalized unique record and navigates back to its day.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- SessionRecord.test.js` from `web`.

Expected: failure because the route component does not exist.

- [ ] **Step 3: Implement the page and route**

Register `/training/session` with `sessionId` and `date` query props. Load the current plan and its session, initialize the form helper, render the planned summary, adjustment toggle, optional visual editor, metrics, RPE, and log. Save through core `completeSession` and return to `/training/day?date=...`.

- [ ] **Step 4: Run focused tests and build**

Run from `web`:

```powershell
npm test -- SessionRecord.test.js
npm run build
```

Expected: focused tests pass and the route compiles in production.

- [ ] **Step 5: Commit the record page**

```powershell
git add web/src/views/SessionRecord.vue web/src/router.js web/test/SessionRecord.test.js
git commit -m "feat: record actual training per session"
```

### Task 6: Complete the Training Day Lifecycle UI

**Files:**
- Create: `web/test/TrainingDay.test.js`
- Modify: `web/src/views/TrainingDay.vue`
- Modify: `web/src/composables/useTrainingData.js`

- [ ] **Step 1: Write failing training-day tests**

Cover a rest day with zero sessions, ordered rendering of multiple sessions, action labels for `planned`/`done`/`skipped`, navigation to the unique record route, `skipSession`, and `addExtraSession` followed by refresh.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- TrainingDay.test.js` from `web`.

Expected: failures identify the old modal/DSL flow and missing dedicated-route behavior.

- [ ] **Step 3: Implement lifecycle cards**

Remove the actual-content DSL dialog and direct session rewrites. Route planned, done, and skipped record actions to the same unique session record page. Keep extra-session creation as a simple named planned session and keep skip through `skipSession`.

- [ ] **Step 4: Verify daily aggregates refresh**

Ensure `useTrainingData` consumes the now-aggregated `sessionsToProgress` result so one `recordsByDay` entry represents the full day rather than the last session.

- [ ] **Step 5: Run focused and full Web verification**

Run from `web`:

```powershell
npm test -- TrainingDay.test.js
npm test
npm run build
```

Expected: all Web tests pass and Vite build exits 0.

- [ ] **Step 6: Commit the training day UI**

```powershell
git add web/src/views/TrainingDay.vue web/src/composables/useTrainingData.js web/test/TrainingDay.test.js
git commit -m "feat: show session lifecycle on training days"
```

### Task 7: Verify, Document, and Update the Parent Pointer

**Files:**
- Modify: `README.md`
- Modify: `D:\GitBook\train-for-marathon-wapp\README.md`
- Update: parent submodule pointer `core`

- [ ] **Step 1: Update repository documentation**

Document the session lifecycle, one-record-per-session rule, many-sessions-per-day rule, Web test/build commands, and the physical working-directory boundary.

- [ ] **Step 2: Run fresh complete verification**

Run from `core`:

```powershell
npm test
npm run typecheck
npm run build
npm --prefix web test
npm --prefix web run build
```

Expected: zero failing tests, zero type errors, and successful core/Web builds.

- [ ] **Step 3: Run the browser smoke test**

Start the Web app, then verify: open a training day, observe its generated session, add a second session, skip one, complete the other with adjusted actual content and metrics, reopen and edit the same record, and confirm the day shows `partial` rather than last-session overwrite.

- [ ] **Step 4: Commit public repository documentation**

```powershell
git add README.md
git commit -m "docs: describe training session lifecycle"
```

- [ ] **Step 5: Inspect the final public-repository diff**

Run:

```powershell
git status --short
git log --oneline --decorate -8
git diff 433e5d3 --stat
```

Expected: feature commits are present; the pre-existing generated content, image rename, and citation changes remain visibly separate if not part of the approved baseline.

- [ ] **Step 6: Update only the parent pointer and README**

From `D:\GitBook\train-for-marathon-wapp`, stage `core` and `README.md` only. Do not stage any `wapp` path.

```powershell
git add core README.md
git diff --cached --stat
git commit -m "feat: integrate training session web lifecycle"
```

Expected: the parent commit contains the `core` gitlink update and README only; existing mini-program changes remain uncommitted.
