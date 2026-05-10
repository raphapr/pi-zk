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

export const TaglessNotesParams = Type.Object({
	limit: Type.Optional(Type.Number({ minimum: 1, maximum: MAX_LIMIT, description: `Max results. Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.` })),
	offset: Type.Optional(Type.Number({ minimum: 0, description: "Skip the first N results (applied locally)." })),
	notebook: NotebookOverride,
});

export type TaglessNotesArgs = Static<typeof TaglessNotesParams>;

export function buildTaglessNotesArgs(params: TaglessNotesArgs): string[] {
	const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
	const offset = Math.max(params.offset ?? 0, 0);
	const fetchLimit = limit + offset + 1;
	return ["list", "--quiet", "--no-pager", "--tagless", "--sort", "modified-", "--format", NOTE_LIST_FORMAT, "--limit", String(fetchLimit)];
}

interface TaglessNotesDetails {
	notes: Note[];
	limit: number;
	offset: number;
	hasMore: boolean;
	notebook: string;
}

export function registerTaglessNotesTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_tagless_notes",
			label: "zk Tagless",
			description: "List notes with no tags, newest first. Useful for triage and tag-grooming.",
			parameters: TaglessNotesParams,
			promptSnippet: "zk_tagless_notes: List notes with no tags. Useful for triage and tag-grooming.",
			promptGuidelines: ["Use zk_tagless_notes when the user wants to find untagged notes or triage tag coverage."],
			async execute(_toolCallId, params: TaglessNotesArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const args = withNotebookFlag(notebook.path, buildTaglessNotesArgs(params));
				const result = await runZk({ cwd: ctx.cwd, args, signal, timeoutMs: 15_000 });
				const allNotes = parseNoteList(result.stdout);
				const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
				const offset = Math.max(params.offset ?? 0, 0);
				const sliced = allNotes.slice(offset, offset + limit);
				const hasMore = allNotes.length > offset + limit;

				const text = renderNoteListText(sliced, sliced.length);
				const formatted = await formatTextOutput({ text, prefix: "pi-zk-tagless-" });
				const details: TaglessNotesDetails = {
					notes: sliced,
					limit,
					offset,
					hasMore,
					notebook: notebook.path,
				};
				return { content: [{ type: "text", text: formatted.visible }], details };
			},
			renderCall(_args, theme) {
				return renderToolCall(theme, "zk_tagless_notes");
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as TaglessNotesDetails | undefined;
				if (!details) return renderToolResultText(theme, { status: "done" }, expanded);
				const more = details.hasMore ? ", more available" : "";
				const tone = details.notes.length === 0 ? "empty" : "ok";
				const status = details.notes.length === 0
					? "no tagless notes"
					: `${details.notes.length} tagless note${details.notes.length === 1 ? "" : "s"}${more}`;
				const body = details.notes
					.slice(0, expanded ? 20 : 5)
					.map((n) => `${n.path}\t${n.title}`)
					.join("\n");
				return renderToolResultText(theme, { status, body, tone }, expanded);
			},
		}),
	);
}
