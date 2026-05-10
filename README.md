# pi-zk

Pi extension that exposes the [zk](https://github.com/zk-org/zk) CLI as LLM-callable tools. Talk to your Zettelkasten from Pi.

## Status

Pre-release. Generic toolbox MVP in progress. See [the plan](#scope).

## Install

```bash
pi install git:github.com/raphapr/pi-zk
```

Requires:

- [`zk`](https://github.com/zk-org/zk) on `PATH`
- An existing zk notebook (`zk init` in your notes directory)

## Configuration

The extension resolves the active notebook in this order:

1. `ZK_NOTEBOOK_DIR` env var
2. `ZK_DIR` env var
3. The current working directory if it contains `.zk/`
4. The nearest parent of cwd that contains `.zk/`

## Scope

v1 ships a generic toolbox: search, read, edit, create, append, list tags, link graph, and wikilink autocomplete. Daily/weekly slash commands are out of scope for v1 — the LLM composes them from primitives.

Tools:

| Tool | What it does |
|---|---|
| `zk_search_notes` | Filter notes by text, tags, dates |
| `zk_read_note` | Read a note's body |
| `zk_create_note` | Create a new note via `zk new` |
| `zk_edit_note` | Targeted text replacement inside a note |
| `zk_append_note` | Append a block to the end of a note |
| `zk_list_tags` | List all tags with note counts |
| `zk_link_to` | Notes the given note links to |
| `zk_linked_by` | Notes that link to the given note |
| `zk_related` | Notes related to the given note |
| `zk_last_modified` | Most recently edited note |
| `zk_tagless_notes` | Notes with no tags |
| `zk_random_note` | A random note |

Autocomplete: typing `[[` in the Pi editor surfaces matching note filenames from the active notebook.

## Develop

```bash
npm install
npm run typecheck
npm test
```

Load locally without installing:

```bash
pi -e /path/to/pi-zk
```

## License

MIT
