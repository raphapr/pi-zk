import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWikilinkAutocompleteProvider } from "./autocomplete/wikilinks.js";
import { registerAppendNoteTool } from "./tools/append-note.js";
import { registerCreateNoteTool } from "./tools/create-note.js";
import { registerEditNoteTool } from "./tools/edit-note.js";
import { registerLastModifiedTool } from "./tools/last-modified.js";
import { registerLinkedByTool, registerLinkToTool, registerRelatedTool } from "./tools/link-graph.js";
import { registerListTagsTool } from "./tools/list-tags.js";
import { registerRandomNoteTool } from "./tools/random-note.js";
import { registerReadNoteTool } from "./tools/read-note.js";
import { registerSearchNotesTool } from "./tools/search-notes.js";
import { registerTaglessNotesTool } from "./tools/tagless-notes.js";
import type { NotebookResolution } from "./zk/config.js";
import { buildZkGuidance, ZK_GUIDANCE_SECTION } from "./zk/guidance.js";
import { NoteCache, resolveAutocompleteLimit } from "./zk/note-cache.js";
import { resolveActiveNotebook, runZkInNotebook } from "./zk/notebook.js";
import { NOTE_LIST_FORMAT, parseNoteList } from "./zk/parsers.js";

const MUTATING_TOOLS = new Set(["zk_create_note", "zk_edit_note", "zk_append_note"]);

/**
 * Fit the declared tools to the session. Without a notebook the zk tools are
 * dead weight in every request, so they are withdrawn. With one, `tool_search`
 * is switched on so the model can reach the deferred zk tools.
 */
export function syncActiveTools(
	pi: Pick<ExtensionAPI, "getActiveTools" | "getAllTools" | "setActiveTools">,
	hasNotebook: boolean,
): void {
	const active = pi.getActiveTools();
	if (!hasNotebook) {
		const next = active.filter((name) => !name.startsWith("zk_"));
		if (next.length !== active.length) pi.setActiveTools(next);
		return;
	}
	if (active.includes("tool_search")) return;
	if (pi.getAllTools().some((tool) => tool.name === "tool_search")) {
		pi.setActiveTools([...active, "tool_search"]);
	}
}

export default function pizkExtension(pi: ExtensionAPI): void {
	registerSearchNotesTool(pi);
	registerReadNoteTool(pi);
	registerListTagsTool(pi);
	registerLastModifiedTool(pi);
	registerTaglessNotesTool(pi);
	registerRandomNoteTool(pi);
	registerLinkToTool(pi);
	registerLinkedByTool(pi);
	registerRelatedTool(pi);
	registerCreateNoteTool(pi);
	registerEditNoteTool(pi);
	registerAppendNoteTool(pi);

	// Per-notebook note caches. Shared across sessions in the same Pi process so
	// `/reload` and session forks reuse the warm cache.
	const cachesByNotebook = new Map<string, NoteCache>();
	let activeNotebook: NotebookResolution | undefined;

	function getOrCreateCache(notebookPath: string): NoteCache {
		const existing = cachesByNotebook.get(notebookPath);
		if (existing) return existing;
		const cache = new NoteCache({
			load: async () => {
				const args = [
					"list",
					"--quiet",
					"--no-pager",
					"--sort",
					"modified-",
					"--limit",
					String(resolveAutocompleteLimit()),
					"--format",
					NOTE_LIST_FORMAT,
				];
				const result = await runZkInNotebook(notebookPath, args, { timeoutMs: 10_000 });
				return parseNoteList(result.stdout);
			},
		});
		cachesByNotebook.set(notebookPath, cache);
		return cache;
	}

	pi.on("session_start", async (_event, ctx) => {
		let notebook: NotebookResolution;
		try {
			notebook = resolveActiveNotebook({ cwd: ctx.cwd });
		} catch {
			// No notebook in scope - skip wikilink autocomplete and guidance silently.
			activeNotebook = undefined;
			syncActiveTools(pi, false);
			return;
		}
		activeNotebook = notebook;
		syncActiveTools(pi, true);
		const cache = getOrCreateCache(notebook.path);
		void cache.get(); // warm in background
		ctx.ui.addAutocompleteProvider((current) =>
			createWikilinkAutocompleteProvider(current, () => cache.get()),
		);
	});

	pi.on("before_agent_start", (event) => {
		if (!activeNotebook) return;
		// A section, not a returned systemPrompt: pi patches only this section
		// instead of replacing (and re-caching) the whole prompt.
		event.systemPromptOptions.sections[ZK_GUIDANCE_SECTION] = buildZkGuidance(activeNotebook);
	});

	pi.on("tool_result", (event) => {
		if (!MUTATING_TOOLS.has(event.toolName) || event.isError) return;
		const details = event.details as { notebook?: unknown } | undefined;
		const notebook = typeof details?.notebook === "string" ? details.notebook : undefined;
		if (!notebook) return;
		cachesByNotebook.get(notebook)?.invalidate();
	});
}
