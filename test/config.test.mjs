import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNotebook, NotebookNotFoundError } from "../src/zk/config.ts";

function makeFs(paths) {
	const set = new Set(paths);
	return (p) => set.has(p);
}

test("ZK_NOTEBOOK_DIR takes highest precedence", () => {
	const result = resolveNotebook({
		cwd: "/tmp/somewhere",
		env: { ZK_NOTEBOOK_DIR: "/notes/a", ZK_DIR: "/notes/b" },
		exists: () => true,
	});
	assert.equal(result.source, "env_zk_notebook_dir");
	assert.equal(result.path, "/notes/a");
});

test("ZK_DIR is used when ZK_NOTEBOOK_DIR is unset", () => {
	const result = resolveNotebook({
		cwd: "/tmp",
		env: { ZK_DIR: "/notes/b" },
		exists: () => true,
	});
	assert.equal(result.source, "env_zk_dir");
	assert.equal(result.path, "/notes/b");
});

test("cwd containing .zk resolves to itself", () => {
	const result = resolveNotebook({
		cwd: "/notes/c",
		env: {},
		exists: makeFs(["/notes/c/.zk"]),
	});
	assert.equal(result.source, "cwd");
	assert.equal(result.path, "/notes/c");
});

test("walks up to find ancestor .zk", () => {
	const result = resolveNotebook({
		cwd: "/notes/c/journal/2026",
		env: {},
		exists: makeFs(["/notes/c/.zk"]),
	});
	assert.equal(result.source, "walk_up");
	assert.equal(result.path, "/notes/c");
});

test("throws NotebookNotFoundError when nothing matches", () => {
	assert.throws(
		() =>
			resolveNotebook({
				cwd: "/elsewhere",
				env: {},
				exists: () => false,
			}),
		NotebookNotFoundError,
	);
});

test("trims whitespace from env values", () => {
	const result = resolveNotebook({
		cwd: "/tmp",
		env: { ZK_NOTEBOOK_DIR: "  /notes/a  " },
		exists: () => true,
	});
	assert.equal(result.path, "/notes/a");
});

test("blank env values are ignored", () => {
	const result = resolveNotebook({
		cwd: "/notes/c",
		env: { ZK_NOTEBOOK_DIR: "   ", ZK_DIR: "" },
		exists: makeFs(["/notes/c/.zk"]),
	});
	assert.equal(result.source, "cwd");
});
