import { Type, type Static } from "typebox";

/**
 * Optional notebook override accepted by every tool. When set, it bypasses
 * env-based notebook resolution for a single call.
 */
export const NotebookOverride = Type.Optional(
	Type.String({
		description: "Override the active zk notebook path for this call (absolute or relative to Pi's cwd).",
	}),
);

/**
 * Pagination shape returned alongside list results.
 */
export const Pagination = Type.Object({
	limit: Type.Number(),
	offset: Type.Number(),
	returned: Type.Number(),
});

export type PaginationT = Static<typeof Pagination>;

/**
 * Reusable note ref: a path relative to the notebook root.
 */
export const NoteRef = Type.String({
	description: "Note path relative to the notebook root (e.g. `journal/2026-05-09.md`).",
});

/**
 * Reusable date filter accepted by search-style tools. Either an ISO date or a
 * zk-friendly relative expression (e.g. `1 week ago`).
 */
export const DateFilter = Type.Optional(
	Type.String({
		description: "Date filter. ISO date (`2026-05-01`) or zk relative (`1 week ago`).",
	}),
);
