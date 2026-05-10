import { readFile } from "node:fs/promises";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { resolveActiveNotebook } from "../zk/notebook.js";
import { formatTextOutput } from "../zk/output.js";
import { NotebookOverride, NoteRef } from "../zk/schemas.js";
import { resolveNotebookPath, ValidationError } from "../zk/validate.js";
import { renderToolCall, renderToolResultText } from "./common.js";

export const ReadNoteParams = Type.Object({
	path: NoteRef,
	notebook: NotebookOverride,
});

export type ReadNoteArgs = Static<typeof ReadNoteParams>;

interface ReadNoteDetails {
	path: string;
	absolutePath: string;
	notebook: string;
	bytes: number;
	truncated: boolean;
	fullOutputPath?: string;
}

export function registerReadNoteTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_read_note",
			label: "zk Read",
			description: "Read the full contents of a note at a notebook-relative path. Output is truncated to 50KB; the full file is spilled to a temp path when truncated.",
			parameters: ReadNoteParams,
			promptSnippet: "zk_read_note: Read a single note's contents by notebook-relative path.",
			promptGuidelines: [
				"Use zk_read_note rather than the generic read tool when the file is a zk note, to keep paths notebook-scoped.",
			],
			async execute(_toolCallId, params: ReadNoteArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				let absolutePath: string;
				try {
					absolutePath = resolveNotebookPath(notebook.path, params.path);
				} catch (error) {
					if (error instanceof ValidationError) throw error;
					throw error;
				}
				if (signal?.aborted) throw new Error("read aborted");

				const text = await readFile(absolutePath, "utf8");
				const formatted = await formatTextOutput({ text, prefix: "pi-zk-read-" });

				const details: ReadNoteDetails = {
					path: params.path,
					absolutePath,
					notebook: notebook.path,
					bytes: Buffer.byteLength(text, "utf8"),
					truncated: formatted.truncated,
					fullOutputPath: formatted.fullOutputPath,
				};

				return { content: [{ type: "text", text: formatted.visible }], details };
			},
			renderCall(args, theme) {
				return renderToolCall(theme, "zk_read_note", args.path);
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as ReadNoteDetails | undefined;
				if (!details) return renderToolResultText(theme, { status: "done" }, expanded);
				const status = `${details.bytes} bytes${details.truncated ? " (truncated)" : ""}`;
				return renderToolResultText(theme, { status }, expanded);
			},
		}),
	);
}
