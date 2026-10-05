import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RosterDebt } from "@/lib/tuition-from-kernel";

import { RosterTuitionCell } from "./class-roster-tab";

function debt(partial: Partial<RosterDebt>): RosterDebt {
	return { outstanding: 0, invoiceCount: 1, status: "unpaid", ...partial };
}

describe("RosterTuitionCell (#322)", () => {
	it("học viên được mời giữ nguyên ô —", () => {
		const html = renderToStaticMarkup(<RosterTuitionCell isInvited />);
		expect(html).toContain("—");
		expect(html).not.toContain("Chưa lập phiếu");
	});

	// Ưu tiên invited cao hơn dữ liệu nợ: enrollment được mời chưa bao giờ có
	// hóa đơn của lớp, nên dù map có entry (stale) vẫn phải render "—".
	it("invited with a stale debt entry still renders —", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited
				debt={debt({ status: "overdue", outstanding: 800000 })}
			/>,
		);
		expect(html).toContain("—");
		expect(html).not.toContain("Quá hạn");
		expect(html).not.toContain("800.000đ");
	});

	it("đang học chưa có hóa đơn renders badge Chưa lập phiếu", () => {
		const html = renderToStaticMarkup(<RosterTuitionCell isInvited={false} />);
		expect(html).toContain("Chưa lập phiếu");
	});

	it("paid renders Đã thu, không còn số tiền", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited={false}
				debt={debt({ status: "paid", outstanding: 0, invoiceCount: 2 })}
			/>,
		);
		expect(html).toContain("Đã thu");
		expect(html).not.toContain("400.000đ");
	});

	it("unpaid renders Chưa thu + số tiền còn nợ", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited={false}
				debt={debt({ status: "unpaid", outstanding: 400000 })}
			/>,
		);
		expect(html).toContain("Chưa thu");
		expect(html).toContain("400.000đ");
		expect(html).not.toContain("Quá hạn");
	});

	it("overdue renders Quá hạn + số tiền đỏ", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited={false}
				debt={debt({ status: "overdue", outstanding: 800000 })}
			/>,
		);
		expect(html).toContain("Quá hạn");
		expect(html).toContain("800.000đ");
		expect(html).toContain("text-danger");
	});
});
