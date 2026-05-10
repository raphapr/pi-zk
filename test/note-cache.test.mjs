import { test } from "node:test";
import assert from "node:assert/strict";
import { NoteCache, noteStem, resolveAutocompleteLimit, toCachedNote } from "../src/zk/note-cache.ts";

test("noteStem strips .md extensions", () => {
	assert.equal(noteStem("journal/2026-05-09.md"), "2026-05-09");
});

test("noteStem strips arbitrary extensions", () => {
	assert.equal(noteStem("file.markdown"), "file");
	assert.equal(noteStem("nested/dir/note.org"), "note");
});

test("noteStem keeps dotfiles intact", () => {
	assert.equal(noteStem(".hidden"), ".hidden");
});

test("toCachedNote derives stem from path", () => {
	assert.deepEqual(
		toCachedNote({ path: "inbox/a.md", title: "A", tags: ["x"] }),
		{ path: "inbox/a.md", stem: "a", title: "A", tags: ["x"] },
	);
});

test("NoteCache serves loader output on first call", async () => {
	const cache = new NoteCache({
		load: async () => [{ path: "a.md", title: "A", tags: [] }],
	});
	const result = await cache.get();
	assert.equal(result.length, 1);
	assert.equal(result[0].stem, "a");
});

test("NoteCache reuses results within TTL", async () => {
	let calls = 0;
	const cache = new NoteCache({
		ttlMs: 60_000,
		load: async () => {
			calls++;
			return [{ path: "a.md", title: "A", tags: [] }];
		},
	});
	await cache.get();
	await cache.get();
	assert.equal(calls, 1);
});

test("NoteCache deduplicates concurrent refreshes", async () => {
	let calls = 0;
	const cache = new NoteCache({
		ttlMs: 0,
		load: async () => {
			calls++;
			await new Promise((r) => setTimeout(r, 5));
			return [{ path: "a.md", title: "A", tags: [] }];
		},
	});
	await Promise.all([cache.get(), cache.get(), cache.get()]);
	assert.equal(calls, 1);
});

test("NoteCache invalidate forces a fresh load", async () => {
	let calls = 0;
	const cache = new NoteCache({
		ttlMs: 60_000,
		load: async () => {
			calls++;
			return [{ path: `${calls}.md`, title: "", tags: [] }];
		},
	});
	await cache.get();
	cache.invalidate();
	await cache.get();
	assert.equal(calls, 2);
});

test("NoteCache serves stale results when loader fails", async () => {
	let calls = 0;
	const errors = [];
	const cache = new NoteCache({
		ttlMs: 0,
		onError: (e) => errors.push(e),
		load: async () => {
			calls++;
			if (calls === 1) return [{ path: "a.md", title: "A", tags: [] }];
			throw new Error("transient");
		},
	});
	const first = await cache.get();
	assert.equal(first.length, 1);
	const second = await cache.get();
	assert.equal(second.length, 1);
	assert.equal(errors.length, 1);
});

test("resolveAutocompleteLimit defaults to 500 notes", () => {
	assert.equal(resolveAutocompleteLimit({}), 500);
});

test("resolveAutocompleteLimit accepts ZK_AUTOCOMPLETE_LIMIT", () => {
	assert.equal(resolveAutocompleteLimit({ ZK_AUTOCOMPLETE_LIMIT: "1200" }), 1200);
});

test("resolveAutocompleteLimit clamps invalid and excessive values", () => {
	assert.equal(resolveAutocompleteLimit({ ZK_AUTOCOMPLETE_LIMIT: "not-a-number" }), 500);
	assert.equal(resolveAutocompleteLimit({ ZK_AUTOCOMPLETE_LIMIT: "0" }), 500);
	assert.equal(resolveAutocompleteLimit({ ZK_AUTOCOMPLETE_LIMIT: "99999" }), 5000);
});
