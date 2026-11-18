import { readFile } from "node:fs/promises";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { resolveActiveNotebook } from "../zk/notebook.js";
import { formatTextOutput } from "../zk/output.js";
import { NotebookOverride, NoteRef, READ_ONLY, ZK_NAMESPACE } from "../zk/schemas.js";
import { resolveNotebookPath } from "../zk/validate.js";
import { renderToolCall, renderToolResultText } from "./common.js";

export const ReadNoteParams = Type.Object({
	path: NoteRef,
	notebook: NotebookOverride,
});

const ReadNoteOutput = Type.Object({
	path: Type.String(),
	absolutePath: Type.String(),
	notebook: Type.String(),
	bytes: Type.Integer(),
	content: Type.String({ description: "Note text, cut at 50KB when `truncated` is true." }),
	truncated: Type.Boolean(),
	fullOutputPath: Type.Optional(Type.String({ description: "Temp file with the full text when truncated." })),
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
			outputSchema: ReadNoteOutput,
			namespace: ZK_NAMESPACE,
			annotations: READ_ONLY,
			promptSnippet: "zk_read_note: Read a single note's contents by notebook-relative path.",
			promptGuidelines: [
				"Use zk_read_note rather than the generic read tool when the file is a zk note, to keep paths notebook-scoped.",
				"Use notebook-relative paths returned by search, tagless, last-modified, random, or link tools.",
				"Read selected notes before answering content questions or editing note text.",
			],
			async execute(_toolCallId, params: ReadNoteArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const absolutePath = resolveNotebookPath(notebook.path, params.path);
				if (signal?.aborted) throw new Error("read aborted");

				const text = await readFile(absolutePath, "utf8").catch((error: NodeJS.ErrnoException) => {
					if (error.code !== "ENOENT") throw error;
					throw new Error(`Note not found: ${params.path}`);
				});
				const formatted = await formatTextOutput({ text, prefix: "pi-zk-read-" });

				const details: ReadNoteDetails = {
					path: params.path,
					absolutePath,
					notebook: notebook.path,
					bytes: Buffer.byteLength(text, "utf8"),
					truncated: formatted.truncated,
					fullOutputPath: formatted.fullOutputPath,
				};

				const structuredContent = {
					path: details.path,
					absolutePath,
					notebook: notebook.path,
					bytes: details.bytes,
					content: formatted.visible,
					truncated: formatted.truncated,
					...(formatted.fullOutputPath ? { fullOutputPath: formatted.fullOutputPath } : {}),
				};
				return { content: [{ type: "text", text: formatted.visible }], details, structuredContent };
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
