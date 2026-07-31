import { appendFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { runZk } from "../zk/client.js";
import { resolveActiveNotebook, withNotebookFlag } from "../zk/notebook.js";
import { NotebookOverride } from "../zk/schemas.js";
import {
	resolveCreatableNotebookPath,
	resolveNotebookPath,
	validateRelativeDirectory,
	validateTitle,
	ValidationError,
} from "../zk/validate.js";
import { renderToolCall, renderToolResultText } from "./common.js";

export const CreateNoteParams = Type.Object({
	title: Type.String({ description: "Note title. 1-200 chars, no path separators, no control characters." }),
	directory: Type.Optional(
		Type.String({
			description: "Optional notebook-relative subdirectory to place the note in (e.g. `journal/daily`).",
		}),
	),
	template: Type.Optional(Type.String({ description: "Name of the zk template to use." })),
	content: Type.Optional(
		Type.String({
			description: "Optional markdown content to append after or replace the template output.",
		}),
	),
	content_mode: Type.Optional(
		StringEnum(["append", "replace"] as const, {
			description: "How to apply content: append after the template (default) or replace the template output.",
		}),
	),
	notebook: NotebookOverride,
});

export type CreateNoteArgs = Static<typeof CreateNoteParams>;

/**
 * Build the `zk new` argv (without `--notebook-dir`). `--print-path` makes zk
 * emit the absolute path on stdout instead of opening an editor.
 */
export function buildCreateNoteArgs(params: { title: string; directory?: string; template?: string }): string[] {
	const args = ["new", "--print-path", "--title", params.title];
	if (params.template) args.push("--template", params.template);
	if (params.directory) args.push(params.directory);
	return args;
}

interface CreateNoteDetails {
	path: string;
	absolutePath: string;
	title: string;
	notebook: string;
	template?: string;
	directory?: string;
	contentAppended?: number;
	contentReplaced?: number;
}

/**
 * Override editor-related env so `zk new` cannot open an interactive editor
 * even when the user's zk config or env asks for one.
 */
function noEditorEnv(): NodeJS.ProcessEnv {
	return {
		ZK_EDITOR: "true",
		EDITOR: "true",
		VISUAL: "true",
	};
}

export function registerCreateNoteTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_create_note",
			label: "zk Create",
			description: "Create a new zk note via `zk new`. Returns the notebook-relative path. Content can append after or replace the template output.",
			parameters: CreateNoteParams,
			promptSnippet:
				"zk_create_note: Create a new note (optionally inside a subdirectory, with a template, and with a content body).",
			promptGuidelines: [
				"Search first when the user references existing content; skip search for clearly new notes.",
				"Use zk_create_note instead of writing markdown files by hand so zk's filename/ID rules and templates apply.",
				"Use directory and template only when the user provides them or the notebook convention is clear.",
				"Use zk_create_note content_mode=replace when supplied content must replace the generated template output.",
				"After creation, use zk_edit_note or zk_append_note for further changes rather than re-creating the file.",
			],
			async execute(_toolCallId, params: CreateNoteArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const title = validateTitle(params.title);
				const directory = params.directory ? validateRelativeDirectory(params.directory) : undefined;

				// zk new fails when the target directory does not exist. Auto-create so
				// users don't have to pre-mkdir for new sections of the notebook.
				if (directory) {
					const absDir = resolveCreatableNotebookPath(notebook.path, directory);
					await mkdir(absDir, { recursive: true });
				}

				const args = withNotebookFlag(
					notebook.path,
					buildCreateNoteArgs({ title, directory, template: params.template }),
				);
				const result = await runZk({
					cwd: notebook.path,
					args,
					signal,
					timeoutMs: 15_000,
					env: { ...process.env, ...noEditorEnv() },
				});

				const printedPath = result.stdout.trim().split("\n").pop()?.trim();
				if (!printedPath) {
					throw new ValidationError("zk new did not print a path - check zk config and templates.");
				}

				const absolutePath = isAbsolute(printedPath)
					? resolveNotebookPath(notebook.path, printedPath)
					: resolveNotebookPath(notebook.path, resolve(notebook.path, printedPath));
				const notebookRoot = await realpath(notebook.path).catch(() => resolve(notebook.path));
				const relativePath = relative(notebookRoot, absolutePath);

				let contentAppended: number | undefined;
				let contentReplaced: number | undefined;
				if (params.content !== undefined && (params.content.length > 0 || params.content_mode === "replace")) {
					const payload = params.content && !params.content.endsWith("\n") ? `${params.content}\n` : params.content;
					const bytes = Buffer.byteLength(payload, "utf8");
					await withFileMutationQueue(absolutePath, async () => {
						if (params.content_mode === "replace") await writeFile(absolutePath, payload, "utf8");
						else await appendFile(absolutePath, payload, "utf8");
					});
					if (params.content_mode === "replace") contentReplaced = bytes;
					else contentAppended = bytes;
				}

				const details: CreateNoteDetails = {
					path: relativePath,
					absolutePath,
					title,
					notebook: notebook.path,
					template: params.template,
					directory,
					contentAppended,
					contentReplaced,
				};

				const summary = [
					`Created ${relativePath}`,
					`Title: ${title}`,
					params.template ? `Template: ${params.template}` : undefined,
					directory ? `Directory: ${directory}` : undefined,
					contentAppended !== undefined ? `Appended ${contentAppended} bytes of content.` : undefined,
					contentReplaced !== undefined ? `Replaced template output with ${contentReplaced} bytes of content.` : undefined,
				]
					.filter(Boolean)
					.join("\n");

				return { content: [{ type: "text", text: summary }], details };
			},
			renderCall(args, theme) {
				const summary = [args.title, args.directory ? `(${args.directory})` : undefined]
					.filter(Boolean)
					.join(" ");
				return renderToolCall(theme, "zk_create_note", summary);
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as Partial<CreateNoteDetails> | undefined;
				if (!details || typeof details.path !== "string") {
					const text = result.content.find((item) => item.type === "text")?.text?.trim();
					return renderToolResultText(theme, { status: text || "failed to create note", tone: "error" }, expanded);
				}
				const status = `→ ${details.path}`;
				const body = details.contentReplaced !== undefined
					? `Replaced with ${details.contentReplaced} bytes`
					: details.contentAppended !== undefined
						? `Appended ${details.contentAppended} bytes`
						: undefined;
				return renderToolResultText(theme, { status, body }, expanded);
			},
		}),
	);
}
