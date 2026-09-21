import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useRouteContext: () => ({ session: null }),
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: undefined }),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	queryOptions: (opts: unknown) => opts,
}));

import {
	DataTab,
	RulesTab,
	SettingsPage,
	TemplatesTab,
	validateSettingsSearch,
} from "./settings";

const session = {
	data: { user: { name: "QA Dogfood", email: "qa@school.edu" } },
};

/**
 * Issue #179: Settings controls are now connected to the kernel settings surface.
 * The controls are enabled and editable; "Chưa mở — sẽ lưu khi tính năng ra mắt"
 * note is removed from active tabs (Account, Templates, Rules). DataTab retains
 * honest export state and admin contact note (#174).
 */
describe("SettingsPage persistence & honest guards (issue #179, follow-up #167)", () => {
	it("renders default unit price editable and keeps the interim plan block", () => {
		const html = renderToStaticMarkup(<SettingsPage session={session} />);
		const priceInput = html.match(/<input[^>]*400\.000đ[^>]*>/);
		expect(priceInput?.[0]).not.toMatch(/\sdisabled=/);
		expect(html).toContain("Sắp ra mắt");
		expect(html).toContain("Đang dùng");
		expect(html).toContain("Chỉnh sửa tại Hồ sơ");
		expect(html).not.toContain("Chưa mở — sẽ lưu khi tính năng ra mắt.");
		expect(html).toContain("Lưu đơn giá");
	});

	it("labels all four tabs and keeps the account fields read-only", () => {
		const html = renderToStaticMarkup(<SettingsPage session={session} />);
		for (const label of ["Tài khoản", "Mẫu tin Zalo", "Quy tắc", "Dữ liệu"]) {
			expect(html).toContain(label);
		}
		const nameInput = html.match(/<input[^>]*QA Dogfood[^>]*>/);
		expect(nameInput?.[0]).toMatch(/\sdisabled=/);
	});

	it("enables every Zalo template textarea without the not-open note", () => {
		const html = renderToStaticMarkup(<TemplatesTab onSave={() => {}} />);
		const areas = html.match(/<textarea[^>]*>/g) ?? [];
		expect(areas.length).toBe(2);
		for (const area of areas) {
			expect(area).not.toMatch(/\sdisabled=/);
		}
		expect(html).not.toContain("Chưa mở — sẽ lưu khi tính năng ra mắt.");
		expect(html).not.toContain("Mẫu báo cáo tuần");
		expect(html).toContain("{{student_name}}");
		expect(html).toContain("Lưu mẫu tin");
	});

	it("enables all seven rule controls without the not-open note", () => {
		const html = renderToStaticMarkup(<RulesTab onSave={() => {}} />);
		const selects = html.match(/<select[^>]*>/g) ?? [];
		expect(selects.length).toBe(6);
		for (const select of selects) {
			expect(select).not.toMatch(/\sdisabled=/);
		}
		const numberInputs = html.match(/<input[^>]*type="number"[^>]*>/g) ?? [];
		expect(numberInputs.length).toBe(1);
		expect(numberInputs[0]).not.toMatch(/\sdisabled=/);
		expect(html).not.toContain("Chưa mở — sẽ lưu khi tính năng ra mắt.");
		expect(html).toContain("Lưu quy tắc");
	});

	it("drops the demo copy, disables exports, and offers admin contact instead of a dead delete button (#174)", () => {
		const html = renderToStaticMarkup(<DataTab />);
		expect(html).not.toContain("bản demo");
		expect(html).toContain("Chưa mở — xuất file đang ra mắt.");
		const csvButton = html.match(
			/<button[^>]*>Xuất CSV buổi học \+ thu tiền<\/button>/,
		);
		const jsonButton = html.match(
			/<button[^>]*>Xuất toàn bộ \(JSON\)<\/button>/,
		);
		expect(csvButton?.[0]).toMatch(/\sdisabled=/);
		expect(jsonButton?.[0]).toMatch(/\sdisabled=/);
		expect(html).not.toContain("Xóa tài khoản");
		expect(html).toContain("liên hệ admin");
	});
});

describe("settings tab deep-link (issue #119)", () => {
	it("accepts whitelisted tabs and falls back silently for anything else", () => {
		expect(validateSettingsSearch({ tab: "templates" })).toEqual({
			tab: "templates",
		});
		expect(validateSettingsSearch({ tab: "data" })).toEqual({ tab: "data" });
		expect(validateSettingsSearch({ tab: "javascript:" })).toEqual({});
		expect(validateSettingsSearch({ tab: 42 })).toEqual({});
		expect(validateSettingsSearch({})).toEqual({});
	});

	it("renders the URL-controlled tab instead of always Tài khoản", () => {
		const templates = renderToStaticMarkup(
			<SettingsPage session={session} tab="templates" />,
		);
		expect(templates).toContain("{{student_name}}");
		expect(templates).not.toContain("Đang dùng");

		const data = renderToStaticMarkup(
			<SettingsPage session={session} tab="data" />,
		);
		expect(data).toContain("liên hệ admin");
		expect(data).not.toContain("Đang dùng");
	});

	it("defaults to Tài khoản when no tab prop is given", () => {
		const html = renderToStaticMarkup(<SettingsPage session={session} />);
		expect(html).toContain("Đang dùng");
	});
});
