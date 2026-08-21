/** Graph-query literals. */

/** Table per id kind, for the existence checks that turn a bad id into a 404
 *  rather than an empty result that looks like a real answer. */
export const ID_TABLES = { repo: "repos", file: "files", function: "functions" } as const;
