import type { NotebookResolution } from "./config.js";

export const ZK_GUIDANCE_SECTION = "zk_notebook";

/** Tools registered with `exposure: "deferred"`: undeclared until `tool_search` loads them. */
export const DEFERRED_ZK_TOOLS = ["zk_random_note", "zk_tagless_notes", "zk_related"] as const;

/**
 * System prompt section added when a zk notebook is in scope. Carries only
 * what the per-tool `promptGuidelines` cannot: where the notebook is, the
 * general routing preference, and the tools that are not declared yet.
 */
export function buildZkGuidance(notebook: NotebookResolution): string {
	return [
		`A zk notebook is in scope at \`${notebook.path}\` (resolved via ${notebook.source}).`,
		"- Prefer the `zk_*` tools over generic bash/edit/read when working with notes in the notebook.",
		`- ${DEFERRED_ZK_TOOLS.map((name) => `\`${name}\``).join(", ")} are not declared by default; find them with \`tool_search\` or call them from a codemode script.`,
		"- Wikilink autocomplete is active: typing `[[partial` suggests existing notes by stem, title, or tag.",
	].join("\n");
}
