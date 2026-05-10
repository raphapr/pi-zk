import { Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

/**
 * Compact `renderCall` row for a zk tool. Caller passes the tool's label and
 * an optional human-readable summary of the active arguments.
 */
export function renderToolCall(theme: Theme, name: string, summary?: string) {
	let content = theme.fg("toolTitle", theme.bold(name));
	if (summary) content += ` ${theme.fg("muted", summary)}`;
	return new Text(content, 0, 0);
}

export type ResultTone = "ok" | "empty" | "error";

export interface RenderResultParts {
	status: string;
	body?: string;
	tone?: ResultTone;
	error?: string;
}

/**
 * Default `renderResult` row showing a single status line plus optional
 * expanded body when the user expands the tool output. `tone` selects the
 * status color so empty results read differently from successful ones.
 */
export function renderToolResultText(theme: Theme, parts: RenderResultParts, expanded: boolean) {
	if (parts.error) {
		return new Text(theme.fg("error", parts.error), 0, 0);
	}
	const toneKey = parts.tone === "empty" ? "warning" : parts.tone === "error" ? "error" : "success";
	let text = theme.fg(toneKey, parts.status);
	if (expanded && parts.body) {
		text += `\n${theme.fg("toolOutput", parts.body)}`;
	}
	return new Text(text, 0, 0);
}
