import { appendFile, readFile } from "node:fs/promises";
import { defineTool, type ExtensionAPI, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { buildAppendPayload } from "../zk/edits.js";
import { resolveActiveNotebook } from "../zk/notebook.js";
import { NotebookOverride, NoteRef } from "../zk/schemas.js";
import { resolveNotebookPath } from "../zk/validate.js";
import { renderToolCall, renderToolResultText } from "./common.js";

export const AppendNoteParams = Type.Object({
	path: NoteRef,
	content: Type.String({ minLength: 1, description: "Markdown block to append to the end of the note." }),
	ensureBlankLine: Type.Optional(
		Type.Boolean({ description: "Insert a blank line between existing content and the new block. Default true." }),
	),
	notebook: NotebookOverride,
});

export type AppendNoteArgs = Static<typeof AppendNoteParams>;

interface AppendNoteDetails {
	path: string;
	absolutePath: string;
	notebook: string;
	bytesAppended: number;
	bytesAfter: number;
}

export function registerAppendNoteTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_append_note",
			label: "zk Append",
			description:
				"Append a markdown block to the end of a zk note. Ensures a blank line separator by default so adjacent paragraphs render correctly.",
			parameters: AppendNoteParams,
			promptSnippet:
				"zk_append_note: Append a markdown block to a note. Use for new bullets, sections, or log entries.",
			promptGuidelines: [
				"Use zk_append_note for daily-log style additions instead of zk_edit_note to keep diffs simple.",
			],
			async execute(_toolCallId, params: AppendNoteArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const absolutePath = resolveNotebookPath(notebook.path, params.path);
				if (signal?.aborted) throw new Error("append aborted");

				const ensureBlank = params.ensureBlankLine ?? true;
				const details = await withFileMutationQueue(absolutePath, async () => {
					const before = await readFile(absolutePath, "utf8");
					const payload = buildAppendPayload(before, params.content, ensureBlank);
					await appendFile(absolutePath, payload, "utf8");
					return {
						path: params.path,
						absolutePath,
						notebook: notebook.path,
						bytesAppended: Buffer.byteLength(payload, "utf8"),
						bytesAfter: Buffer.byteLength(before, "utf8") + Buffer.byteLength(payload, "utf8"),
					} satisfies AppendNoteDetails;
				});

				const summary = [
					`Appended to ${details.path}`,
					`Bytes added: ${details.bytesAppended}`,
					`Final size: ${details.bytesAfter} bytes`,
				].join("\n");

				return { content: [{ type: "text", text: summary }], details };
			},
			renderCall(args, theme) {
				return renderToolCall(theme, "zk_append_note", args.path);
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as AppendNoteDetails | undefined;
				if (!details) return renderToolResultText(theme, { status: "appended" }, expanded);
				return renderToolResultText(theme, { status: `+${details.bytesAppended}B → ${details.path}` }, expanded);
			},
		}),
	);
}
