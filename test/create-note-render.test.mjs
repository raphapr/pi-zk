import { test } from "node:test";
import assert from "node:assert/strict";
import { registerCreateNoteTool } from "../src/tools/create-note.ts";

function captureTool(register) {
	let definition;
	const fakePi = {
		registerTool(def) {
			definition = def;
		},
	};
	register(fakePi);
	if (!definition) throw new Error("register did not register a tool");
	return definition;
}

const theme = {
	fg(_key, text) {
		return text;
	},
	bold(text) {
		return text;
	},
};

function renderText(component) {
	return component.render(120).join("\n").trimEnd();
}

test("zk_create_note renderResult does not print undefined for failed results", () => {
	const tool = captureTool(registerCreateNoteTool);
	const component = tool.renderResult(
		{ content: [{ type: "text", text: "zk: error: path is outside the notebook" }], details: {} },
		{ expanded: false, isPartial: false },
		theme,
	);
	const rendered = renderText(component);
	assert.equal(rendered.includes("undefined"), false);
	assert.match(rendered, /path is outside the notebook/);
});
