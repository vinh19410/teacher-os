import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RosterDebt } from "@/lib/tuition-from-kernel";

import { RosterTargetBandCell, RosterTuitionCell } from "./class-roster-tab";

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

	it("unpaid renders Chưa thu + 'còn' số tiền còn nợ (#340)", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited={false}
				debt={debt({ status: "unpaid", outstanding: 400000 })}
			/>,
		);
		expect(html).toContain("Chưa thu");
		expect(html).toContain("còn 400.000đ");
		expect(html).not.toContain("Quá hạn");
	});

	// #340 — ledger partial payment: roster shows the remaining, not the raw
	// invoice amount (user example: 2tr paid of 10tr → còn 8.000.000đ).
	it("partial debt renders remaining outstanding, not the raw amount", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited={false}
				debt={debt({ status: "unpaid", outstanding: 8000000 })}
			/>,
		);
		expect(html).toContain("Chưa thu");
		expect(html).toContain("còn 8.000.000đ");
	});

	// Overpay clamp (outstanding ≤ 0 while ledger awaits reconciliation):
	// badge only — "còn 0đ" would be a false signal.
	it("clamped outstanding renders badge only, no 'còn 0đ'", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited={false}
				debt={debt({ status: "unpaid", outstanding: 0 })}
			/>,
		);
		expect(html).toContain("Chưa thu");
		expect(html).not.toContain("còn 0đ");
		expect(html).not.toContain("0đ</span>");
	});

	it("overdue renders Quá hạn + 'còn' số tiền đỏ", () => {
		const html = renderToStaticMarkup(
			<RosterTuitionCell
				isInvited={false}
				debt={debt({ status: "overdue", outstanding: 800000 })}
			/>,
		);
		expect(html).toContain("Quá hạn");
		expect(html).toContain("còn 800.000đ");
		expect(html).toContain("text-danger");
	});
});

describe("RosterTargetBandCell (#625)", () => {
	it("học viên có mục tiêu hợp lệ hiển thị Band {band}", () => {
		const html = renderToStaticMarkup(
			<RosterTargetBandCell targetBand="6.5" />,
		);
		expect(html).toContain("Band 6.5");
		expect(html).not.toContain("—");
	});

	it("học viên chưa đặt mục tiêu (sentinel '—') hiển thị '—' trần, không hiện 'Band —'", () => {
		const html = renderToStaticMarkup(<RosterTargetBandCell targetBand="—" />);
		expect(html).toContain("—");
		expect(html).not.toContain("Band —");
		expect(html).not.toContain("Band");
	});

	it("học viên có targetBand rỗng hiển thị '—' trần", () => {
		const html = renderToStaticMarkup(<RosterTargetBandCell targetBand="" />);
		expect(html).toContain("—");
		expect(html).not.toContain("Band");
	});

	it("học viên có targetBand null hoặc undefined hiển thị '—' trần", () => {
		const htmlNull = renderToStaticMarkup(
			<RosterTargetBandCell targetBand={null} />,
		);
		expect(htmlNull).toContain("—");
		expect(htmlNull).not.toContain("Band");

		const htmlUndef = renderToStaticMarkup(
			<RosterTargetBandCell targetBand={undefined} />,
		);
		expect(htmlUndef).toContain("—");
		expect(htmlUndef).not.toContain("Band");
	});
});
