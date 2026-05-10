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
import { runZk } from "./zk/client.js";
import { resolveNotebook } from "./zk/config.js";
import { NoteCache } from "./zk/note-cache.js";
import { withNotebookFlag } from "./zk/notebook.js";
import { NOTE_LIST_FORMAT, parseNoteList } from "./zk/parsers.js";

const MUTATING_TOOLS = new Set(["zk_create_note", "zk_edit_note", "zk_append_note"]);

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

	function getOrCreateCache(notebookPath: string, cwd: string): NoteCache {
		const existing = cachesByNotebook.get(notebookPath);
		if (existing) return existing;
		const cache = new NoteCache({
			load: async () => {
				const args = withNotebookFlag(notebookPath, [
					"list",
					"--quiet",
					"--no-pager",
					"--sort",
					"modified-",
					"--limit",
					"500",
					"--format",
					NOTE_LIST_FORMAT,
				]);
				const result = await runZk({ cwd, args, timeoutMs: 10_000 });
				return parseNoteList(result.stdout);
			},
		});
		cachesByNotebook.set(notebookPath, cache);
		return cache;
	}

	pi.on("session_start", async (_event, ctx) => {
		let notebook;
		try {
			notebook = resolveNotebook({ cwd: ctx.cwd });
		} catch {
			// No notebook in scope - skip wikilink autocomplete silently.
			return;
		}
		const cache = getOrCreateCache(notebook.path, ctx.cwd);
		void cache.get(); // warm in background
		ctx.ui.addAutocompleteProvider((current) =>
			createWikilinkAutocompleteProvider(current, () => cache.get()),
		);
	});

	pi.on("tool_result", (event) => {
		if (!MUTATING_TOOLS.has(event.toolName) || event.isError) return;
		const details = event.details as { notebook?: unknown } | undefined;
		const notebook = typeof details?.notebook === "string" ? details.notebook : undefined;
		if (!notebook) return;
		cachesByNotebook.get(notebook)?.invalidate();
	});
}
