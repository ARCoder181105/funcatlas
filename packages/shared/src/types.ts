// Shared TS types. Row types are inferred from the Drizzle schema in
// ./schema.ts, so they are not re-declared here.

import type { RESOLUTION_CONFIDENCE, TRAVERSAL_DIRECTIONS } from "./constants.js";

export type ResolutionConfidence = (typeof RESOLUTION_CONFIDENCE)[number];
export type TraversalDirection = (typeof TRAVERSAL_DIRECTIONS)[number];

/** One function reached by a traversal, with how it was reached. */
export interface ReachableFunction {
  id: number;
  name: string;
  qualifiedName: string;
  fileId: number;
  depth: number;
  /** Confidence of the edge that reached it; null for the starting function. */
  confidence: ResolutionConfidence | null;
  /** The function the edge came from; null for the starting function. */
  viaFunctionId: number | null;
}
