import { test } from "node:test";
import assert from "node:assert/strict";
import {
	resolveZkBinary,
	buildZkEnv,
	formatCommand,
	shellQuote,
	missingZkMessage,
	isNotebookMissing,
} from "../src/zk/client.ts";

test("resolveZkBinary prefers ZK_BIN env var", () => {
	const bin = resolveZkBinary({ env: { ZK_BIN: "/opt/zk-custom" } });
	assert.equal(bin, "/opt/zk-custom");
});

test("resolveZkBinary trims whitespace from ZK_BIN", () => {
	const bin = resolveZkBinary({ env: { ZK_BIN: "  /opt/zk-custom  " } });
	assert.equal(bin, "/opt/zk-custom");
});

test("resolveZkBinary falls back to ~/.local/bin/zk when present", () => {
	const bin = resolveZkBinary({
		env: {},
		home: "/home/test",
		exists: (p) => p === "/home/test/.local/bin/zk",
	});
	assert.equal(bin, "/home/test/.local/bin/zk");
});

test("resolveZkBinary falls back to PATH lookup", () => {
	const bin = resolveZkBinary({ env: {}, home: "/home/test", exists: () => false });
	assert.equal(bin, "zk");
});

test("buildZkEnv forces plain output", () => {
	const env = buildZkEnv({ EXISTING: "1" });
	assert.equal(env.EXISTING, "1");
	assert.equal(env.NO_COLOR, "1");
	assert.equal(env.TERM, "dumb");
});

test("shellQuote leaves safe values bare", () => {
	assert.equal(shellQuote("path/to/file.md"), "path/to/file.md");
});

test("shellQuote quotes values with spaces or special chars", () => {
	assert.equal(shellQuote("two words"), '"two words"');
	assert.equal(shellQuote('with"quote'), '"with\\"quote"');
});

test("formatCommand joins bin and args using shell quoting", () => {
	assert.equal(formatCommand("zk", ["list", "--tag", "weekly review"]), 'zk list --tag "weekly review"');
});

test("missingZkMessage mentions install and PATH", () => {
	const msg = missingZkMessage();
	assert.match(msg, /zk/);
	assert.match(msg, /PATH/);
});

test("isNotebookMissing detects zk's error wording", () => {
	assert.equal(isNotebookMissing({ stdout: "", stderr: "zk: no notebook found" }), true);
	assert.equal(isNotebookMissing({ stdout: "", stderr: "zk: not in a notebook" }), true);
	assert.equal(isNotebookMissing({ stdout: "Found 12 notes", stderr: "" }), false);
});
