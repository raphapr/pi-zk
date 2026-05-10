import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreateNoteArgs } from "../src/tools/create-note.ts";

test("buildCreateNoteArgs emits --print-path and --title", () => {
	const args = buildCreateNoteArgs({ title: "Weekly review" });
	assert.deepEqual(args, ["new", "--print-path", "--title", "Weekly review"]);
});

test("buildCreateNoteArgs appends directory as positional", () => {
	const args = buildCreateNoteArgs({ title: "Daily 2026-05-09", directory: "journal/daily" });
	assert.deepEqual(args, [
		"new",
		"--print-path",
		"--title",
		"Daily 2026-05-09",
		"journal/daily",
	]);
});

test("buildCreateNoteArgs appends --template before directory", () => {
	const args = buildCreateNoteArgs({ title: "T", directory: "inbox", template: "weekly.md" });
	const tIdx = args.indexOf("--template");
	assert.equal(args[tIdx + 1], "weekly.md");
	assert.equal(args[args.length - 1], "inbox");
});

test("buildCreateNoteArgs omits --template when not given", () => {
	const args = buildCreateNoteArgs({ title: "T" });
	assert.equal(args.includes("--template"), false);
});
