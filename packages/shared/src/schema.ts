import {
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

/**
 * Schema mirrors docs/DATA_MODEL.md exactly.
 * Single source of truth shared by the API (Drizzle read) and the migration
 * SQL consumed by the Go parser (golang-migrate). Keep them in sync.
 */

export const resolutionConfidence = pgEnum("resolution_confidence", [
  "exact",
  "name_match",
  "unresolved",
]);

export const repos = pgTable("repos", {
  id: serial("id").primaryKey(),
  githubUrl: text("github_url").notNull(),
  defaultBranch: text("default_branch").notNull(),
  lastSyncedCommit: text("last_synced_commit"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const files = pgTable(
  "files",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id").references(() => repos.id),
    path: text("path").notNull(),
    language: text("language").notNull(),
  },
  (t) => ({
    unq: uniqueIndex("idx_files_repo_path").on(t.repoId, t.path),
  }),
);

export const functions = pgTable(
  "functions",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .references(() => files.id, { onDelete: "cascade" })
      .notNull(),
    packagePath: text("package_path").notNull(),
    name: text("name").notNull(),
    qualifiedName: text("qualified_name").notNull(),
    overloadIndex: smallint("overload_index").notNull().default(0),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    sourceBlobRef: text("source_blob_ref"),
    parsedCommit: text("parsed_commit"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    unq: uniqueIndex("idx_functions_file_qual_overload").on(
      t.fileId,
      t.qualifiedName,
      t.overloadIndex,
    ),
    idxQualified: index("idx_functions_qualified").on(t.qualifiedName),
    idxPkgName: index("idx_functions_pkg_name").on(t.packagePath, t.name),
  }),
);

export const edges = pgTable(
  "edges",
  {
    id: serial("id").primaryKey(),
    callerFunctionId: integer("caller_function_id")
      .references(() => functions.id, { onDelete: "cascade" })
      .notNull(),
    calleeFunctionId: integer("callee_function_id")
      .references(() => functions.id, { onDelete: "cascade" })
      .notNull(),
    resolutionConfidence: resolutionConfidence("resolution_confidence").notNull(),
    parsedCommit: text("parsed_commit"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxCaller: index("idx_edges_caller").on(t.callerFunctionId),
    idxCallee: index("idx_edges_callee").on(t.calleeFunctionId),
  }),
);

export type Repo = typeof repos.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type FunctionRow = typeof functions.$inferSelect;
export type EdgeRow = typeof edges.$inferSelect;
