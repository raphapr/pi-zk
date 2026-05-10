import { test } from "node:test";
import assert from "node:assert/strict";
import {
	NOTE_LIST_FORMAT,
	TAG_LIST_FORMAT,
	parseNoteLine,
	parseNoteList,
	parseTagLine,
	parseTagList,
} from "../src/zk/parsers.ts";

test("NOTE_LIST_FORMAT uses tab-separated fields with literal \\t", () => {
	assert.ok(NOTE_LIST_FORMAT.includes("\\t"), "expected literal \\t escape");
	assert.ok(NOTE_LIST_FORMAT.includes("{{path}}"));
	assert.ok(NOTE_LIST_FORMAT.includes("{{title}}"));
	assert.ok(NOTE_LIST_FORMAT.includes("{{join tags"));
});

test("TAG_LIST_FORMAT uses tab-separated name and count", () => {
	assert.equal(TAG_LIST_FORMAT, '{{name}}\\t{{note-count}}');
});

test("parseNoteLine parses a complete row", () => {
	const note = parseNoteLine("journal/2026-05-09.md\tWeekly review\twork, deep");
	assert.deepEqual(note, {
		path: "journal/2026-05-09.md",
		title: "Weekly review",
		tags: ["work", "deep"],
	});
});

test("parseNoteLine accepts rows with no tags", () => {
	const note = parseNoteLine("inbox/a.md\tA note\t");
	assert.deepEqual(note, { path: "inbox/a.md", title: "A note", tags: [] });
});

test("parseNoteLine accepts rows without trailing tag column", () => {
	const note = parseNoteLine("inbox/a.md\tA note");
	assert.deepEqual(note, { path: "inbox/a.md", title: "A note", tags: [] });
});

test("parseNoteLine returns undefined for malformed rows", () => {
	assert.equal(parseNoteLine(""), undefined);
	assert.equal(parseNoteLine("only-one-field"), undefined);
	assert.equal(parseNoteLine("\tno-path"), undefined);
});

test("parseNoteList skips blank and malformed lines", () => {
	const stdout = [
		"journal/a.md\tA\tx,y",
		"",
		"bad",
		"journal/b.md\tB\t",
		"journal/c.md\tC\tz",
	].join("\n");
	const notes = parseNoteList(stdout);
	assert.equal(notes.length, 3);
	assert.deepEqual(notes.map((n) => n.path), ["journal/a.md", "journal/b.md", "journal/c.md"]);
});

test("parseNoteList handles CRLF endings", () => {
	const stdout = "journal/a.md\tA\tx,y\r\njournal/b.md\tB\t\r\n";
	const notes = parseNoteList(stdout);
	assert.equal(notes.length, 2);
	assert.equal(notes[0].title, "A");
});

test("parseTagLine parses a tag row", () => {
	assert.deepEqual(parseTagLine("work\t12"), { name: "work", count: 12 });
});

test("parseTagLine rejects non-numeric counts", () => {
	assert.equal(parseTagLine("work\tnope"), undefined);
});

test("parseTagList skips bad rows", () => {
	const stdout = ["work\t12", "", "bad", "deep\t3"].join("\n");
	const tags = parseTagList(stdout);
	assert.deepEqual(tags, [
		{ name: "work", count: 12 },
		{ name: "deep", count: 3 },
	]);
});
