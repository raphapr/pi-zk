import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
const MAX_TITLE_LENGTH = 200;

export function validateTitle(title: string): string {
	if (typeof title !== "string") throw new ValidationError("title must be a string");
	const trimmed = title.trim();
	if (!trimmed) throw new ValidationError("title is empty");
	if (trimmed.length > MAX_TITLE_LENGTH) {
		throw new ValidationError(`title exceeds ${MAX_TITLE_LENGTH} characters`);
	}
	if (CONTROL_CHARS.test(trimmed)) {
		throw new ValidationError("title contains control characters");
	}
	if (trimmed.includes("/") || trimmed.includes("\\")) {
		throw new ValidationError("title must not contain path separators");
	}
	return trimmed;
}

/**
 * Validate a notebook-relative note reference. Accepts partial paths and
 * bare note IDs (e.g. `200911172034`) because zk matches on path prefixes.
 * Does not touch the filesystem.
 */
export function validateNoteRef(ref: string): string {
	if (typeof ref !== "string") throw new ValidationError("path must be a string");
	const trimmed = ref.trim();
	if (!trimmed) throw new ValidationError("path is empty");
	if (CONTROL_CHARS.test(trimmed)) throw new ValidationError("path contains control characters");
	if (isAbsolute(trimmed)) throw new ValidationError("path must be notebook-relative");
	const segments = trimmed.split(/[\\/]+/).filter((segment) => segment.length > 0);
	if (segments.some((segment) => segment === "..")) {
		throw new ValidationError("path must not traverse upwards (..)");
	}
	return trimmed;
}

export function validateRelativeDirectory(dir: string): string {
	if (typeof dir !== "string") throw new ValidationError("directory must be a string");
	if (!dir.trim()) throw new ValidationError("directory is empty");
	if (CONTROL_CHARS.test(dir)) throw new ValidationError("directory contains control characters");
	if (isAbsolute(dir)) throw new ValidationError("directory must be relative");
	const segments = dir.split(/[\\/]+/).filter((segment) => segment.length > 0);
	if (segments.some((segment) => segment === "..")) {
		throw new ValidationError("directory must not traverse upwards (..)");
	}
	return segments.join("/");
}

export interface ResolvePathOptions {
	realpath?: (path: string) => string;
}

/**
 * Resolve `target` against `notebookRoot` and confirm the result stays inside
 * the notebook. Follows symlinks via `realpath` when available so that links
 * pointing outside the notebook are rejected.
 */
function assertInsideNotebook(resolvedRoot: string, resolvedTarget: string, originalTarget: string, allowRoot = false): void {
	const rel = relative(resolvedRoot, resolvedTarget);
	if ((!allowRoot && !rel) || rel.startsWith("..") || isAbsolute(rel)) {
		throw new ValidationError(`path is outside notebook: ${originalTarget}`);
	}
	if (rel.split(sep).includes("..")) {
		throw new ValidationError(`path traverses outside notebook: ${originalTarget}`);
	}
}

function realNotebookRoot(notebookRoot: string, real: (path: string) => string): string {
	try {
		return real(notebookRoot);
	} catch {
		return resolve(notebookRoot);
	}
}

export function resolveNotebookPath(notebookRoot: string, target: string, options: ResolvePathOptions = {}): string {
	if (typeof target !== "string" || !target.trim()) {
		throw new ValidationError("path is empty");
	}
	if (CONTROL_CHARS.test(target)) throw new ValidationError("path contains control characters");

	const real = options.realpath ?? ((p) => realpathSync(p));
	const resolvedRoot = realNotebookRoot(notebookRoot, real);
	const absoluteTarget = isAbsolute(target) ? target : resolve(resolvedRoot, target);
	let resolvedTarget: string;
	try {
		resolvedTarget = real(absoluteTarget);
	} catch {
		// Path may not exist yet (e.g. `zk new` not run). Fall back to lexical resolution.
		resolvedTarget = resolve(absoluteTarget);
	}

	assertInsideNotebook(resolvedRoot, resolvedTarget, target);
	return resolvedTarget;
}

/**
 * Resolve a not-yet-created path under the notebook without allowing an
 * existing symlinked parent to redirect creation outside the notebook.
 */
export function resolveCreatableNotebookPath(notebookRoot: string, target: string, options: ResolvePathOptions = {}): string {
	if (typeof target !== "string" || !target.trim()) {
		throw new ValidationError("path is empty");
	}
	if (CONTROL_CHARS.test(target)) throw new ValidationError("path contains control characters");

	const real = options.realpath ?? ((p) => realpathSync(p));
	const resolvedRoot = realNotebookRoot(notebookRoot, real);
	const lexicalTarget = resolve(isAbsolute(target) ? target : resolve(resolvedRoot, target));
	assertInsideNotebook(resolvedRoot, lexicalTarget, target);

	const missing: string[] = [];
	let existing = lexicalTarget;
	let resolvedExisting: string | undefined;
	for (;;) {
		try {
			resolvedExisting = real(existing);
			break;
		} catch {
			const parent = dirname(existing);
			if (parent === existing) throw new ValidationError(`path is outside notebook: ${target}`);
			missing.unshift(basename(existing));
			existing = parent;
		}
	}

	assertInsideNotebook(resolvedRoot, resolvedExisting, target, true);
	return resolve(resolvedExisting, ...missing);
}
