export const CORE_PACKAGE = {
  name: "@train-for-marathon/core",
  schemaVersion: 1,
} as const;

export * from "./domain.js";
export * from "./athlete.js";
export * from "./markdown.js";
export * from "./dsl/index.js";
export * from "./vdot.js";
export * from "./fitness.js";
export * from "./beginner-table.js";
export * from "./training-visuals.js";
export * from "./workflow.js";
export * from "./session-record.js";
export * from "./pace.js";
export * from "./plans/validate.js";
export * from "./plans/five-week.js";
export * from "./plans/twenty-week.js";
export * from "./plans/registry.js";
export * from "./plans/instantiate.js";
export * from "./plans/adjust.js";
export * from "./plans/session-params.js";
export * from "./library.js";
export * from "./content/types.js";
export * from "./content/catalog.js";
export * from "./stats.js";
