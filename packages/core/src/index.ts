export const CORE_PACKAGE = {
  name: "@train-for-marathon/core",
  schemaVersion: 1,
} as const;

export * from "./domain.js";
export * from "./pace.js";
export * from "./plans/validate.js";
export * from "./plans/five-week.js";
export * from "./plans/twenty-week.js";
export * from "./plans/registry.js";
export * from "./plans/instantiate.js";
export * from "./plans/adjust.js";
export * from "./content/types.js";
export * from "./content/catalog.js";
export * from "./stats.js";
