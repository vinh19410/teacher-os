import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Notif } from "@/lib/mock-data";
import { NotifPanel } from "./notif-panel";

describe("NotifPanel component", () => {
	it("renders empty state when notifs is empty", () => {
		const html = renderToStaticMarkup(<NotifPanel notifs={[]} />);
		expect(html).toContain('data-testid="notif-empty"');
		expect(html).toContain("Chưa có thông báo nào");
		expect(html).toContain("Thông báo");
	});

	it("renders list of notifications when notifs are provided", () => {
		const sampleNotifs: Notif[] = [
			{
				id: "n-1",
				text: "Nguyễn Văn A vừa nộp học phí 500.000đ",
				time: "10:30",
				channel: "Học phí",
				dot: "accent",
			},
			{
				id: "n-2",
				text: "Buổi học IELTS Writing sắp diễn ra",
				time: "18:00",
				channel: "Lịch dạy",
				dot: "warn",
			},
		];
		const html = renderToStaticMarkup(<NotifPanel notifs={sampleNotifs} />);
		expect(html).not.toContain('data-testid="notif-empty"');
		expect(html).toContain("Nguyễn Văn A vừa nộp học phí 500.000đ");
		expect(html).toContain("Buổi học IELTS Writing sắp diễn ra");
		expect(html).toContain("10:30 · Học phí");
		expect(html).toContain("18:00 · Lịch dạy");
		// Read-only feed: no mark-read (or any other) write control.
		expect(html).not.toContain("<button");
	});

	it("includes responsive fixed positioning classes for mobile bounds", () => {
		const html = renderToStaticMarkup(<NotifPanel notifs={[]} />);
		expect(html).toContain("max-md:fixed");
		expect(html).toContain("max-md:top-14");
		expect(html).toContain("max-md:right-4");
		expect(html).toContain("max-md:left-4");
		expect(html).toContain("max-md:w-auto");
	});
});
