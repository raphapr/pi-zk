import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type NotebookSource = "env_zk_notebook_dir" | "env_zk_dir" | "cwd" | "walk_up";

export interface NotebookResolution {
	path: string;
	source: NotebookSource;
}

export interface ResolveNotebookOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv;
	exists?: (path: string) => boolean;
}

export class NotebookNotFoundError extends Error {
	constructor(
		message: string,
		readonly cwd: string,
	) {
		super(message);
		this.name = "NotebookNotFoundError";
	}
}

function hasZkMarker(dir: string, exists: (p: string) => boolean): boolean {
	return exists(join(dir, ".zk"));
}

function walkUpForNotebook(start: string, exists: (p: string) => boolean): string | undefined {
	let current = start;
	for (;;) {
		if (hasZkMarker(current, exists)) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

export function resolveNotebook(options: ResolveNotebookOptions): NotebookResolution {
	const exists = options.exists ?? existsSync;
	const env = options.env ?? process.env;

	const envNotebookDir = env.ZK_NOTEBOOK_DIR?.trim();
	if (envNotebookDir) {
		return { path: resolve(envNotebookDir), source: "env_zk_notebook_dir" };
	}

	const envZkDir = env.ZK_DIR?.trim();
	if (envZkDir) {
		return { path: resolve(envZkDir), source: "env_zk_dir" };
	}

	const cwd = isAbsolute(options.cwd) ? options.cwd : resolve(options.cwd);

	if (hasZkMarker(cwd, exists)) {
		return { path: cwd, source: "cwd" };
	}

	const ancestor = walkUpForNotebook(cwd, exists);
	if (ancestor) {
		return { path: ancestor, source: "walk_up" };
	}

	throw new NotebookNotFoundError(
		[
			"Could not find a zk notebook.",
			"Set ZK_NOTEBOOK_DIR or ZK_DIR, or run Pi inside a directory whose ancestor contains `.zk/`.",
		].join(" "),
		cwd,
	);
}
