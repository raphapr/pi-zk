# pi-zk

A [Pi](https://github.com/mariozechner/pi-coding-agent) extension that exposes the [zk](https://github.com/zk-org/zk) note-taking CLI as agent-native tools. Talk to your Zettelkasten from Pi.

## What you get

Twelve LLM-callable tools wrapped around `zk`, plus wikilink autocomplete in the Pi editor and an automatic system-prompt nudge that routes note operations through the right tools.

```text
[user]> What did I write last week tagged #work but not yet linked to my OKR note?

zk_search_notes  "tag:work modified-after:1 week ago"
zk_linked_by     "okrs/2026-Q2.md"
…
```

## Install

```bash
pi install git:github.com/raphapr/pi-zk
```

Requirements:

- [`zk`](https://github.com/zk-org/zk) **0.15** or newer on `PATH`
- An initialised zk notebook (`zk init` in your notes directory)
- Node 22.14+ (Pi already requires this)

## Tools

| Tool | Purpose |
|---|---|
| `zk_search_notes` | Filter notes by FTS query, tags (AND/OR/NOT), paths, and date ranges |
| `zk_read_note` | Read a note's full content by notebook-relative path |
| `zk_create_note` | `zk new` wrapper; auto-creates nested directories and can prepopulate content |
| `zk_edit_note` | Exact-match text replacement with uniqueness enforcement |
| `zk_append_note` | Append a markdown block with blank-line normalisation |
| `zk_list_tags` | List every tag with note counts |
| `zk_link_to` | Backlinks for a note (supports recursive traversal + max-distance) |
| `zk_linked_by` | Notes a given note points to (supports recursive traversal) |
| `zk_related` | Notes that share neighbours but are not yet linked |
| `zk_last_modified` | Most recently edited note, optionally tag-filtered |
| `zk_tagless_notes` | Notes with no tags (useful for triage) |
| `zk_random_note` | One random note, optionally tag-filtered |

All tools accept an optional `notebook` parameter that overrides env-based resolution for a single call.

## Wikilink autocomplete

Typing `[[` in the Pi editor surfaces a fuzzy-ranked menu of notes from the active notebook:

```text
see [[zett▎       zettelkasten   — Zettelkasten  #theory
                  2026-05-09     — Weekly review #work #deep
                  …
```

- Match runs across filename stem, title, and tags
- Suggestions are capped at 20
- Notes are cached per notebook with a 60-second TTL
- Cache is invalidated automatically after `zk_create_note`, `zk_edit_note`, and `zk_append_note`

## System prompt guidance

When a notebook is detected at session start, pi-zk appends a short routing block to the system prompt so the LLM knows to prefer `zk_*` tools over generic `read` / `edit` / `bash` on note files. When no notebook is in scope the block is omitted.

## Configuration

Notebook resolution checks in order:

1. `ZK_NOTEBOOK_DIR` environment variable
2. `ZK_DIR` environment variable
3. The current working directory if it contains `.zk/`
4. The nearest ancestor of the cwd that contains `.zk/`

Other env vars:

- `ZK_BIN` — explicit path to the `zk` binary (defaults to `~/.local/bin/zk`, then `zk` on `PATH`)
- `ZK_EDITOR`, `EDITOR`, `VISUAL` — forced to `true` during `zk_create_note` so non-interactive notes are created without launching your editor

## Safety

- Every path argument is resolved relative to the notebook root, follows symlinks via `realpath`, and is rejected if it escapes the notebook
- Subprocess arguments are always passed as argv arrays (no shell interpolation)
- Mutating tools (`zk_create_note`, `zk_edit_note`, `zk_append_note`) wrap reads and writes in `withFileMutationQueue` so concurrent calls on the same note serialize
- `zk_edit_note` requires each `oldText` to occur exactly once after prior edits in the same call; ambiguous matches fail with the occurrence count so the LLM can extend its anchor

## Development

```bash
npm install
npm run typecheck
npm test
```

The test suite includes integration tests that exercise the real `zk` binary. They auto-skip when `zk` is not installed; install zk locally to run the full suite.

Load the extension without publishing:

```bash
pi -e /path/to/pi-zk/src/index.ts
```

## Roadmap

Not in v1 (may land later):

- `/zk-daily` and `/zk-weekly` slash commands for daily-to-weekly workflow automation
- A "today's note" status widget
- Live note watcher (currently relies on TTL + invalidation)
- Custom wikilink formats beyond filename stem

## License

MIT — see [LICENSE](./LICENSE).
