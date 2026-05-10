// Integration tests against the real `zk` binary. Each test sets up a fresh
// notebook in tmp, runs an actual subprocess, and cleans up. Tests skip
// automatically when `zk` is not on PATH so unit-test runs remain hermetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runZk } from "../src/zk/client.ts";
import { withNotebookFlag } from "../src/zk/notebook.ts";
import { buildSearchNotesArgs } from "../src/tools/search-notes.ts";
import { buildListTagsArgs } from "../src/tools/list-tags.ts";
import { buildCreateNoteArgs, registerCreateNoteTool } from "../src/tools/create-note.ts";
import { parseNoteList, parseTagList } from "../src/zk/parsers.ts";

const hasZk = spawnSync("zk", ["--help"], { stdio: "ignore" }).status === 0;
const maybe = hasZk ? test : test.skip;

async function makeNotebook() {
	const dir = await mkdtemp(join(tmpdir(), "pi-zk-int-"));
	mkdirSync(join(dir, ".zk"));
	mkdirSync(join(dir, ".zk", "templates"), { recursive: true });
	// Minimal zk config so `zk new` works without any prompts and without an editor.
	await writeFile(
		join(dir, ".zk", "config.toml"),
		[
			"[note]",
			'language = "en"',
			'default-title = "Untitled"',
			'filename = "{{slug title}}"',
			'extension = "md"',
			'template = "default.md"',
			"",
			"[format.markdown]",
			"hashtags = true",
			"",
		].join("\n"),
	);
	await writeFile(
		join(dir, ".zk", "templates", "default.md"),
		"# {{title}}\n\n",
	);
	return dir;
}

maybe("zk_create_note creates a real note via --print-path", async () => {
	const notebook = await makeNotebook();
	try {
		// Pre-create the subdirectory: the tool's execute() does this via mkdir,
		// but this test exercises buildCreateNoteArgs + runZk directly.
		mkdirSync(join(notebook, "inbox"));
		const args = withNotebookFlag(
			notebook,
			buildCreateNoteArgs({ title: "Integration smoke", directory: "inbox" }),
		);
		const result = await runZk({
			cwd: notebook,
			args,
			timeoutMs: 10_000,
			env: { ...process.env, ZK_EDITOR: "true", EDITOR: "true", VISUAL: "true" },
		});
		const path = result.stdout.trim().split("\n").pop();
		assert.ok(path, "expected zk new to print a path");
		const body = await readFile(path, "utf8");
		assert.match(body, /Integration smoke/);
	} finally {
		await rm(notebook, { recursive: true, force: true });
	}
});

maybe("zk_search_notes round-trips through real zk list", async () => {
	const notebook = await makeNotebook();
	try {
		await runZk({
			cwd: notebook,
			args: withNotebookFlag(notebook, buildCreateNoteArgs({ title: "Alpha note" })),
			timeoutMs: 10_000,
			env: { ...process.env, ZK_EDITOR: "true", EDITOR: "true", VISUAL: "true" },
		});
		await runZk({
			cwd: notebook,
			args: withNotebookFlag(notebook, buildCreateNoteArgs({ title: "Beta note" })),
			timeoutMs: 10_000,
			env: { ...process.env, ZK_EDITOR: "true", EDITOR: "true", VISUAL: "true" },
		});

		const listResult = await runZk({
			cwd: notebook,
			args: withNotebookFlag(notebook, buildSearchNotesArgs({})),
			timeoutMs: 10_000,
		});
		const notes = parseNoteList(listResult.stdout);
		assert.equal(notes.length, 2);
		const titles = new Set(notes.map((n) => n.title));
		assert.ok(titles.has("Alpha note"));
		assert.ok(titles.has("Beta note"));

		const filtered = await runZk({
			cwd: notebook,
			args: withNotebookFlag(notebook, buildSearchNotesArgs({ match: "alpha" })),
			timeoutMs: 10_000,
		});
		const filteredNotes = parseNoteList(filtered.stdout);
		assert.equal(filteredNotes.length, 1);
		assert.equal(filteredNotes[0].title, "Alpha note");
	} finally {
		await rm(notebook, { recursive: true, force: true });
	}
});

maybe("zk_create_note auto-creates nested directories and appends content", async () => {
	const notebook = await makeNotebook();
	let definition;
	const fakePi = {
		on() {},
		registerTool(def) {
			definition = def;
		},
		registerCommand() {},
		registerShortcut() {},
		registerFlag() {},
		registerMessageRenderer() {},
		sendMessage() {},
		sendUserMessage() {},
		appendEntry() {},
		events: { on() {}, emit() {} },
	};
	try {
		registerCreateNoteTool(fakePi);
		assert.ok(definition, "expected tool registration");
		const result = await definition.execute(
			"call-1",
			{
				title: "Nested",
				directory: "journal/2026/05",
				content: "## Notes\n\n- first bullet\n",
				notebook,
			},
			undefined,
			undefined,
			{ cwd: notebook },
		);
		const details = result.details;
		assert.ok(details);
		assert.match(details.path, /journal\/2026\/05\/.+\.md$/);
		assert.equal(details.contentAppended > 0, true);
		const body = await readFile(details.absolutePath, "utf8");
		assert.match(body, /first bullet/);
	} finally {
		await rm(notebook, { recursive: true, force: true });
	}
});

maybe("zk_list_tags surfaces tags created via #hashtag", async () => {
	const notebook = await makeNotebook();
	try {
		await runZk({
			cwd: notebook,
			args: withNotebookFlag(notebook, buildCreateNoteArgs({ title: "Tagged note" })),
			timeoutMs: 10_000,
			env: { ...process.env, ZK_EDITOR: "true", EDITOR: "true", VISUAL: "true" },
		});
		// Append a hashtag so zk indexes a tag.
		const listed = await runZk({
			cwd: notebook,
			args: withNotebookFlag(notebook, buildSearchNotesArgs({})),
			timeoutMs: 10_000,
		});
		const note = parseNoteList(listed.stdout)[0];
		assert.ok(note);
		const abs = join(notebook, note.path);
		const original = await readFile(abs, "utf8");
		await writeFile(abs, `${original}\n#integration\n`);

		const tagResult = await runZk({
			cwd: notebook,
			args: withNotebookFlag(notebook, buildListTagsArgs()),
			timeoutMs: 10_000,
		});
		const tags = parseTagList(tagResult.stdout);
		assert.ok(tags.some((t) => t.name === "integration" && t.count >= 1));
	} finally {
		await rm(notebook, { recursive: true, force: true });
	}
});
