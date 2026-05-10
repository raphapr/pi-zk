import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { runZk } from "../zk/client.js";
import { resolveActiveNotebook, withNotebookFlag } from "../zk/notebook.js";
import { formatTextOutput, renderTagListText } from "../zk/output.js";
import { parseTagList, TAG_LIST_FORMAT, type Tag } from "../zk/parsers.js";
import { NotebookOverride } from "../zk/schemas.js";
import { renderToolCall, renderToolResultText } from "./common.js";

export const ListTagsParams = Type.Object({
	notebook: NotebookOverride,
});

export type ListTagsArgs = Static<typeof ListTagsParams>;

interface ListTagsDetails {
	tags: Tag[];
	notebook: string;
}

export function buildListTagsArgs(): string[] {
	return ["tag", "list", "--quiet", "--no-pager", "--format", TAG_LIST_FORMAT];
}

export function registerListTagsTool(pi: ExtensionAPI): void {
	pi.registerTool(
		defineTool({
			name: "zk_list_tags",
			label: "zk Tags",
			description: "List every tag in the active zk notebook with note counts. Useful for triage and discovery.",
			parameters: ListTagsParams,
			promptSnippet: "zk_list_tags: List all tags in the active zk notebook with note counts.",
			promptGuidelines: ["Use zk_list_tags when the user asks about tag taxonomy or wants to discover tags."],
			async execute(_toolCallId, params: ListTagsArgs, signal, _onUpdate, ctx) {
				const notebook = resolveActiveNotebook({ cwd: ctx.cwd, override: params.notebook });
				const args = withNotebookFlag(notebook.path, buildListTagsArgs());
				const result = await runZk({ cwd: ctx.cwd, args, signal, timeoutMs: 15_000 });
				const tags = parseTagList(result.stdout).sort((a, b) => b.count - a.count);
				const text = renderTagListText(tags);
				const formatted = await formatTextOutput({ text, prefix: "pi-zk-tags-" });
				const details: ListTagsDetails = { tags, notebook: notebook.path };
				return { content: [{ type: "text", text: formatted.visible }], details };
			},
			renderCall(_args, theme) {
				return renderToolCall(theme, "zk_list_tags");
			},
			renderResult(result, { expanded }, theme) {
				const details = result.details as ListTagsDetails | undefined;
				if (!details) return renderToolResultText(theme, { status: "done" }, expanded);
				const tone = details.tags.length === 0 ? "empty" : "ok";
				const status = details.tags.length === 0
					? "no tags"
					: `${details.tags.length} tag${details.tags.length === 1 ? "" : "s"}`;
				const body = details.tags
					.slice(0, expanded ? 25 : 5)
					.map((t) => `${t.name} (${t.count})`)
					.join("\n");
				return renderToolResultText(theme, { status, body, tone }, expanded);
			},
		}),
	);
}
