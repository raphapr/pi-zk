import { basename } from "node:path";
import type { Note } from "./parsers.js";

export interface CachedNote {
	path: string;
	stem: string;
	title: string;
	tags: string[];
}

export interface NoteCacheOptions {
	load: () => Promise<Note[]>;
	ttlMs?: number;
	onError?: (error: unknown) => void;
}

const DEFAULT_TTL_MS = 60_000;

/**
 * Deterministic filename stem (path without extension). Used both as the
 * canonical wikilink target form and as the primary autocomplete label.
 */
export function noteStem(path: string): string {
	const file = basename(path);
	const dot = file.lastIndexOf(".");
	if (dot <= 0) return file;
	return file.slice(0, dot);
}

export function toCachedNote(note: Note): CachedNote {
	return { path: note.path, stem: noteStem(note.path), title: note.title, tags: note.tags };
}

/**
 * In-memory cache of cached notes for a single notebook. Reload is debounced
 * by an inflight promise so concurrent autocomplete calls do not stampede.
 * Falls back to serving stale results when a reload fails so the user still
 * gets suggestions during transient zk errors.
 */
export class NoteCache {
	private notes: CachedNote[] | undefined;
	private loadedAt = 0;
	private inflight?: Promise<CachedNote[] | undefined>;

	constructor(private readonly opts: NoteCacheOptions) {}

	async get(): Promise<CachedNote[] | undefined> {
		const ttl = this.opts.ttlMs ?? DEFAULT_TTL_MS;
		if (this.notes && Date.now() - this.loadedAt < ttl) {
			return this.notes;
		}
		return this.refresh();
	}

	async refresh(): Promise<CachedNote[] | undefined> {
		if (this.inflight) return this.inflight;
		this.inflight = (async () => {
			try {
				const raw = await this.opts.load();
				this.notes = raw.map(toCachedNote);
				this.loadedAt = Date.now();
				return this.notes;
			} catch (error) {
				this.opts.onError?.(error);
				return this.notes; // serve stale on failure
			} finally {
				this.inflight = undefined;
			}
		})();
		return this.inflight;
	}

	invalidate(): void {
		this.notes = undefined;
		this.loadedAt = 0;
	}

	peek(): CachedNote[] | undefined {
		return this.notes;
	}
}
