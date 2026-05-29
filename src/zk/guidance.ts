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
		"- Discovery: use `zk_search_notes` when the note path is unknown. Combine match, tags, paths, or date filters when the user provides them.",
		"- Reading: use `zk_read_note` after search, tagless, last-modified, random, or link tools return candidate paths. Do not answer content questions from search results alone.",
		"- Triage: use `zk_list_tags` for tag taxonomy, `zk_tagless_notes` for missing tags, `zk_last_modified` to resume recent work, and `zk_random_note` for serendipitous review.",
		"- Links: use `zk_link_to` for backlinks, `zk_linked_by` for outbound links, and `zk_related` for candidate links. Verify references before editing wikilinks.",
		"- Writing: use `zk_create_note` for new notes, `zk_append_note` for logs or additions, and `zk_edit_note` only for precise replacements.",
		"- Before editing, read the target note and prefer the smallest safe change.",
		"- Wikilink autocomplete is active: typing `[[partial` suggests existing notes by stem, title, or tag.",
	].join("\n");
}
