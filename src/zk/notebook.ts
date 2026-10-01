import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { runZk, type RunZkOptions, type RunZkResult } from "./client.js";
import { type NotebookResolution, resolveNotebook } from "./config.js";

export interface ResolveActiveNotebookOptions {
	cwd: string;
	override?: string;
	env?: NodeJS.ProcessEnv;
}

/**
 * Canonicalize a notebook root. zk resolves symlinks internally, so a
 * symlinked root (e.g. `~/Cloud -> ~/Dropbox`) must be resolved here too or
 * zk prints `../../Dropbox/...` paths relative to the unresolved cwd.
 */
function realRoot(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/**
 * Resolve the notebook for a single tool call. A per-call `override` always
 * wins over env-based detection. The returned path is symlink-resolved.
 */
export function resolveActiveNotebook(options: ResolveActiveNotebookOptions): NotebookResolution {
	const override = options.override?.trim();
	const base: NotebookResolution = override
		? { path: resolve(options.cwd, override), source: "override" }
		: resolveNotebook({ cwd: options.cwd, env: options.env });
	return { ...base, path: realRoot(base.path) };
}

/**
 * Prefix `zk` arguments with `--notebook-dir <path>` so the CLI does not rely
 * on the process cwd to locate the notebook.
 */
export function withNotebookFlag(notebookPath: string, args: string[]): string[] {
	return ["--notebook-dir", notebookPath, ...args];
}

/**
 * Run zk scoped to a notebook. cwd is the notebook root because zk prints
 * `{{path}}` and resolves path arguments relative to cwd, not the notebook.
 */
export function runZkInNotebook(
	notebookPath: string,
	args: string[],
	options: Omit<RunZkOptions, "cwd" | "args"> = {},
): Promise<RunZkResult> {
	return runZk({ ...options, cwd: notebookPath, args: withNotebookFlag(notebookPath, args) });
}
