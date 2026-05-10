import { ValidationError } from "./validate.js";

export interface Edit {
	oldText: string;
	newText: string;
}

export interface ApplyEditsResult {
	content: string;
	applied: number;
}

/**
 * Count non-overlapping occurrences of `needle` in `haystack`.
 */
function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let from = 0;
	for (;;) {
		const idx = haystack.indexOf(needle, from);
		if (idx === -1) return count;
		count++;
		from = idx + needle.length;
	}
}

/**
 * Apply edits sequentially against the evolving content. Each edit must match
 * its `oldText` exactly once at the time it is applied, so the LLM is forced
 * to supply enough surrounding context for unambiguous anchors.
 */
export function applyEdits(original: string, edits: Edit[]): ApplyEditsResult {
	if (edits.length === 0) {
		throw new ValidationError("edits[] must contain at least one edit");
	}

	let content = original;
	for (let i = 0; i < edits.length; i++) {
		const edit = edits[i];
		const position = i + 1;
		if (!edit.oldText) {
			throw new ValidationError(`edit ${position}: oldText is empty`);
		}
		if (edit.oldText === edit.newText) {
			throw new ValidationError(`edit ${position}: oldText equals newText (no-op)`);
		}
		const occurrences = countOccurrences(content, edit.oldText);
		if (occurrences === 0) {
			throw new ValidationError(`edit ${position}: oldText not found in current content`);
		}
		if (occurrences > 1) {
			throw new ValidationError(
				`edit ${position}: oldText appears ${occurrences} times - extend it with surrounding context to make it unique`,
			);
		}
		const idx = content.indexOf(edit.oldText);
		content = content.slice(0, idx) + edit.newText + content.slice(idx + edit.oldText.length);
	}

	return { content, applied: edits.length };
}

/**
 * Compute the separator needed before appending `content` so the resulting
 * file has a blank line between the original body and the new block. When
 * `ensureBlankLine` is false, only guarantees a trailing newline on the
 * original content.
 */
export function buildAppendPayload(original: string, content: string, ensureBlankLine: boolean): string {
	if (!content) return "";
	const trailing = content.endsWith("\n") ? content : `${content}\n`;
	if (original.length === 0) return trailing;

	if (ensureBlankLine) {
		if (original.endsWith("\n\n")) return trailing;
		if (original.endsWith("\n")) return `\n${trailing}`;
		return `\n\n${trailing}`;
	}

	if (original.endsWith("\n")) return trailing;
	return `\n${trailing}`;
}
