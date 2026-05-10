export interface Note {
	path: string;
	title: string;
	tags: string[];
}

export interface Tag {
	name: string;
	count: number;
}

/**
 * Format string the extension passes to `zk list` to emit machine-readable rows.
 * Tab is used as a field separator because zk's template language allows
 * literal `\t` and tabs are rare in filenames or note titles.
 */
export const NOTE_LIST_FORMAT = "{{path}}\\t{{title}}\\t{{join tags \",\"}}";

/**
 * Format string the extension passes to `zk tag list`.
 */
export const TAG_LIST_FORMAT = "{{name}}\\t{{note-count}}";

function splitTags(raw: string): string[] {
	return raw
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
}

export function parseNoteLine(line: string): Note | undefined {
	if (!line) return undefined;
	const parts = line.split("\t");
	if (parts.length < 2) return undefined;
	const path = parts[0]?.trim();
	const title = parts[1]?.trim() ?? "";
	const tagsRaw = parts[2] ?? "";
	if (!path) return undefined;
	return { path, title, tags: splitTags(tagsRaw) };
}

export function parseNoteList(stdout: string): Note[] {
	const notes: Note[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.replace(/\r$/, "");
		if (!trimmed) continue;
		const note = parseNoteLine(trimmed);
		if (note) notes.push(note);
	}
	return notes;
}

export function parseTagLine(line: string): Tag | undefined {
	if (!line) return undefined;
	const parts = line.split("\t");
	if (parts.length < 2) return undefined;
	const name = parts[0]?.trim();
	const count = Number.parseInt(parts[1]?.trim() ?? "", 10);
	if (!name || !Number.isFinite(count)) return undefined;
	return { name, count };
}

export function parseTagList(stdout: string): Tag[] {
	const tags: Tag[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.replace(/\r$/, "");
		if (!trimmed) continue;
		const tag = parseTagLine(trimmed);
		if (tag) tags.push(tag);
	}
	return tags;
}
