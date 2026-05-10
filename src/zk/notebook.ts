import { resolve } from "node:path";
import { type NotebookResolution, type NotebookSource, resolveNotebook } from "./config.js";

export interface ResolveActiveNotebookOptions {
	cwd: string;
	override?: string;
	env?: NodeJS.ProcessEnv;
}

/**
 * Resolve the notebook for a single tool call. A per-call `override` always
 * wins over env-based detection.
 */
export function resolveActiveNotebook(options: ResolveActiveNotebookOptions): NotebookResolution {
	if (options.override?.trim()) {
		const path = resolve(options.cwd, options.override.trim());
		return { path, source: "env_zk_notebook_dir" as NotebookSource };
	}
	return resolveNotebook({ cwd: options.cwd, env: options.env });
}

/**
 * Prefix `zk` arguments with `--notebook-dir <path>` so the CLI does not rely
 * on the process cwd to locate the notebook.
 */
export function withNotebookFlag(notebookPath: string, args: string[]): string[] {
	return ["--notebook-dir", notebookPath, ...args];
}
