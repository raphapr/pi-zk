import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createWikilinkAutocompleteProvider,
	extractWikilinkToken,
	formatWikilinkItem,
	rankWikilinkCandidates,
} from "../src/autocomplete/wikilinks.ts";

function ac() {
	return new AbortController().signal;
}

const baseProvider = {
	getSuggestions: async () => null,
	applyCompletion: (lines, cursorLine, cursorCol, item, prefix) => {
		const line = lines[cursorLine] ?? "";
		const before = line.slice(0, cursorCol);
		const after = line.slice(cursorCol);
		const replaced = before.endsWith(prefix) ? before.slice(0, before.length - prefix.length) + item.value : before + item.value;
		const newLine = replaced + after;
		const newLines = [...lines];
		newLines[cursorLine] = newLine;
		return { lines: newLines, cursorLine, cursorCol: replaced.length };
	},
	shouldTriggerFileCompletion: () => true,
};

const notes = [
	{ path: "journal/2026-05-09.md", stem: "2026-05-09", title: "Weekly review", tags: ["work", "deep"] },
	{ path: "inbox/idea.md", stem: "idea", title: "Random idea", tags: [] },
	{ path: "concepts/zettelkasten.md", stem: "zettelkasten", title: "Zettelkasten", tags: ["theory"] },
];

test("extractWikilinkToken matches the partial token after [[", () => {
	assert.equal(extractWikilinkToken("notes [[idea"), "idea");
	assert.equal(extractWikilinkToken("[["), "");
});

test("extractWikilinkToken returns undefined when not inside a wikilink", () => {
	assert.equal(extractWikilinkToken("plain text"), undefined);
	assert.equal(extractWikilinkToken("link to []"), undefined);
});

test("extractWikilinkToken stops at closing brackets and newlines", () => {
	assert.equal(extractWikilinkToken("done [[idea]] more"), undefined);
});

test("formatWikilinkItem renders stem value with title description", () => {
	const item = formatWikilinkItem(notes[0]);
	assert.equal(item.value, "[[2026-05-09]]");
	assert.equal(item.label, "2026-05-09");
	assert.match(item.description, /Weekly review/);
	assert.match(item.description, /#work/);
});

test("formatWikilinkItem falls back to path when title is empty", () => {
	const item = formatWikilinkItem({ path: "a.md", stem: "a", title: "", tags: [] });
	assert.equal(item.description, "a.md");
});

test("rankWikilinkCandidates returns top notes when query is empty", () => {
	const ranked = rankWikilinkCandidates(notes, "");
	assert.equal(ranked.length, 3);
});

test("rankWikilinkCandidates fuzzy-matches stem and title", () => {
	const ranked = rankWikilinkCandidates(notes, "zettel");
	assert.equal(ranked[0].stem, "zettelkasten");
});

test("rankWikilinkCandidates includes tag matches", () => {
	const ranked = rankWikilinkCandidates(notes, "theory");
	assert.equal(ranked[0].stem, "zettelkasten");
});

test("provider returns suggestions when token is present", async () => {
	const provider = createWikilinkAutocompleteProvider(baseProvider, async () => notes);
	const result = await provider.getSuggestions(["see [[idea"], 0, "see [[idea".length, { signal: ac() });
	assert.ok(result);
	assert.equal(result.prefix, "[[idea");
	assert.equal(result.items[0].value, "[[idea]]");
});

test("provider falls through to base when no token", async () => {
	let baseCalled = false;
	const base = { ...baseProvider, async getSuggestions() { baseCalled = true; return null; } };
	const provider = createWikilinkAutocompleteProvider(base, async () => notes);
	await provider.getSuggestions(["plain"], 0, 5, { signal: ac() });
	assert.equal(baseCalled, true);
});

test("provider falls through when cache is empty", async () => {
	let baseCalled = false;
	const base = { ...baseProvider, async getSuggestions() { baseCalled = true; return null; } };
	const provider = createWikilinkAutocompleteProvider(base, async () => []);
	await provider.getSuggestions(["[[x"], 0, 3, { signal: ac() });
	assert.equal(baseCalled, true);
});

test("provider applyCompletion delegates to base", () => {
	const provider = createWikilinkAutocompleteProvider(baseProvider, async () => notes);
	const result = provider.applyCompletion(
		["see [[ide"],
		0,
		"see [[ide".length,
		{ value: "[[idea]]", label: "idea" },
		"[[ide",
	);
	assert.equal(result.lines[0], "see [[idea]]");
});
