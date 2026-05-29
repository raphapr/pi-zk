import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { runZk } from "../zk/client.js";
import { resolveActiveNotebook, withNotebookFlag } from "../zk/notebook.js";
import { formatTextOutput, renderNoteListText } from "../zk/output.js";
import { NOTE_LIST_FORMAT, parseNoteList, type Note } from "../zk/parsers.js";
import { NotebookOverride } from "../zk/schemas.js";
import { renderToolCall, renderToolResultText } from "./common.js";

export const LastModifiedParams = Type.Object({
	tag: Type.Optional(Type.String({ description: "Restrict to notes carrying this tag." })),
	notebook: NotebookOverride,
});

export type LastModifiedArgs = Static<typeof LastModifiedParams>;

export function buildLastModifiedArgs(params: LastModifiedArgs): string[] {
	const args = ["list", "--quiet", "--no-pager", "--format", NOTE_LIST_FORMAT, "--sort", "modified-", "--limit", "1"];
	if (params.tag?.trim()) args.push("--tag", params.tag.trim());
	return args;
}

interface LastModifiedDetails {
	note?: Note;
	notebook: string;
}

export function registerLastModifiedTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_last_modified",
			label: "zk Last Modified",
			description: "Return the most recently modified note (optionally filtered by tag).",
			parameters: LastModifiedParams,
			promptSnippet: "zk_last_modified: Return the most recently edited note (optionally tag-filtered).",
			promptGuidelines: [
				"Use zk_last_modified when the user asks `what did I work on most recently` or wants to resume a note.",
				"Read the returned note before summarizing, editing, or continuing it.",
			],
			async execute(_toolCallId, params: LastModifiedArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const args = withNotebookFlag(notebook.path, buildLastModifiedArgs(params));
				const result = await runZk({ cwd: ctx.cwd, args, signal, timeoutMs: 10_000 });
				const notes = parseNoteList(result.stdout);
				const note = notes[0];
				const text = note ? renderNoteListText([note], 1) : "No notes found.";
				const formatted = await formatTextOutput({ text, prefix: "pi-zk-last-" });
				const details: LastModifiedDetails = { note, notebook: notebook.path };
				return { content: [{ type: "text", text: formatted.visible }], details };
			},
			renderCall(args, theme) {
				return renderToolCall(theme, "zk_last_modified", args.tag ? `#${args.tag}` : undefined);
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as LastModifiedDetails | undefined;
				if (!details?.note) return renderToolResultText(theme, { status: "no notes", tone: "empty" }, expanded);
				return renderToolResultText(theme, { status: `${details.note.path}\t${details.note.title}` }, expanded);
			},
		}),
	);
}
