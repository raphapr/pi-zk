import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZkGuidance, DEFERRED_ZK_TOOLS } from "../src/zk/guidance.ts";

test("buildZkGuidance includes notebook path and source", () => {
	const text = buildZkGuidance({ path: "/notes/journal", source: "walk_up" });
	assert.match(text, /\/notes\/journal/);
	assert.match(text, /walk_up/);
});

test("buildZkGuidance routes note work to the zk tools", () => {
	const text = buildZkGuidance({ path: "/notes", source: "cwd" });
	assert.match(text, /Prefer the `zk_\*` tools/);
});

test("buildZkGuidance names the deferred tools and how to reach them", () => {
	const text = buildZkGuidance({ path: "/notes", source: "env_zk_notebook_dir" });
	for (const name of DEFERRED_ZK_TOOLS) {
		assert.ok(text.includes(name), `expected guidance to mention ${name}`);
	}
	assert.match(text, /tool_search/);
});

test("buildZkGuidance leaves per-tool routing to promptGuidelines", () => {
	const text = buildZkGuidance({ path: "/notes", source: "cwd" });
	assert.ok(!text.includes("zk_search_notes"));
	assert.ok(!text.includes("zk_edit_note"));
});

test("buildZkGuidance mentions wikilink autocomplete", () => {
	const text = buildZkGuidance({ path: "/notes", source: "cwd" });
	assert.match(text, /\[\[partial/);
});
