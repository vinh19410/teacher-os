import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "./data-table";

describe("DataTable empty fallback (Issue #118)", () => {
	it("renders fallback row with default message when rows is empty", () => {
		const html = renderToStaticMarkup(
			<DataTable headers={["Cột 1", "Cột 2", "Cột 3"]} rows={[]} />,
		);

		expect(html).toContain("<th");
		expect(html).toContain("Cột 1");
		expect(html).toContain('colSpan="3"');
		expect(html).toContain("Chưa có dữ liệu.");
	});

	it("renders custom emptyMessage when provided", () => {
		const html = renderToStaticMarkup(
			<DataTable
				headers={["Học viên", "Gói"]}
				rows={[]}
				emptyMessage="Không có học viên nào."
			/>,
		);

		expect(html).toContain('colSpan="2"');
		expect(html).toContain("Không có học viên nào.");
	});

	it("renders rows normally when rows are present", () => {
		const html = renderToStaticMarkup(
			<DataTable
				headers={["Tên"]}
				rows={[{ cells: [<span key="1">Nguyễn Văn A</span>] }]}
			/>,
		);

		expect(html).toContain("Nguyễn Văn A");
		expect(html).not.toContain("Chưa có dữ liệu.");
	});
});
