import type { NotebookResolution } from "./config.js";

/**
 * Lines appended to the system prompt when a zk notebook is in scope. Tells
 * the LLM the notebook is detected and routes note-related operations to the
 * pi-zk tools instead of generic file ops.
 */
export function buildZkGuidance(notebook: NotebookResolution): string {
	return [
		"# pi-zk notebook guidance",
		"",
		`A zk notebook is in scope at \`${notebook.path}\` (resolved via ${notebook.source}).`,
		"",
		"Routing rules for this session:",
		"- Prefer pi-zk tools over generic bash/edit/read when working with notes in the notebook.",
		"- Use `zk_search_notes` before reading notes to discover candidate paths and titles.",
		"- Use `zk_read_note` (notebook-relative paths) instead of the generic read tool for notes.",
		"- Use `zk_create_note` instead of `write` so zk's filename/ID rules and templates apply.",
		"- Use `zk_edit_note` for surgical text changes and `zk_append_note` for log-style additions.",
		"- Use `zk_link_to`, `zk_linked_by`, and `zk_related` to navigate the link graph.",
		"- Wikilink autocomplete is active: typing `[[partial` suggests existing notes by stem, title, or tag.",
	].join("\n");
}
