# Core Foundation Implementation Plan

> **状态（2026-09-11 核对）：已实施。** 工作区与包边界、领域模型与模板校验、结构化课表模板、
> 配速与实例化、内容目录与统计、文档与最终验证都已在仓库中落地（`packages/core/src/**`、
> `packages/core/test/**`）。下方步骤清单保留当时的执行顺序，未逐项勾选。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first platform-independent TypeScript core for course content, pace ranges, parameterized training plans, progress, and basic statistics.

**Architecture:** A single `@train-for-marathon/core` workspace package owns serializable domain models and pure functions. Existing Markdown remains editorial source for narrative content; structured plan templates live in the core package. No WeChat, CloudBase, DOM, filesystem, or UI API is reachable from runtime exports.

**Tech Stack:** Node.js 22, TypeScript, Vitest, npm workspaces.

---

### Task 1: Workspace and package boundary

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/test/boundary.test.ts`

- [ ] Write a boundary test that imports the public package entry and verifies it has no platform globals.
- [ ] Run `npm test -- packages/core/test/boundary.test.ts` and confirm it fails because the package does not exist.
- [ ] Add the npm workspace, TypeScript/Vitest configuration, and an empty public entry.
- [ ] Install dependencies and run the boundary test until it passes.
- [ ] Run `npm run typecheck`.

### Task 2: Domain schemas and template validation

**Files:**
- Create: `packages/core/src/domain.ts`
- Create: `packages/core/src/plans/validate.ts`
- Create: `packages/core/test/plan-validation.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Write failing tests for continuous week numbers, registered training types, seven-day weeks, valid volume ranges, and duplicate template IDs.
- [ ] Run the focused test and confirm missing exports cause the expected failure.
- [ ] Implement serializable `PlanTemplate`, `PlanWeek`, `PlanDay`, `PlanInstance`, and progress types plus `validatePlanTemplate()`.
- [ ] Run focused tests, then the full test suite and typecheck.

### Task 3: Initial structured plan templates

**Files:**
- Create: `packages/core/src/plans/five-week.ts`
- Create: `packages/core/src/plans/twenty-week.ts`
- Create: `packages/core/src/plans/registry.ts`
- Create: `packages/core/test/templates.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Write failing tests requiring 5 and 20 continuous weeks, seven days per week, and registry lookup.
- [ ] Run the tests and confirm the missing templates fail.
- [ ] Transcribe both Markdown tables into structured templates; encode the final 20-week row as week 1 while leaving editorial Markdown unchanged.
- [ ] Run template validation tests and compare the template counts and week sequence with the source tables.
- [ ] Run the full suite and typecheck.

### Task 4: Pace ranges and plan instantiation

**Files:**
- Create: `packages/core/src/pace.ts`
- Create: `packages/core/src/plans/instantiate.ts`
- Create: `packages/core/test/pace.test.ts`
- Create: `packages/core/test/instantiate.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Write failing tests for the documented 340 sec/km threshold example: T 3:25–3:40 (205–220 seconds), I 3:10–3:25 (190–205 seconds), R 2:55–3:10 (175–190 seconds); write date tests that place week 1 on race week and calculate weekly volume ranges.
- [ ] Run focused tests and confirm missing functions fail.
- [ ] Implement `calculateSixSecondPaces()` using the documented 15-second-per-kilometre rule; E and M remain guidance-only without invented precision.
- [ ] Implement deterministic UTC-date plan instantiation from race date, threshold pace, and maximum weekly kilometres.
- [ ] Run focused tests, full tests, and typecheck.

### Task 5: Content catalog and basic statistics

**Files:**
- Create: `packages/core/src/content/catalog.ts`
- Create: `packages/core/src/content/types.ts`
- Create: `packages/core/src/stats.ts`
- Create: `packages/core/test/content.test.ts`
- Create: `packages/core/test/stats.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Write failing content tests requiring 23 stable document IDs and resolvable parent/previous/next references.
- [ ] Write failing statistics tests for completed/partial/skipped sessions, actual distance, completion rate, and consecutive completed weeks.
- [ ] Add the content catalog metadata without embedding platform rendering logic.
- [ ] Implement pure `calculateStats()` over a plan instance and progress records.
- [ ] Run focused tests, full tests, typecheck, and build.

### Task 6: Documentation and final verification

**Files:**
- Create: `packages/core/README.md`
- Modify: `网站化改造方案.md`

- [ ] Document core API, input units, date semantics, and the deliberate VDOT limitation.
- [ ] Update the proposal implementation status without changing unresolved licensing statements.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build` from the repository root.
- [ ] Inspect `git diff --check` and `git status --short`; verify the pre-existing `book.json` change remains untouched.
