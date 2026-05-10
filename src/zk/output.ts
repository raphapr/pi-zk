import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	type TruncationResult,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";

export interface FormatTextOptions {
	text: string;
	prefix?: string; // temp-file prefix (without trailing dash)
	maxBytes?: number;
	maxLines?: number;
}

export interface FormatTextResult {
	visible: string;
	truncated: boolean;
	truncation?: TruncationResult;
	fullOutputPath?: string;
}

/**
 * Apply head truncation to `text`. When the result is truncated, write the
 * full content to a temp file and append a clear notice pointing at it.
 */
export async function formatTextOutput(options: FormatTextOptions): Promise<FormatTextResult> {
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const truncation = truncateHead(options.text, { maxBytes, maxLines });
	let visible = truncation.content;

	if (!truncation.truncated) {
		return { visible, truncated: false };
	}

	const prefix = options.prefix ?? "pi-zk-";
	const tempDir = await mkdtemp(join(tmpdir(), prefix));
	const fullOutputPath = join(tempDir, "output.txt");
	await withFileMutationQueue(fullOutputPath, async () => {
		await writeFile(fullOutputPath, options.text, "utf8");
	});

	const truncatedLines = truncation.totalLines - truncation.outputLines;
	const truncatedBytes = truncation.totalBytes - truncation.outputBytes;
	visible += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	visible += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	visible += ` ${truncatedLines} lines (${formatSize(truncatedBytes)}) omitted.`;
	visible += ` Full output saved to: ${fullOutputPath}]`;

	return {
		visible,
		truncated: true,
		truncation,
		fullOutputPath,
	};
}

/**
 * Render a column-aligned note list (path / title / tags) for the LLM.
 * Compact two-column when tags exist, single-column when not.
 */
export function renderNoteListText(notes: Array<{ path: string; title: string; tags: string[] }>, headerCount?: number): string {
	const count = headerCount ?? notes.length;
	if (notes.length === 0) return `Found ${count} note${count === 1 ? "" : "s"}.`;

	const lines: string[] = [`Found ${count} note${count === 1 ? "" : "s"}:`, ""];
	for (const note of notes) {
		const tags = note.tags.length ? `  [${note.tags.join(", ")}]` : "";
		lines.push(`- ${note.path}\t${note.title}${tags}`);
	}
	return lines.join("\n");
}

/**
 * Render a tag list with counts.
 */
export function renderTagListText(tags: Array<{ name: string; count: number }>): string {
	if (tags.length === 0) return "No tags in notebook.";
	const lines: string[] = [`Found ${tags.length} tag${tags.length === 1 ? "" : "s"}:`, ""];
	for (const tag of tags) {
		lines.push(`- ${tag.name} (${tag.count})`);
	}
	return lines.join("\n");
}
