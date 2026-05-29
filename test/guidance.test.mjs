import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZkGuidance } from "../src/zk/guidance.ts";

test("buildZkGuidance includes notebook path and source", () => {
	const text = buildZkGuidance({ path: "/notes/journal", source: "walk_up" });
	assert.match(text, /\/notes\/journal/);
	assert.match(text, /walk_up/);
});

test("buildZkGuidance mentions key tools by name", () => {
	const text = buildZkGuidance({ path: "/notes", source: "env_zk_notebook_dir" });
	for (const name of [
		"zk_search_notes",
		"zk_read_note",
		"zk_list_tags",
		"zk_tagless_notes",
		"zk_last_modified",
		"zk_random_note",
		"zk_create_note",
		"zk_edit_note",
		"zk_append_note",
		"zk_link_to",
		"zk_linked_by",
		"zk_related",
	]) {
		assert.ok(text.includes(name), `expected guidance to mention ${name}`);
	}
});

test("buildZkGuidance gives safe read and edit routing", () => {
	const text = buildZkGuidance({ path: "/notes", source: "cwd" });
	assert.match(text, /Do not answer content questions from search results alone/);
	assert.match(text, /Before editing, read the target note/);
});

test("buildZkGuidance mentions wikilink autocomplete", () => {
	const text = buildZkGuidance({ path: "/notes", source: "cwd" });
	assert.match(text, /\[\[partial/);
});
