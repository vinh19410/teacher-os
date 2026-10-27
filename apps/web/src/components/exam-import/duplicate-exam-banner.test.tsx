import type { ExamImportDuplicate } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DuplicateExamBanner } from "./duplicate-exam-banner";

/**
 * Banner trùng đề (TOS-25, plan D5) — controlled component nên static render
 * bao trọn text/role/nút; hành vi điều hướng do màn import test (nút chỉ
 * gọi `onReopen`). Text "Phát hiện tệp trùng" là contract e2e AC-002.
 */

const duplicate: ExamImportDuplicate = {
	jobId: "job-1",
	title: "Cambridge IELTS Sample",
	completedAt: "2026-10-20T00:00:00.000Z",
};

describe("DuplicateExamBanner (TOS-25)", () => {
	it("hiện text D5 đủ title + ngày dd/MM và nút 'Mở lại bản nháp cũ (0 Cr)'", () => {
		const html = renderToStaticMarkup(
			<DuplicateExamBanner duplicate={duplicate} onReopen={() => {}} />,
		);
		expect(html).toContain("Phát hiện tệp trùng mã băm");
		expect(html).toContain("với đề &quot;Cambridge IELTS Sample&quot;");
		// toLocaleDateString("vi-VN") theo TZ môi trường — chỉ khoá format
		// dd/MM thô (ngày 20, năm 2026 luôn xuất hiện).
		expect(html).toContain("/2026");
		expect(html).toContain("Mở lại bản nháp cũ (0 Cr)");
		expect(html).toContain("duplicate-reopen-button");
	});

	it('Alert có role="status" (contract phase-02 + e2e)', () => {
		const html = renderToStaticMarkup(
			<DuplicateExamBanner duplicate={duplicate} onReopen={() => {}} />,
		);
		expect(html).toContain('role="status"');
	});

	it("title null → câu không nêu tên đề, không 'undefined'", () => {
		const html = renderToStaticMarkup(
			<DuplicateExamBanner
				duplicate={{ ...duplicate, title: null }}
				onReopen={() => {}}
			/>,
		);
		expect(html).toContain("với một đề đã bóc tách trước đó");
		expect(html).not.toContain("undefined");
	});

	it("completedAt null hoặc chuỗi ngày hỏng → không render mốc ngày, không 'Invalid Date'", () => {
		for (const completedAt of [null, "not-a-valid-date"]) {
			const html = renderToStaticMarkup(
				<DuplicateExamBanner
					duplicate={{ ...duplicate, completedAt }}
					onReopen={() => {}}
				/>,
			);
			expect(html).toContain("với đề &quot;Cambridge IELTS Sample&quot;.");
			expect(html).not.toContain("Invalid Date");
		}
	});
});
