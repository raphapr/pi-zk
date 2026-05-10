import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdits, buildAppendPayload } from "../src/zk/edits.ts";
import { ValidationError } from "../src/zk/validate.ts";

test("applyEdits replaces a single unique match", () => {
	const result = applyEdits("hello world", [{ oldText: "world", newText: "moon" }]);
	assert.equal(result.content, "hello moon");
	assert.equal(result.applied, 1);
});

test("applyEdits applies edits sequentially against evolving content", () => {
	const result = applyEdits("a then b then c", [
		{ oldText: "a then", newText: "A then" },
		{ oldText: "then c", newText: "then C" },
	]);
	assert.equal(result.content, "A then b then C");
	assert.equal(result.applied, 2);
});

test("applyEdits rejects empty edits array", () => {
	assert.throws(() => applyEdits("x", []), ValidationError);
});

test("applyEdits rejects empty oldText", () => {
	assert.throws(() => applyEdits("hello", [{ oldText: "", newText: "x" }]), ValidationError);
});

test("applyEdits rejects no-op edits", () => {
	assert.throws(() => applyEdits("hello", [{ oldText: "hello", newText: "hello" }]), ValidationError);
});

test("applyEdits errors when oldText is missing", () => {
	assert.throws(
		() => applyEdits("hello world", [{ oldText: "moon", newText: "x" }]),
		/edit 1: oldText not found/,
	);
});

test("applyEdits errors on ambiguous match with helpful guidance", () => {
	assert.throws(
		() => applyEdits("foo foo foo", [{ oldText: "foo", newText: "bar" }]),
		/appears 3 times/,
	);
});

test("applyEdits supports deletion via empty newText", () => {
	const result = applyEdits("hello world\n", [{ oldText: " world", newText: "" }]);
	assert.equal(result.content, "hello\n");
});

test("applyEdits reports the failing edit index", () => {
	assert.throws(
		() =>
			applyEdits("a b c", [
				{ oldText: "a", newText: "A" },
				{ oldText: "zzz", newText: "x" },
			]),
		/edit 2: oldText not found/,
	);
});

test("buildAppendPayload starts file with content when empty", () => {
	assert.equal(buildAppendPayload("", "hello", true), "hello\n");
});

test("buildAppendPayload adds blank line when file ends with single newline", () => {
	assert.equal(buildAppendPayload("first\n", "second", true), "\nsecond\n");
});

test("buildAppendPayload skips blank line when file already ends with two newlines", () => {
	assert.equal(buildAppendPayload("first\n\n", "second", true), "second\n");
});

test("buildAppendPayload adds two newlines when file has no trailing newline", () => {
	assert.equal(buildAppendPayload("first", "second", true), "\n\nsecond\n");
});

test("buildAppendPayload without ensureBlankLine just appends", () => {
	assert.equal(buildAppendPayload("first\n", "second", false), "second\n");
});

test("buildAppendPayload without ensureBlankLine adds newline when missing", () => {
	assert.equal(buildAppendPayload("first", "second", false), "\nsecond\n");
});

test("buildAppendPayload preserves a trailing newline in content", () => {
	assert.equal(buildAppendPayload("first\n", "second\n", true), "\nsecond\n");
});
