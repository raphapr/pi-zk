import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { runZk } from "../zk/client.js";
import { resolveActiveNotebook, withNotebookFlag } from "../zk/notebook.js";
import { formatTextOutput, renderNoteListText } from "../zk/output.js";
import { NOTE_LIST_FORMAT, parseNoteList, type Note } from "../zk/parsers.js";
import { NotebookOverride } from "../zk/schemas.js";
import { renderToolCall, renderToolResultText } from "./common.js";

export const RandomNoteParams = Type.Object({
	tag: Type.Optional(Type.String({ description: "Restrict to notes carrying this tag." })),
	notebook: NotebookOverride,
});

export type RandomNoteArgs = Static<typeof RandomNoteParams>;

export function buildRandomNoteArgs(params: RandomNoteArgs): string[] {
	const args = ["list", "--quiet", "--no-pager", "--format", NOTE_LIST_FORMAT, "--sort", "random", "--limit", "1"];
	if (params.tag?.trim()) args.push("--tag", params.tag.trim());
	return args;
}

interface RandomNoteDetails {
	note?: Note;
	notebook: string;
}

export function registerRandomNoteTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_random_note",
			label: "zk Random",
			description: "Return one randomly selected note from the notebook (optionally tag-filtered).",
			parameters: RandomNoteParams,
			promptSnippet: "zk_random_note: Return one randomly selected note for serendipitous review.",
			promptGuidelines: ["Use zk_random_note when the user asks for a random note or wants to be surprised."],
			async execute(_toolCallId, params: RandomNoteArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const args = withNotebookFlag(notebook.path, buildRandomNoteArgs(params));
				const result = await runZk({ cwd: ctx.cwd, args, signal, timeoutMs: 10_000 });
				const note = parseNoteList(result.stdout)[0];
				const text = note ? renderNoteListText([note], 1) : "No notes found.";
				const formatted = await formatTextOutput({ text, prefix: "pi-zk-random-" });
				const details: RandomNoteDetails = { note, notebook: notebook.path };
				return { content: [{ type: "text", text: formatted.visible }], details };
			},
			renderCall(args, theme) {
				return renderToolCall(theme, "zk_random_note", args.tag ? `#${args.tag}` : undefined);
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as RandomNoteDetails | undefined;
				if (!details?.note) return renderToolResultText(theme, { status: "no notes", tone: "empty" }, expanded);
				return renderToolResultText(theme, { status: `${details.note.path}\t${details.note.title}` }, expanded);
			},
		}),
	);
}
