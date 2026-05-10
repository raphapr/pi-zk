import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLinkGraphArgs } from "../src/tools/link-graph.ts";
import { NOTE_LIST_FORMAT } from "../src/zk/parsers.ts";

const linkTo = {
	name: "zk_link_to",
	label: "",
	description: "",
	promptSnippet: "",
	promptGuidelines: [],
	zkFlag: "--link-to",
	supportsRecursive: true,
};

const linkedBy = { ...linkTo, name: "zk_linked_by", zkFlag: "--linked-by" };
const related = { ...linkTo, name: "zk_related", zkFlag: "--related", supportsRecursive: false };

test("buildLinkGraphArgs emits format and link flag for --link-to", () => {
	const args = buildLinkGraphArgs(linkTo, { path: "journal/a.md" });
	assert.deepEqual(args.slice(0, 7), [
		"list",
		"--quiet",
		"--no-pager",
		"--format",
		NOTE_LIST_FORMAT,
		"--link-to",
		"journal/a.md",
	]);
	assert.equal(args[args.indexOf("--sort") + 1], "modified-");
	assert.equal(args[args.indexOf("--limit") + 1], "50");
});

test("buildLinkGraphArgs swaps the flag for --linked-by", () => {
	const args = buildLinkGraphArgs(linkedBy, { path: "200911172034" });
	const idx = args.indexOf("--linked-by");
	assert.ok(idx > -1);
	assert.equal(args[idx + 1], "200911172034");
});

test("buildLinkGraphArgs adds recursive flag when requested", () => {
	const args = buildLinkGraphArgs(linkTo, { path: "a.md", recursive: true });
	assert.ok(args.includes("--recursive"));
});

test("buildLinkGraphArgs respects max-distance", () => {
	const args = buildLinkGraphArgs(linkTo, { path: "a.md", recursive: true, max_distance: 3 });
	const idx = args.indexOf("--max-distance");
	assert.equal(args[idx + 1], "3");
});

test("buildLinkGraphArgs ignores recursive options for --related", () => {
	const args = buildLinkGraphArgs(related, { path: "a.md", recursive: true, max_distance: 3 });
	assert.equal(args.includes("--recursive"), false);
	assert.equal(args.includes("--max-distance"), false);
});

test("buildLinkGraphArgs honors custom sort and limit", () => {
	const args = buildLinkGraphArgs(linkTo, { path: "a.md", sort: "title", limit: 10 });
	assert.equal(args[args.indexOf("--sort") + 1], "title");
	assert.equal(args[args.indexOf("--limit") + 1], "10");
});

test("buildLinkGraphArgs fetches limit+offset and clamps to max", () => {
	const args = buildLinkGraphArgs(linkTo, { path: "a.md", limit: 150, offset: 100 });
	assert.equal(args[args.indexOf("--limit") + 1], "200");
});

test("buildLinkGraphArgs ignores zero or negative max-distance", () => {
	const args = buildLinkGraphArgs(linkTo, { path: "a.md", recursive: true, max_distance: 0 });
	assert.equal(args.includes("--max-distance"), false);
});
