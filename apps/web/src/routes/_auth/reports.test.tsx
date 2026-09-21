import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Report, Student } from "@/lib/mock-data";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => mockNavigate,
	redirect: (opts: { to: string }) => {
		throw Object.assign(new Error("redirect"), { redirect: opts });
	},
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

function createStudent(id: string, name: string): Student {
	return {
		id,
		name,
		phone: "0901234567",
		zalo: "0901234567",
		parent: { name: "Phụ huynh", phone: "0901234568" },
		targetBand: "6.5",
		skills: ["Writing"],
		examDate: "2026-12-01",
		pkg: {
			total: 10,
			done: 0,
			remaining: 10,
			price: 4000000,
			mode: "Online",
			start: "2026-09-01",
			expiry: "2026-12-01",
		},
		tags: [],
		notes: "",
		avatar: name.slice(0, 2).toUpperCase(),
		atRisk: false,
	};
}
let mockStoreData: {
	reports: Report[];
	students: Student[];
} = {
	reports: [],
	students: [],
};

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: mockStoreData,
		dispatch: vi.fn(),
	}),
}));

import { CreateReportModal } from "@/components/modals/create-report-modal";
import { ReportsRoute, Route } from "./reports";

describe("ReportsRoute Zalo OA channel state & empty state (Issue #172)", () => {
	it("renders honest empty state with 'Chưa có báo cáo nào' and 'Zalo OA: Chưa kết nối' badge when 0 reports", () => {
		mockStoreData = {
			reports: [],
			students: [createStudent("s1", "Nguyễn Văn A")],
		};

		const html = renderToStaticMarkup(<ReportsRoute />);

		// Page title exists
		expect(html).toContain("Báo cáo phụ huynh");

		// Lead shows "Chưa có báo cáo nào" and connection status badge
		expect(html).toContain("Chưa có báo cáo nào");
		expect(html).toContain("Zalo OA: Chưa kết nối");

		// Crucial (#172): Must NOT render isolated "Gửi qua Zalo OA" claim/CTA in empty state
		expect(html).not.toMatch(/>Gửi qua Zalo OA</);
		expect(html).not.toMatch(/Gửi qua Zalo OA · 0 báo cáo/);

		// Empty states for reports table and message log
		expect(html).toContain("Chưa có báo cáo nào được gửi.");
		expect(html).toContain("Chưa có nhật ký gửi tin nhắn.");

		// Create report action exists
		expect(html).toContain("+ Tạo báo cáo tuần");
	});

	it("renders report count and connection badge when reports exist", () => {
		mockStoreData = {
			reports: [
				{
					id: "rep-1",
					sid: "s1",
					period: "01–07/09",
					sessions: 3,
					status: "sent",
					sent: "08/09 10:00",
					read: "08/09 11:30",
				},
				{
					id: "rep-2",
					sid: "s1",
					period: "08–14/09",
					sessions: 2,
					status: "draft",
					sent: "",
					read: "",
				},
			],
			students: [createStudent("s1", "Nguyễn Văn A")],
		};

		const html = renderToStaticMarkup(<ReportsRoute />);

		// Lead shows real count and connection status badge
		expect(html).toContain("2 báo cáo");
		expect(html).toContain("Zalo OA: Chưa kết nối");

		// Reports table renders student name and report details
		expect(html).toContain("Nguyễn Văn A");
		expect(html).toContain("01–07/09");
		expect(html).toContain("08–14/09");
		expect(html).toContain("Đã gửi");
		expect(html).toContain("Nháp");

		// Sent report appears in send log; draft report does not
		expect(html).toContain("Báo cáo tuần → Nguyễn Văn A");
		expect(html).toContain("Phụ huynh đã mở 08/09 11:30");
	});

	it("renders CreateReportModal with 'Zalo OA (Chưa kết nối)' option label", () => {
		const html = renderToStaticMarkup(
			<CreateReportModal open={true} onClose={vi.fn()} />,
		);

		expect(html).toContain("Zalo OA (Chưa kết nối)");
		expect(html).toContain('value="Zalo OA"');
		expect(html).toContain("Email");
	});
});

describe("/reports route guard while the parent reports cluster is hidden", () => {
	it("redirects to /dashboard in beforeLoad when the flag is off", () => {
		// The mock's createFileRoute returns the options object itself, but the
		// real Route type hides it — cast to reach the runtime beforeLoad.
		const routeOptions = Route as unknown as { beforeLoad: () => void };
		expect(() => routeOptions.beforeLoad()).toThrow("redirect");
	});
});
