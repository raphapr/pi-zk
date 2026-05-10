import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAppendNoteTool } from "./tools/append-note.js";
import { registerCreateNoteTool } from "./tools/create-note.js";
import { registerEditNoteTool } from "./tools/edit-note.js";
import { registerLastModifiedTool } from "./tools/last-modified.js";
import { registerLinkedByTool, registerLinkToTool, registerRelatedTool } from "./tools/link-graph.js";
import { registerListTagsTool } from "./tools/list-tags.js";
import { registerRandomNoteTool } from "./tools/random-note.js";
import { registerReadNoteTool } from "./tools/read-note.js";
import { registerSearchNotesTool } from "./tools/search-notes.js";
import { registerTaglessNotesTool } from "./tools/tagless-notes.js";

export default function pizkExtension(pi: ExtensionAPI): void {
	registerSearchNotesTool(pi);
	registerReadNoteTool(pi);
	registerListTagsTool(pi);
	registerLastModifiedTool(pi);
	registerTaglessNotesTool(pi);
	registerRandomNoteTool(pi);
	registerLinkToTool(pi);
	registerLinkedByTool(pi);
	registerRelatedTool(pi);
	registerCreateNoteTool(pi);
	registerEditNoteTool(pi);
	registerAppendNoteTool(pi);
}
