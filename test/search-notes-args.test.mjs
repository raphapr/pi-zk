import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchNotesArgs, buildTagSelector } from "../src/tools/search-notes.ts";
import { NOTE_LIST_FORMAT } from "../src/zk/parsers.ts";

test("buildTagSelector returns undefined when no tags supplied", () => {
	assert.equal(buildTagSelector({}), undefined);
	assert.equal(buildTagSelector({ tags: [], exclude_tags: [] }), undefined);
});

test("buildTagSelector returns a single tag verbatim", () => {
	assert.equal(buildTagSelector({ tags: ["work"] }), "work");
});

test("buildTagSelector joins multiple tags with comma for AND", () => {
	assert.equal(buildTagSelector({ tags: ["work", "deep"], operand: "AND" }), "work, deep");
});

test("buildTagSelector wraps multiple tags in parens for OR", () => {
	assert.equal(buildTagSelector({ tags: ["work", "weekly"], operand: "OR" }), "(work OR weekly)");
});

test("buildTagSelector appends NOT exclusions", () => {
	assert.equal(buildTagSelector({ tags: ["work"], exclude_tags: ["done"] }), "work, NOT done");
});

test("buildTagSelector combines OR-tags with NOT exclusions", () => {
	assert.equal(
		buildTagSelector({ tags: ["work", "weekly"], operand: "OR", exclude_tags: ["done"] }),
		"(work OR weekly), NOT done",
	);
});

test("buildTagSelector supports exclusion-only filters", () => {
	assert.equal(buildTagSelector({ exclude_tags: ["done", "stale"] }), "NOT done, NOT stale");
});

test("buildTagSelector trims whitespace and drops empties", () => {
	assert.equal(buildTagSelector({ tags: ["  work  ", "", "deep"] }), "work, deep");
});

test("buildSearchNotesArgs requests the canonical format and sort", () => {
	const args = buildSearchNotesArgs({});
	assert.deepEqual(
		args.slice(0, 6),
		["list", "--quiet", "--no-pager", "--format", NOTE_LIST_FORMAT, "--sort"],
	);
	assert.equal(args[6], "modified-");
});

test("buildSearchNotesArgs adds match, tag, and date flags", () => {
	const args = buildSearchNotesArgs({
		match: "irsa",
		additional_matches: ["", "kubernetes"],
		match_strategy: "exact",
		tags: ["work", "weekly"],
		tag_operand: "OR",
		exclude_tags: ["done"],
		modified_after: "1 week ago",
		created_after: "2026-01-01",
	});
	const joined = args.join(" ");
	assert.match(joined, /--match irsa/);
	assert.match(joined, /--match kubernetes/);
	assert.match(joined, /--match-strategy exact/);
	assert.match(joined, /--tag \(work OR weekly\), NOT done/);
	assert.match(joined, /--modified-after 1 week ago/);
	assert.match(joined, /--created-after 2026-01-01/);
});

test("buildSearchNotesArgs default limit fetches one extra row for hasMore", () => {
	const args = buildSearchNotesArgs({});
	const idx = args.indexOf("--limit");
	assert.equal(args[idx + 1], "51");
});

test("buildSearchNotesArgs respects custom limit and fetches one extra row", () => {
	const args = buildSearchNotesArgs({ limit: 10 });
	const idx = args.indexOf("--limit");
	assert.equal(args[idx + 1], "11");
});

test("buildSearchNotesArgs clamps returned limit but still fetches one extra row", () => {
	const args = buildSearchNotesArgs({ limit: 5000 });
	const idx = args.indexOf("--limit");
	assert.equal(args[idx + 1], "201");
});

test("buildSearchNotesArgs fetches offset + limit + one extra row", () => {
	const args = buildSearchNotesArgs({ limit: 150, offset: 100 });
	const idx = args.indexOf("--limit");
	assert.equal(args[idx + 1], "251");
});

test("buildSearchNotesArgs appends positional paths last", () => {
	const args = buildSearchNotesArgs({ paths: ["journal/", "inbox/"] });
	assert.equal(args[args.length - 2], "journal/");
	assert.equal(args[args.length - 1], "inbox/");
});

test("buildSearchNotesArgs rejects paths outside the notebook", () => {
	assert.throws(() => buildSearchNotesArgs({ paths: ["../outside"] }), /must not traverse upwards/);
	assert.throws(() => buildSearchNotesArgs({ paths: ["/tmp/outside"] }), /must be notebook-relative/);
});

test("buildSearchNotesArgs honors custom sort", () => {
	const args = buildSearchNotesArgs({ sort: "title" });
	const idx = args.indexOf("--sort");
	assert.equal(args[idx + 1], "title");
});
