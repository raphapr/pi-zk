import { test } from "node:test";
import assert from "node:assert/strict";
import { buildListTagsArgs } from "../src/tools/list-tags.ts";
import { buildLastModifiedArgs } from "../src/tools/last-modified.ts";
import { buildTaglessNotesArgs } from "../src/tools/tagless-notes.ts";
import { buildRandomNoteArgs } from "../src/tools/random-note.ts";
import { NOTE_LIST_FORMAT, TAG_LIST_FORMAT } from "../src/zk/parsers.ts";

test("buildListTagsArgs uses tag list format", () => {
	assert.deepEqual(buildListTagsArgs(), ["tag", "list", "--quiet", "--no-pager", "--format", TAG_LIST_FORMAT]);
});

test("buildLastModifiedArgs sorts by modified desc with limit 1", () => {
	const args = buildLastModifiedArgs({});
	assert.deepEqual(args.slice(0, 5), ["list", "--quiet", "--no-pager", "--format", NOTE_LIST_FORMAT]);
	const sortIdx = args.indexOf("--sort");
	assert.equal(args[sortIdx + 1], "modified-");
	const limitIdx = args.indexOf("--limit");
	assert.equal(args[limitIdx + 1], "1");
});

test("buildLastModifiedArgs appends --tag when provided", () => {
	const args = buildLastModifiedArgs({ tag: "weekly" });
	const tagIdx = args.indexOf("--tag");
	assert.equal(args[tagIdx + 1], "weekly");
});

test("buildLastModifiedArgs ignores whitespace-only tag", () => {
	const args = buildLastModifiedArgs({ tag: "   " });
	assert.equal(args.indexOf("--tag"), -1);
});

test("buildTaglessNotesArgs sets --tagless and fetches one extra row", () => {
	const args = buildTaglessNotesArgs({});
	assert.ok(args.includes("--tagless"));
	const limitIdx = args.indexOf("--limit");
	assert.equal(args[limitIdx + 1], "51");
});

test("buildTaglessNotesArgs fetches offset + limit + one extra row", () => {
	const args = buildTaglessNotesArgs({ limit: 20, offset: 30 });
	const limitIdx = args.indexOf("--limit");
	assert.equal(args[limitIdx + 1], "51");
});

test("buildRandomNoteArgs sorts random with limit 1", () => {
	const args = buildRandomNoteArgs({});
	const sortIdx = args.indexOf("--sort");
	assert.equal(args[sortIdx + 1], "random");
	const limitIdx = args.indexOf("--limit");
	assert.equal(args[limitIdx + 1], "1");
});

test("buildRandomNoteArgs adds tag when provided", () => {
	const args = buildRandomNoteArgs({ tag: "weekly" });
	const tagIdx = args.indexOf("--tag");
	assert.equal(args[tagIdx + 1], "weekly");
});
