import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChipMulti } from "./chip-multi";

const options = [
	{ value: "Writing", label: "Writing" },
	{ value: "Speaking", label: "Speaking" },
];

describe("ChipMulti view-only", () => {
	it("renders disabled buttons while keeping aria-pressed values", () => {
		const html = renderToStaticMarkup(
			<ChipMulti
				options={options}
				value={["Writing"]}
				onChange={() => undefined}
				disabled
			/>,
		);
		// disabled="" phân biệt được với chuỗi class "disabled:*" không render.
		expect(html).toContain('disabled=""');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('aria-pressed="false"');
	});

	it("stays interactive when disabled is not set", () => {
		const html = renderToStaticMarkup(
			<ChipMulti
				options={options}
				value={["Writing"]}
				onChange={() => undefined}
			/>,
		);
		expect(html).not.toContain('disabled=""');
	});
});
