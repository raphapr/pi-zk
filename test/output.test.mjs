import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatTextOutput, renderNoteListText, renderTagListText } from "../src/zk/output.ts";

test("renderNoteListText returns plural-aware count header", () => {
	const text = renderNoteListText([
		{ path: "a.md", title: "A", tags: [] },
		{ path: "b.md", title: "B", tags: ["x"] },
	]);
	assert.match(text, /^Found 2 notes:/);
	assert.match(text, /a.md\tA/);
	assert.match(text, /b.md\tB\s+\[x\]/);
});

test("renderNoteListText handles empty list", () => {
	assert.equal(renderNoteListText([], 0), "Found 0 notes.");
});

test("renderNoteListText respects explicit count override", () => {
	const text = renderNoteListText([{ path: "a.md", title: "A", tags: [] }], 7);
	assert.match(text, /^Found 7 notes:/);
});

test("renderTagListText sorts by caller-supplied order", () => {
	const text = renderTagListText([
		{ name: "work", count: 12 },
		{ name: "deep", count: 3 },
	]);
	assert.match(text, /Found 2 tags:/);
	assert.match(text, /work \(12\)/);
	assert.match(text, /deep \(3\)/);
});

test("renderTagListText handles empty list", () => {
	assert.equal(renderTagListText([]), "No tags in notebook.");
});

test("formatTextOutput returns content unchanged when below limits", async () => {
	const result = await formatTextOutput({ text: "small content\nsecond line" });
	assert.equal(result.truncated, false);
	assert.equal(result.visible, "small content\nsecond line");
});

test("formatTextOutput truncates and writes a temp file", async () => {
	const big = "x".repeat(60_000); // bigger than DEFAULT_MAX_BYTES (50KB)
	const result = await formatTextOutput({ text: big, prefix: "pi-zk-output-test-" });
	assert.equal(result.truncated, true);
	assert.ok(result.fullOutputPath, "expected temp file path");
	assert.match(result.visible, /\[Output truncated/);
	const written = await readFile(result.fullOutputPath, "utf8");
	assert.equal(written.length, big.length);
});
