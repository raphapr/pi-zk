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
 * Plain `{ type: "string", enum }` schema, which every provider accepts.
 * Built with TypeBox so `Static` infers the union; pi-ai's `StringEnum` is
 * typed for pi-schema and infers `unknown` here.
 */
export function StringEnum<const T extends readonly string[]>(values: T, options: { description?: string } = {}) {
	return Type.Unsafe<T[number]>({ type: "string", enum: [...values], ...options });
}

export const ZK_NAMESPACE = {
	name: "zk",
	description: "Notes in the active zk notebook: search, read, link graph, create, edit, append.",
};

export const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

export const NoteSchema = Type.Object({
	path: Type.String({ description: "Notebook-relative path." }),
	title: Type.String(),
	tags: Type.Array(Type.String()),
});

export const NoteListOutput = Type.Object({
	notes: Type.Array(NoteSchema),
	limit: Type.Integer(),
	offset: Type.Integer(),
	hasMore: Type.Boolean(),
	notebook: Type.String(),
});

export const SingleNoteOutput = Type.Object({
	note: Type.Optional(NoteSchema),
	notebook: Type.String(),
});

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
