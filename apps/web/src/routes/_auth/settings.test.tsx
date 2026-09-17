import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useRouteContext: () => ({ session: null }),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

import { DataTab, RulesTab, SettingsPage, TemplatesTab } from "./settings";

const session = {
	data: { user: { name: "QA Dogfood", email: "qa@school.edu" } },
};

/**
 * Issue #167: settings must never render an editable-looking form that
 * silently discards input. Until a kernel settings surface exists, every
 * config control is disabled and labelled "Chưa mở"; the data tab must not
 * claim to be a demo. The delete-account button stays out of this scope
 * (#174) — these tests pin that it is NOT disabled here.
 */
describe("SettingsPage honesty guards (issue #167)", () => {
	it("renders default unit price disabled and keeps the interim plan block", () => {
		const html = renderToStaticMarkup(<SettingsPage session={session} />);
		const priceInput = html.match(/<input[^>]*400\.000đ[^>]*>/);
		expect(priceInput?.[0]).toMatch(/\sdisabled=/);
		expect(html).toContain("Sắp ra mắt");
		expect(html).toContain("Đang dùng");
		expect(html).toContain("Chỉnh sửa tại Hồ sơ");
		expect(html).toContain("Chưa mở — sẽ lưu khi tính năng ra mắt.");
	});

	it("labels all four tabs and keeps the account fields read-only", () => {
		const html = renderToStaticMarkup(<SettingsPage session={session} />);
		for (const label of ["Tài khoản", "Mẫu tin Zalo", "Quy tắc", "Dữ liệu"]) {
			expect(html).toContain(label);
		}
		const nameInput = html.match(/<input[^>]*QA Dogfood[^>]*>/);
		expect(nameInput?.[0]).toMatch(/\sdisabled=/);
	});

	it("disables every Zalo template textarea with the not-open note", () => {
		const html = renderToStaticMarkup(<TemplatesTab />);
		const areas = html.match(/<textarea[^>]*>/g) ?? [];
		expect(areas.length).toBe(3);
		for (const area of areas) {
			expect(area).toMatch(/\sdisabled=/);
		}
		expect(html).toContain("Chưa mở — sẽ lưu khi tính năng ra mắt.");
		// The current default stays visible so the teacher can read it.
		expect(html).toContain("{{student_name}}");
	});

	it("disables all seven rule controls", () => {
		const html = renderToStaticMarkup(<RulesTab />);
		const selects = html.match(/<select[^>]*>/g) ?? [];
		expect(selects.length).toBe(6);
		for (const select of selects) {
			expect(select).toMatch(/\sdisabled=/);
		}
		const numberInputs = html.match(/<input[^>]*type="number"[^>]*>/g) ?? [];
		expect(numberInputs.length).toBe(1);
		expect(numberInputs[0]).toMatch(/\sdisabled=/);
		expect(html).toContain("Chưa mở — sẽ lưu khi tính năng ra mắt.");
	});

	it("drops the demo copy, disables exports, and leaves delete-account alone", () => {
		const html = renderToStaticMarkup(<DataTab />);
		expect(html).not.toContain("bản demo");
		// Export-specific note: "sẽ lưu" would read wrong next to file exports.
		expect(html).toContain("Chưa mở — xuất file đang ra mắt.");
		// Button ships disabled:* utility classes in its className, so match
		// the rendered attribute, not the substring.
		const csvButton = html.match(
			/<button[^>]*>Xuất CSV buổi học \+ thu tiền<\/button>/,
		);
		const jsonButton = html.match(
			/<button[^>]*>Xuất toàn bộ \(JSON\)<\/button>/,
		);
		expect(csvButton?.[0]).toMatch(/\sdisabled=/);
		expect(jsonButton?.[0]).toMatch(/\sdisabled=/);
		const deleteButton = html.match(/<button[^>]*>Xóa tài khoản<\/button>/);
		expect(deleteButton?.[0]).toBeDefined();
		expect(deleteButton?.[0]).not.toMatch(/\sdisabled=/);
	});
});
