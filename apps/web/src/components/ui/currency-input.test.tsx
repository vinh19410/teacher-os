import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CurrencyInput } from "./currency-input";

describe("CurrencyInput", () => {
	it("renders formatted value and inputmode numeric", () => {
		const html = renderToStaticMarkup(
			<CurrencyInput
				value="400000"
				onChange={vi.fn()}
				id="test-fee"
				placeholder="Nhập số tiền"
				aria-label="Số tiền"
			/>,
		);

		expect(html).toContain('value="400,000"');
		expect(html).toContain('type="text"');
		expect(html).toContain('inputMode="numeric"');
		expect(html).toContain('id="test-fee"');
		expect(html).toContain('placeholder="Nhập số tiền"');
		expect(html).toContain('aria-label="Số tiền"');
	});

	it("renders empty value when passed empty string", () => {
		const html = renderToStaticMarkup(
			<CurrencyInput value="" onChange={vi.fn()} />,
		);
		expect(html).toContain('value=""');
	});
});
