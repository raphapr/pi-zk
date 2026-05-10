import { readFile, writeFile } from "node:fs/promises";
import { defineTool, type ExtensionAPI, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { applyEdits } from "../zk/edits.js";
import { resolveActiveNotebook } from "../zk/notebook.js";
import { NotebookOverride, NoteRef } from "../zk/schemas.js";
import { resolveNotebookPath } from "../zk/validate.js";
import { renderToolCall, renderToolResultText } from "./common.js";

const EditEntry = Type.Object({
	oldText: Type.String({ description: "Exact text to find. Must occur exactly once after prior edits in this call." }),
	newText: Type.String({ description: "Replacement text. Use an empty string to delete." }),
});

export const EditNoteParams = Type.Object({
	path: NoteRef,
	edits: Type.Array(EditEntry, { minItems: 1, description: "Sequential exact-match replacements applied in order." }),
	notebook: NotebookOverride,
});

export type EditNoteArgs = Static<typeof EditNoteParams>;

interface EditNoteDetails {
	path: string;
	absolutePath: string;
	notebook: string;
	editsApplied: number;
	bytesBefore: number;
	bytesAfter: number;
}

export function registerEditNoteTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_edit_note",
			label: "zk Edit",
			description:
				"Apply exact text-replacement edits to a zk note. Each oldText must match exactly once in the current content; provide surrounding context to anchor unique edits.",
			parameters: EditNoteParams,
			promptSnippet:
				"zk_edit_note: Apply exact text replacements to a note. Use unique surrounding context for each oldText.",
			promptGuidelines: [
				"Prefer zk_edit_note over re-writing the entire note when you only need to change a few spots.",
				"For each edit, include enough surrounding context that oldText matches exactly once.",
				"To append content rather than replace inline, use zk_append_note.",
			],
			async execute(_toolCallId, params: EditNoteArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const absolutePath = resolveNotebookPath(notebook.path, params.path);
				if (signal?.aborted) throw new Error("edit aborted");

				const details = await withFileMutationQueue(absolutePath, async () => {
					const before = await readFile(absolutePath, "utf8");
					const result = applyEdits(before, params.edits);
					await writeFile(absolutePath, result.content, "utf8");
					return {
						path: params.path,
						absolutePath,
						notebook: notebook.path,
						editsApplied: result.applied,
						bytesBefore: Buffer.byteLength(before, "utf8"),
						bytesAfter: Buffer.byteLength(result.content, "utf8"),
					} satisfies EditNoteDetails;
				});

				const summary = [
					`Edited ${details.path}`,
					`${details.editsApplied} edit${details.editsApplied === 1 ? "" : "s"} applied`,
					`${details.bytesBefore} → ${details.bytesAfter} bytes`,
				].join("\n");

				return { content: [{ type: "text", text: summary }], details };
			},
			renderCall(args, theme) {
				return renderToolCall(theme, "zk_edit_note", `${args.path} (${args.edits.length} edit${args.edits.length === 1 ? "" : "s"})`);
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as EditNoteDetails | undefined;
				if (!details) return renderToolResultText(theme, { status: "edited" }, expanded);
				const status = `${details.editsApplied} edit${details.editsApplied === 1 ? "" : "s"} → ${details.path}`;
				return renderToolResultText(theme, { status }, expanded);
			},
		}),
	);
}
