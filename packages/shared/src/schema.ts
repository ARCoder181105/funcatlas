import {
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import type { ParseStatus, ResolutionConfidence } from "./types.js";

/**
 * Drizzle description of the schema in services/parser/migrations/, which is
 * the single source of truth. This file must describe the database that
 * actually exists -- TypeScript will happily agree with a schema Postgres does
 * not have, so changes here are verified with a real query, not just a build.
 *
 * Constraint and index names match what Postgres actually assigned; check with
 * `\d <table>` before renaming anything here.
 */

export const repos = pgTable("repos", {
  id: serial("id").primaryKey(),
  githubUrl: text("github_url").notNull().unique(),
  defaultBranch: text("default_branch").notNull(),
  lastSyncedCommit: text("last_synced_commit"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Added in 0004, when the parse moved to a queue and a repo row stopped
  // being proof that a parse had finished.
  parseStatus: text("parse_status").$type<ParseStatus>().notNull().default("ready"),
  parseError: text("parse_error"),
});

export const files = pgTable(
  "files",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id")
      .references(() => repos.id, { onDelete: "cascade" })
      .notNull(),
    path: text("path").notNull(),
    language: text("language").notNull(),
    // Nullable: rows written before migration 0003 have none, and a null reads
    // as "changed" on the next parse.
    contentHash: text("content_hash"),
  },
  (t) => ({
    unq: unique("files_repo_id_path_key").on(t.repoId, t.path),
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
    unq: unique("functions_file_id_qualified_name_overload_index_key").on(
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
    // Both sides are nullable in SQL. A caller is null for a call made at
    // module level, outside any function.
    callerFunctionId: integer("caller_function_id").references(() => functions.id, {
      onDelete: "cascade",
    }),
    // Null exactly when the confidence is 'unresolved' -- enforced in the
    // database by the edges_callee_consistency CHECK, not here.
    calleeFunctionId: integer("callee_function_id").references(() => functions.id, {
      onDelete: "cascade",
    }),
    // The name as written at the call site, kept whatever the confidence, so an
    // unresolved edge still carries information.
    calleeName: text("callee_name").notNull(),
    callLine: integer("call_line"),
    // TEXT with a CHECK constraint in the database, not a Postgres enum -- no
    // enum type named resolution_confidence exists. The CHECK is the real
    // enforcement; $type only narrows it for TypeScript.
    resolutionConfidence: text("resolution_confidence")
      .$type<ResolutionConfidence>()
      .notNull(),
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
