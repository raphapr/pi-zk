import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { runZk } from "../zk/client.js";
import { resolveActiveNotebook, withNotebookFlag } from "../zk/notebook.js";
import { formatTextOutput, renderNoteListText } from "../zk/output.js";
import { NOTE_LIST_FORMAT, parseNoteList, type Note } from "../zk/parsers.js";
import { NotebookOverride } from "../zk/schemas.js";
import { renderToolCall, renderToolResultText } from "./common.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const SearchNotesParams = Type.Object({
	match: Type.Optional(
		Type.String({
			description:
				"Full-text query (zk FTS syntax: AND default, OR/|, NOT/-, parens, prefix:term, *).",
		}),
	),
	additional_matches: Type.Optional(
		Type.Array(Type.String(), {
			description: "Extra --match clauses combined with AND. Each clause uses zk FTS syntax.",
		}),
	),
	match_strategy: Type.Optional(StringEnum(["fts", "exact", "re"] as const)),
	tags: Type.Optional(Type.Array(Type.String(), { description: "Tag names to filter by." })),
	tag_operand: Type.Optional(StringEnum(["AND", "OR"] as const, { description: "How to combine tags. Default AND." })),
	exclude_tags: Type.Optional(Type.Array(Type.String(), { description: "Tags to exclude." })),
	paths: Type.Optional(Type.Array(Type.String(), { description: "Scope to notes under these notebook-relative paths." })),
	created_after: Type.Optional(
		Type.String({ description: "Created after date (ISO or zk human-friendly, e.g. `1 week ago`)." }),
	),
	modified_after: Type.Optional(
		Type.String({ description: "Modified after date (ISO or zk human-friendly)." }),
	),
	sort: Type.Optional(
		Type.String({ description: "zk sort criterion. Default `modified-` (newest first)." }),
	),
	limit: Type.Optional(
		Type.Number({ description: `Max results. Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`, minimum: 1, maximum: MAX_LIMIT }),
	),
	offset: Type.Optional(
		Type.Number({ description: "Skip the first N results. Performed locally after fetch.", minimum: 0 }),
	),
	notebook: NotebookOverride,
});

export type SearchNotesArgs = Static<typeof SearchNotesParams>;

/**
 * Build a zk tag selector from tag list, operand and excludes.
 * Joins the inclusion expression with exclusions using AND (comma).
 */
export function buildTagSelector(args: {
	tags?: string[];
	operand?: "AND" | "OR";
	exclude_tags?: string[];
}): string | undefined {
	const tags = (args.tags ?? []).map((t) => t.trim()).filter(Boolean);
	const excludes = (args.exclude_tags ?? []).map((t) => t.trim()).filter(Boolean);
	if (tags.length === 0 && excludes.length === 0) return undefined;

	const operand = args.operand ?? "AND";
	let inclusion: string | undefined;
	if (tags.length === 1) {
		inclusion = tags[0];
	} else if (tags.length > 1) {
		inclusion = operand === "OR" ? `(${tags.join(" OR ")})` : tags.join(", ");
	}

	const exclusionParts = excludes.map((tag) => `NOT ${tag}`);
	const parts = [inclusion, ...exclusionParts].filter((part): part is string => Boolean(part));
	return parts.join(", ");
}

export function buildSearchNotesArgs(params: SearchNotesArgs): string[] {
	const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
	const offset = Math.max(params.offset ?? 0, 0);
	const fetchLimit = limit + offset + 1;

	const args: string[] = ["list", "--quiet", "--no-pager", "--format", NOTE_LIST_FORMAT];

	if (params.match) args.push("--match", params.match);
	for (const extra of params.additional_matches ?? []) {
		if (extra.trim()) args.push("--match", extra);
	}
	if (params.match_strategy) args.push("--match-strategy", params.match_strategy);

	const tagSelector = buildTagSelector({
		tags: params.tags,
		operand: params.tag_operand,
		exclude_tags: params.exclude_tags,
	});
	if (tagSelector) args.push("--tag", tagSelector);

	if (params.created_after) args.push("--created-after", params.created_after);
	if (params.modified_after) args.push("--modified-after", params.modified_after);

	args.push("--sort", params.sort ?? "modified-");
	args.push("--limit", String(fetchLimit));

	for (const path of params.paths ?? []) {
		const trimmed = path.trim();
		if (trimmed) args.push(trimmed);
	}

	return args;
}

interface SearchNotesDetails {
	notes: Note[];
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
	notebook: string;
	truncated?: boolean;
	fullOutputPath?: string;
}

export function registerSearchNotesTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_search_notes",
			label: "zk Search",
			description: "Search zk notes by full-text query, tags, paths, and date ranges. Returns path, title, and tags per match.",
			parameters: SearchNotesParams,
			promptSnippet:
				"zk_search_notes: Find notes in the active zk notebook by FTS query, tags, paths, or date filters.",
			promptGuidelines: [
				"Use zk_search_notes before reading notes to discover candidate paths.",
				"Prefer zk_search_notes over running `zk list` via bash for note discovery.",
			],
			async execute(_toolCallId, params: SearchNotesArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const baseArgs = buildSearchNotesArgs(params);
				const args = withNotebookFlag(notebook.path, baseArgs);
				const result = await runZk({ cwd: ctx.cwd, args, signal, timeoutMs: 30_000 });
				const allNotes = parseNoteList(result.stdout);

				const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
				const offset = Math.max(params.offset ?? 0, 0);
				const sliced = allNotes.slice(offset, offset + limit);
				const hasMore = allNotes.length > offset + limit;

				const visibleText = renderNoteListText(sliced, sliced.length);
				const formatted = await formatTextOutput({ text: visibleText, prefix: "pi-zk-search-" });

				const details: SearchNotesDetails = {
					notes: sliced,
					total: sliced.length,
					limit,
					offset,
					hasMore,
					notebook: notebook.path,
					truncated: formatted.truncated,
					fullOutputPath: formatted.fullOutputPath,
				};

				return { content: [{ type: "text", text: formatted.visible }], details };
			},
			renderCall(args, theme) {
				const parts: string[] = [];
				if (args.match) parts.push(`"${args.match}"`);
				if (args.tags?.length) parts.push(`#${args.tags.join(",")}`);
				if (args.modified_after) parts.push(`mod≥${args.modified_after}`);
				return renderToolCall(theme, "zk_search_notes", parts.join(" "));
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as SearchNotesDetails | undefined;
				if (!details) return renderToolResultText(theme, { status: "done" }, expanded);
				const more = details.hasMore ? ", more available" : "";
				const tone = details.total === 0 ? "empty" : "ok";
				const status = details.total === 0
					? "no notes matched"
					: `${details.total} note${details.total === 1 ? "" : "s"}${more}`;
				const body = details.notes
					.slice(0, expanded ? 20 : 5)
					.map((n) => `${n.path}\t${n.title}`)
					.join("\n");
				return renderToolResultText(theme, { status, body, tone }, expanded);
			},
		}),
	);
}
