import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichTextEditor } from "./rich-text-editor";

describe("RichTextEditor node-env smoke", () => {
	it("renders a safe shell without crashing when no DOM exists", () => {
		const html = renderToStaticMarkup(
			<RichTextEditor
				value="x"
				onChange={() => {}}
				placeholder="Nhập nội dung"
			/>,
		);
		expect(html).toContain("Nhập nội dung");
	});
});
