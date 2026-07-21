// Shared TS types. Row types are inferred from the Drizzle schema in
// ./schema.ts (see `export type Repo = typeof repos.$inferSelect` etc.),
// so they are intentionally NOT re-declared here to avoid name collisions.

export type ResolutionConfidence = "exact" | "name_match" | "unresolved";
