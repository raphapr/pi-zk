import { test } from "node:test";
import assert from "node:assert/strict";
import {
	validateTitle,
	validateRelativeDirectory,
	validateNoteRef,
	resolveNotebookPath,
	ValidationError,
} from "../src/zk/validate.ts";

test("validateTitle accepts a normal title", () => {
	assert.equal(validateTitle("Weekly review 2026-W19"), "Weekly review 2026-W19");
});

test("validateTitle trims surrounding whitespace", () => {
	assert.equal(validateTitle("  hello  "), "hello");
});

test("validateTitle rejects empty input", () => {
	assert.throws(() => validateTitle("   "), ValidationError);
});

test("validateTitle rejects control characters", () => {
	assert.throws(() => validateTitle("bad\x07title"), ValidationError);
});

test("validateTitle rejects path separators", () => {
	assert.throws(() => validateTitle("dir/title"), ValidationError);
	assert.throws(() => validateTitle("dir\\title"), ValidationError);
});

test("validateTitle enforces a 200-char ceiling", () => {
	const long = "a".repeat(201);
	assert.throws(() => validateTitle(long), ValidationError);
});

test("validateRelativeDirectory normalizes separators", () => {
	assert.equal(validateRelativeDirectory("journal\\2026"), "journal/2026");
	assert.equal(validateRelativeDirectory("journal/2026/"), "journal/2026");
});

test("validateRelativeDirectory rejects absolute paths", () => {
	assert.throws(() => validateRelativeDirectory("/journal"), ValidationError);
});

test("validateRelativeDirectory rejects traversal", () => {
	assert.throws(() => validateRelativeDirectory("../escape"), ValidationError);
	assert.throws(() => validateRelativeDirectory("journal/../escape"), ValidationError);
});

test("resolveNotebookPath returns absolute path inside notebook", () => {
	const fakeRealpath = (p) => p; // identity
	const result = resolveNotebookPath("/notes", "journal/2026-05-09.md", { realpath: fakeRealpath });
	assert.equal(result, "/notes/journal/2026-05-09.md");
});

test("resolveNotebookPath rejects traversal", () => {
	const fakeRealpath = (p) => p;
	assert.throws(
		() => resolveNotebookPath("/notes", "../outside.md", { realpath: fakeRealpath }),
		ValidationError,
	);
});

test("resolveNotebookPath rejects symlink escape", () => {
	const fakeRealpath = (p) => {
		if (p === "/notes/inside.md") return "/elsewhere/outside.md";
		return p;
	};
	assert.throws(
		() => resolveNotebookPath("/notes", "inside.md", { realpath: fakeRealpath }),
		ValidationError,
	);
});

test("resolveNotebookPath falls back when the target does not exist", () => {
	const realpath = (p) => {
		if (p === "/notes") return "/notes";
		throw new Error("ENOENT");
	};
	const result = resolveNotebookPath("/notes", "new-note.md", { realpath });
	assert.equal(result, "/notes/new-note.md");
});

test("resolveNotebookPath rejects empty input", () => {
	const realpath = (p) => p;
	assert.throws(() => resolveNotebookPath("/notes", "", { realpath }), ValidationError);
});

test("validateNoteRef accepts a partial path", () => {
	assert.equal(validateNoteRef("journal/2026-05-09.md"), "journal/2026-05-09.md");
});

test("validateNoteRef accepts a bare note ID", () => {
	assert.equal(validateNoteRef("200911172034"), "200911172034");
});

test("validateNoteRef trims whitespace", () => {
	assert.equal(validateNoteRef("  inbox/a.md  "), "inbox/a.md");
});

test("validateNoteRef rejects empty input", () => {
	assert.throws(() => validateNoteRef(""), ValidationError);
	assert.throws(() => validateNoteRef("   "), ValidationError);
});

test("validateNoteRef rejects absolute paths", () => {
	assert.throws(() => validateNoteRef("/notes/a.md"), ValidationError);
});

test("validateNoteRef rejects traversal segments", () => {
	assert.throws(() => validateNoteRef("../escape.md"), ValidationError);
	assert.throws(() => validateNoteRef("a/../b.md"), ValidationError);
});

test("validateNoteRef rejects control characters", () => {
	assert.throws(() => validateNoteRef("bad\x07path.md"), ValidationError);
});

test("resolveNotebookPath rejects control characters", () => {
	const realpath = (p) => p;
	assert.throws(() => resolveNotebookPath("/notes", "bad\x07path.md", { realpath }), ValidationError);
});
