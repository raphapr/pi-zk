import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { runZk } from "../zk/client.js";
import { resolveActiveNotebook, withNotebookFlag } from "../zk/notebook.js";
import { formatTextOutput, renderNoteListText } from "../zk/output.js";
import { NOTE_LIST_FORMAT, parseNoteList, type Note } from "../zk/parsers.js";
import { NoteRef, NotebookOverride } from "../zk/schemas.js";
import { validateNoteRef } from "../zk/validate.js";
import { renderToolCall, renderToolResultText } from "./common.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Shared parameter schema for all three link-graph tools. `recursive` and
 * `max_distance` are no-ops for `zk_related` because zk does not support them
 * on that flag.
 */
function buildParamsSchema(supportsRecursive: boolean) {
	const base = {
		path: NoteRef,
		limit: Type.Optional(
			Type.Number({ minimum: 1, maximum: MAX_LIMIT, description: `Max results. Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.` }),
		),
		offset: Type.Optional(Type.Number({ minimum: 0, description: "Skip the first N results (applied locally)." })),
		sort: Type.Optional(Type.String({ description: "zk sort criterion. Default `modified-`." })),
		notebook: NotebookOverride,
	};
	if (!supportsRecursive) {
		return Type.Object(base);
	}
	return Type.Object({
		...base,
		recursive: Type.Optional(Type.Boolean({ description: "Walk the link graph beyond direct neighbors." })),
		max_distance: Type.Optional(
			Type.Number({ minimum: 1, description: "Cap recursive traversal at this hop count." }),
		),
	});
}

type LinkGraphArgs = {
	path: string;
	limit?: number;
	offset?: number;
	sort?: string;
	notebook?: string;
	recursive?: boolean;
	max_distance?: number;
};

export interface LinkGraphSpec {
	name: string;
	label: string;
	description: string;
	promptSnippet: string;
	promptGuidelines: string[];
	zkFlag: "--link-to" | "--linked-by" | "--related";
	supportsRecursive: boolean;
}

/**
 * Compose the `zk list` argv for a link-graph query.
 */
export function buildLinkGraphArgs(spec: LinkGraphSpec, params: LinkGraphArgs): string[] {
	const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
	const offset = Math.max(params.offset ?? 0, 0);
	const fetchLimit = limit + offset + 1;

	const args: string[] = [
		"list",
		"--quiet",
		"--no-pager",
		"--format",
		NOTE_LIST_FORMAT,
		spec.zkFlag,
		params.path,
		"--sort",
		params.sort ?? "modified-",
		"--limit",
		String(fetchLimit),
	];

	if (spec.supportsRecursive) {
		if (params.recursive) args.push("--recursive");
		if (params.max_distance && params.max_distance > 0) {
			args.push("--max-distance", String(params.max_distance));
		}
	}

	return args;
}

interface LinkGraphDetails {
	notes: Note[];
	source: string;
	flag: string;
	limit: number;
	offset: number;
	hasMore: boolean;
	notebook: string;
}

function registerLinkGraphTool(pi: ExtensionAPI, spec: LinkGraphSpec): void {
	const parameters = buildParamsSchema(spec.supportsRecursive);
	type Params = Static<typeof parameters>;

	pi.registerTool(
		defineTool({
			name: spec.name,
			label: spec.label,
			description: spec.description,
			parameters,
			promptSnippet: spec.promptSnippet,
			promptGuidelines: spec.promptGuidelines,
			async execute(_toolCallId, params: Params, signal, _onUpdate, ctx) {
				const args = params as LinkGraphArgs;
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: args.notebook });
				const path = validateNoteRef(args.path);
				const zkArgs = withNotebookFlag(notebook.path, buildLinkGraphArgs(spec, { ...args, path }));
				const result = await runZk({ cwd: ctx.cwd, args: zkArgs, signal, timeoutMs: 30_000 });
				const allNotes = parseNoteList(result.stdout);

				const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
				const offset = Math.max(args.offset ?? 0, 0);
				const sliced = allNotes.slice(offset, offset + limit);
				const hasMore = allNotes.length > offset + limit;

				const text = renderNoteListText(sliced, sliced.length);
				const formatted = await formatTextOutput({ text, prefix: `${spec.name}-` });

				const details: LinkGraphDetails = {
					notes: sliced,
					source: path,
					flag: spec.zkFlag,
					limit,
					offset,
					hasMore,
					notebook: notebook.path,
				};

				return { content: [{ type: "text", text: formatted.visible }], details };
			},
			renderCall(args, theme) {
				const params = args as LinkGraphArgs;
				let summary = params.path;
				if (params.recursive) summary += " (recursive)";
				return renderToolCall(theme, spec.name, summary);
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as LinkGraphDetails | undefined;
				if (!details) return renderToolResultText(theme, { status: "done" }, expanded);
				const more = details.hasMore ? ", more available" : "";
				const tone = details.notes.length === 0 ? "empty" : "ok";
				const status = details.notes.length === 0
					? "no related notes"
					: `${details.notes.length} note${details.notes.length === 1 ? "" : "s"}${more}`;
				const body = details.notes
					.slice(0, expanded ? 20 : 5)
					.map((n) => `${n.path}\t${n.title}`)
					.join("\n");
				return renderToolResultText(theme, { status, body, tone }, expanded);
			},
		}),
	);
}

export function registerLinkToTool(pi: ExtensionAPI): void {
	registerLinkGraphTool(pi, {
		name: "zk_link_to",
		label: "zk Backlinks",
		description: "List notes whose body links to the given note (backlinks). Supports recursive graph traversal.",
		promptSnippet: "zk_link_to: List backlinks - notes that link to the given note.",
		promptGuidelines: [
			"Use zk_link_to when the user asks `what links here` or wants to find references to a specific note.",
		],
		zkFlag: "--link-to",
		supportsRecursive: true,
	});
}

export function registerLinkedByTool(pi: ExtensionAPI): void {
	registerLinkGraphTool(pi, {
		name: "zk_linked_by",
		label: "zk Outbound Links",
		description: "List notes that the given note links out to. Supports recursive graph traversal.",
		promptSnippet: "zk_linked_by: List the notes a given note links out to.",
		promptGuidelines: [
			"Use zk_linked_by when the user asks `where does this note point` or wants to follow links forward.",
		],
		zkFlag: "--linked-by",
		supportsRecursive: true,
	});
}

export function registerRelatedTool(pi: ExtensionAPI): void {
	registerLinkGraphTool(pi, {
		name: "zk_related",
		label: "zk Related",
		description: "List notes related to the given note (share linked neighbors but not yet connected). Surfaces candidate links.",
		promptSnippet: "zk_related: Suggest notes related to the given one through shared neighbors.",
		promptGuidelines: [
			"Use zk_related to surface candidate links - notes sharing context that are not yet directly linked.",
		],
		zkFlag: "--related",
		supportsRecursive: false,
	});
}
