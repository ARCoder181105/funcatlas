export type ResolutionConfidence = "exact" | "name_match" | "unresolved";

export interface Repo {
  id: number;
  githubUrl: string;
  defaultBranch: string;
  lastSyncedCommit: string | null;
  createdAt: Date;
}

export interface FileRow {
  id: number;
  repoId: number | null;
  path: string;
  language: string;
}

export interface FunctionRow {
  id: number;
  fileId: number;
  packagePath: string;
  name: string;
  qualifiedName: string;
  overloadIndex: number;
  startLine: number;
  endLine: number;
  sourceBlobRef: string | null;
  parsedCommit: string | null;
  updatedAt: Date;
}

export interface EdgeRow {
  id: number;
  callerFunctionId: number;
  calleeFunctionId: number;
  resolutionConfidence: ResolutionConfidence;
  parsedCommit: string | null;
  updatedAt: Date;
}
