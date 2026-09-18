import { readFileSync } from "node:fs";
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
	});

	it("includes responsive fixed positioning classes for mobile bounds", () => {
		const html = renderToStaticMarkup(<NotifPanel notifs={[]} />);
		expect(html).toContain("max-app:fixed");
		expect(html).toContain("max-app:top-14");
		expect(html).toContain("max-app:right-4");
		expect(html).toContain("max-app:left-4");
		expect(html).toContain("max-app:w-auto");
	});
});

describe("Topbar notification contract", () => {
	it("conditions unread badge on data.notifs.length > 0", () => {
		const src = readFileSync(new URL("./topbar.tsx", import.meta.url), "utf-8");
		expect(src).toMatch(
			/\{data\.notifs\.length > 0 && \(\s*<span[^>]*data-testid="notif-badge"/,
		);
		expect(src).toMatch(
			/ref=\{bellWrapRef\}\s+className="[^"]*max-app:ml-auto[^"]*"/,
		);
	});
});
