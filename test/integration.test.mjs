// Integration tests against the real `zk` binary. Each test sets up a fresh
// notebook in tmp, runs an actual subprocess, and cleans up. Tests skip
// automatically when `zk` is not on PATH so unit-test runs remain hermetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runZk } from "../src/zk/client.ts";
import { withNotebookFlag } from "../src/zk/notebook.ts";
import { buildSearchNotesArgs } from "../src/tools/search-notes.ts";
import { buildListTagsArgs } from "../src/tools/list-tags.ts";
import { buildCreateNoteArgs, registerCreateNoteTool } from "../src/tools/create-note.ts";
import { registerEditNoteTool } from "../src/tools/edit-note.ts";
import { registerAppendNoteTool } from "../src/tools/append-note.ts";
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

maybe("zk_create_note rejects symlinked target directories before creating outside the notebook", async () => {
	const notebook = await makeNotebook();
	const outside = await mkdtemp(join(tmpdir(), "pi-zk-escape-"));
	try {
		await symlink(outside, join(notebook, "escape"));
		const tool = captureTool(registerCreateNoteTool);
		await assert.rejects(
			tool.execute(
				"create-escape",
				{ title: "Escaped", directory: "escape/nested", notebook },
				undefined,
				undefined,
				{ cwd: notebook },
			),
			/outside notebook|symlink/i,
		);
		await assert.rejects(access(join(outside, "nested")), { code: "ENOENT" });
	} finally {
		await rm(notebook, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});

function captureTool(register) {
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
	register(fakePi);
	if (!definition) throw new Error("register did not register a tool");
	return definition;
}

async function createSeedNote(notebook, title) {
	const args = withNotebookFlag(notebook, buildCreateNoteArgs({ title }));
	const result = await runZk({
		cwd: notebook,
		args,
		timeoutMs: 10_000,
		env: { ...process.env, ZK_EDITOR: "true", EDITOR: "true", VISUAL: "true" },
	});
	const abs = result.stdout.trim().split("\n").pop();
	return { absolute: abs, relative: abs.slice(notebook.length + 1) };
}

maybe("zk_edit_note applies an exact text replacement", async () => {
	const notebook = await makeNotebook();
	try {
		const seed = await createSeedNote(notebook, "Edit target");
		await writeFile(seed.absolute, "# Edit target\n\nHello world\n");
		const tool = captureTool(registerEditNoteTool);
		const result = await tool.execute(
			"edit-1",
			{
				path: seed.relative,
				edits: [{ oldText: "Hello world", newText: "Hello, moon" }],
				notebook,
			},
			undefined,
			undefined,
			{ cwd: notebook },
		);
		assert.equal(result.details.editsApplied, 1);
		const body = await readFile(seed.absolute, "utf8");
		assert.match(body, /Hello, moon/);
		assert.equal(body.includes("Hello world"), false);
	} finally {
		await rm(notebook, { recursive: true, force: true });
	}
});

maybe("zk_edit_note rejects ambiguous matches and leaves file unchanged", async () => {
	const notebook = await makeNotebook();
	try {
		const seed = await createSeedNote(notebook, "Ambig target");
		const original = "# Ambig target\n\nfoo\nfoo\nfoo\n";
		await writeFile(seed.absolute, original);
		const tool = captureTool(registerEditNoteTool);
		await assert.rejects(
			tool.execute(
				"edit-2",
				{ path: seed.relative, edits: [{ oldText: "foo", newText: "bar" }], notebook },
				undefined,
				undefined,
				{ cwd: notebook },
			),
			/appears 3 times/,
		);
		const body = await readFile(seed.absolute, "utf8");
		assert.equal(body, original);
	} finally {
		await rm(notebook, { recursive: true, force: true });
	}
});

maybe("zk_edit_note rejects paths outside the notebook", async () => {
	const notebook = await makeNotebook();
	try {
		const tool = captureTool(registerEditNoteTool);
		await assert.rejects(
			tool.execute(
				"edit-3",
				{
					path: "../escape.md",
					edits: [{ oldText: "x", newText: "y" }],
					notebook,
				},
				undefined,
				undefined,
				{ cwd: notebook },
			),
			/outside notebook|traverses outside/,
		);
	} finally {
		await rm(notebook, { recursive: true, force: true });
	}
});

maybe("zk_append_note adds a blank-line-separated block", async () => {
	const notebook = await makeNotebook();
	try {
		const seed = await createSeedNote(notebook, "Append target");
		await writeFile(seed.absolute, "# Append target\n");
		const tool = captureTool(registerAppendNoteTool);
		await tool.execute(
			"append-1",
			{ path: seed.relative, content: "## Log\n\n- first entry", notebook },
			undefined,
			undefined,
			{ cwd: notebook },
		);
		const body = await readFile(seed.absolute, "utf8");
		assert.equal(body, "# Append target\n\n## Log\n\n- first entry\n");
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
