import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pizkExtension, { syncActiveTools } from "../src/index.ts";

function fakeTools(active, all = active) {
	const state = { active: [...active], sets: 0 };
	return {
		state,
		getActiveTools: () => [...state.active],
		getAllTools: () => all.map((name) => ({ name })),
		setActiveTools(names) {
			state.active = [...names];
			state.sets += 1;
		},
	};
}

test("syncActiveTools withdraws zk tools when no notebook is in scope", () => {
	const pi = fakeTools(["read", "zk_search_notes", "zk_edit_note"]);
	syncActiveTools(pi, false);
	assert.deepEqual(pi.state.active, ["read"]);
});

test("syncActiveTools activates tool_search when a notebook is in scope", () => {
	const pi = fakeTools(["read", "zk_search_notes"], ["read", "zk_search_notes", "tool_search"]);
	syncActiveTools(pi, true);
	assert.deepEqual(pi.state.active, ["read", "zk_search_notes", "tool_search"]);
});

test("syncActiveTools leaves the set alone when nothing needs to change", () => {
	const withoutSearch = fakeTools(["read", "zk_search_notes"]);
	syncActiveTools(withoutSearch, true);
	const noZk = fakeTools(["read"]);
	syncActiveTools(noZk, false);
	assert.equal(withoutSearch.state.sets + noZk.state.sets, 0);
});

function loadExtension() {
	const handlers = {};
	const tools = [];
	const pi = {
		...fakeTools([]),
		on(event, handler) {
			handlers[event] = handler;
		},
		registerTool(def) {
			tools.push(def);
		},
	};
	pizkExtension(pi);
	return { handlers, tools };
}

test("tools declare namespace, annotations, output schema, and exposure", () => {
	const { tools } = loadExtension();
	assert.equal(tools.length, 12);
	const writers = new Set(["zk_create_note", "zk_edit_note", "zk_append_note"]);
	const deferred = new Set(["zk_random_note", "zk_tagless_notes", "zk_related"]);
	for (const tool of tools) {
		assert.equal(tool.namespace?.name, "zk", tool.name);
		assert.ok(tool.outputSchema, `${tool.name} outputSchema`);
		assert.equal(tool.annotations?.readOnlyHint, !writers.has(tool.name), tool.name);
		assert.equal(tool.executionMode, writers.has(tool.name) ? "sequential" : undefined, tool.name);
		assert.equal((tool.exposure ?? "direct") === "deferred", deferred.has(tool.name), tool.name);
	}
});

test("guidance is added as a prompt section, not a replaced system prompt", async () => {
	const notebook = await mkdtemp(join(tmpdir(), "pi-zk-ext-"));
	await mkdir(join(notebook, ".zk"));
	const saved = { dir: process.env.ZK_NOTEBOOK_DIR, zkDir: process.env.ZK_DIR };
	delete process.env.ZK_NOTEBOOK_DIR;
	delete process.env.ZK_DIR;
	try {
		const { handlers } = loadExtension();
		await handlers.session_start({}, { cwd: notebook, ui: { addAutocompleteProvider() {} } });
		const event = { systemPrompt: "base", systemPromptOptions: { sections: {} } };
		const result = handlers.before_agent_start(event);
		assert.equal(result, undefined);
		assert.match(event.systemPromptOptions.sections.zk_notebook, /zk notebook is in scope/);
	} finally {
		if (saved.dir !== undefined) process.env.ZK_NOTEBOOK_DIR = saved.dir;
		if (saved.zkDir !== undefined) process.env.ZK_DIR = saved.zkDir;
		await rm(notebook, { recursive: true, force: true });
	}
});
