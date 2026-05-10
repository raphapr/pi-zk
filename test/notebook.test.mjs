import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveNotebook, withNotebookFlag } from "../src/zk/notebook.ts";

test("resolveActiveNotebook uses override when provided", () => {
	const result = resolveActiveNotebook({
		cwd: "/home/user/project",
		override: "/notes/zk",
		env: { ZK_NOTEBOOK_DIR: "/should/be/ignored" },
	});
	assert.equal(result.path, "/notes/zk");
});

test("resolveActiveNotebook resolves relative overrides against cwd", () => {
	const result = resolveActiveNotebook({
		cwd: "/home/user/project",
		override: "../notes",
		env: {},
	});
	assert.equal(result.path, "/home/user/notes");
});

test("resolveActiveNotebook falls back to env-based resolution", () => {
	const result = resolveActiveNotebook({
		cwd: "/tmp",
		env: { ZK_NOTEBOOK_DIR: "/notes/zk" },
	});
	assert.equal(result.source, "env_zk_notebook_dir");
	assert.equal(result.path, "/notes/zk");
});

test("withNotebookFlag prepends --notebook-dir", () => {
	assert.deepEqual(withNotebookFlag("/notes", ["list", "--limit", "5"]), [
		"--notebook-dir",
		"/notes",
		"list",
		"--limit",
		"5",
	]);
});
