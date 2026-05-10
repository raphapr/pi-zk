import { type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions, fuzzyFilter } from "@earendil-works/pi-tui";
import type { CachedNote } from "../zk/note-cache.js";

const WIKILINK_TOKEN_RE = /\[\[([^\]\n]*)$/;
const MAX_SUGGESTIONS = 20;

export function extractWikilinkToken(textBeforeCursor: string): string | undefined {
	const match = textBeforeCursor.match(WIKILINK_TOKEN_RE);
	return match?.[1];
}

export function formatWikilinkItem(note: CachedNote): AutocompleteItem {
	const tagSuffix = note.tags.length ? `  ${note.tags.map((t) => `#${t}`).join(" ")}` : "";
	const description = `${note.title}${tagSuffix}`.trim() || note.path;
	return {
		value: `[[${note.stem}]]`,
		label: note.stem,
		description,
	};
}

/**
 * Rank wikilink candidates. With no query, surfaces the cache order
 * (typically modified-desc). With a query, fuzzy-matches across stem,
 * title, and tags.
 */
export function rankWikilinkCandidates(notes: CachedNote[], query: string): CachedNote[] {
	if (!query.trim()) return notes.slice(0, MAX_SUGGESTIONS);
	return fuzzyFilter(notes, query, (note) => `${note.stem} ${note.title} ${note.tags.join(" ")}`).slice(0, MAX_SUGGESTIONS);
}

export function createWikilinkAutocompleteProvider(
	current: AutocompleteProvider,
	getNotes: () => Promise<CachedNote[] | undefined>,
): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);
			const token = extractWikilinkToken(before);
			if (token === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const notes = await getNotes();
			if (options.signal.aborted || !notes || notes.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const ranked = rankWikilinkCandidates(notes, token);
			if (ranked.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return {
				items: ranked.map(formatWikilinkItem),
				prefix: `[[${token}`,
			};
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}
