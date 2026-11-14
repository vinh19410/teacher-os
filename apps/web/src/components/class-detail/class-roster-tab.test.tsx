// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { mapKernelSnapshot } from "@/lib/repos/kernel";
import type { RosterDebt } from "@/lib/tuition-from-kernel";
import {
	classRow,
	enrollmentRow,
	snapshotFixture,
	studentRow,
} from "@/test/kernel-harness";
import { ResendInviteButton } from "../students/pending-invite-callout";
import {
	ClassRosterTab,
	RosterTargetBandCell,
	RosterTuitionCell,
} from "./class-roster-tab";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

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

describe("ClassRosterTab paused gating & confirm async (#694)", () => {
	function renderRoster(opts: {
		paused?: boolean;
		run?: ReturnType<typeof vi.fn>;
		alsoActiveClass?: boolean;
		alsoActiveStatus?: "active" | "invited";
	}) {
		const snapshot = snapshotFixture({
			classes: [
				classRow({
					id: "cl-p",
					name: "Lớp Tạm Dừng",
					status: opts.paused ? "paused" : "active",
				}),
				classRow({
					id: "cl-active",
					name: "Lớp Hoạt Động",
					status: "active",
				}),
			],
			students: [
				studentRow({
					id: "st-invited",
					name: "Học viên Được Mời",
					email: "inv@test.local",
					portalLinked: false,
				}),
				studentRow({
					id: "st-active-only-paused",
					name: "Học viên Chờ Cổng",
					email: "only@test.local",
					portalLinked: false,
				}),
				studentRow({
					id: "st-multi",
					name: "Học viên Nhiều Lớp",
					email: "multi@test.local",
					portalLinked: false,
				}),
			],
			enrollments: [
				enrollmentRow({
					id: "en-inv",
					classId: "cl-p",
					studentId: "st-invited",
					status: "invited",
				}),
				enrollmentRow({
					id: "en-only",
					classId: "cl-p",
					studentId: "st-active-only-paused",
					status: "active",
				}),
				enrollmentRow({
					id: "en-multi-p",
					classId: "cl-p",
					studentId: "st-multi",
					status: "active",
				}),
				...(opts.alsoActiveClass
					? [
							enrollmentRow({
								id: "en-multi-a",
								classId: "cl-active",
								studentId: "st-multi",
								status: opts.alsoActiveStatus ?? "active",
							}),
						]
					: []),
			],
		});
		const data = mapKernelSnapshot(snapshot);
		const cls = data.classes.find((c) => c.id === "cl-p");
		if (!cls) throw new Error("expected cl-p class in snapshot");
		const studentById = (id: string) => data.students.find((s) => s.id === id);
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const run = (opts.run ??
			vi
				.fn()
				.mockResolvedValue({ kind: "refreshed" })) as unknown as Parameters<
			typeof ClassRosterTab
		>[0]["run"];
		render(
			<QueryClientProvider client={qc}>
				<ClassRosterTab
					cls={cls}
					data={data}
					studentById={studentById}
					rosterDebt={new Map()}
					run={run}
					busy={false}
				/>
			</QueryClientProvider>,
		);
		return { run };
	}

	it("disables Kích hoạt and paused-only ResendInviteButton while keeping Hủy lời mời enabled, and allows resend if student has another active class", () => {
		renderRoster({ paused: true, alsoActiveClass: true });

		const invitedRow = screen
			.getByText("Học viên Được Mời")
			.closest("tr") as HTMLElement;
		expect(
			(
				within(invitedRow).getByRole("button", {
					name: "Kích hoạt",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			(
				within(invitedRow).getByRole("button", {
					name: /Gửi lại lời mời/,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			(
				within(invitedRow).getByRole("button", {
					name: "Hủy lời mời",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false);

		const pausedOnlyRow = screen
			.getByText("Học viên Chờ Cổng")
			.closest("tr") as HTMLElement;
		expect(
			(
				within(pausedOnlyRow).getByRole("button", {
					name: /Gửi lại lời mời/,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);

		const multiRow = screen
			.getByText("Học viên Nhiều Lớp")
			.closest("tr") as HTMLElement;
		expect(
			(
				within(multiRow).getByRole("button", {
					name: /Gửi lại lời mời/,
				}) as HTMLButtonElement
			).disabled,
		).toBe(false);
	});

	it("keeps confirmation modal open until await run(...) settles", async () => {
		const deferred = Promise.withResolvers<{ kind: "refreshed" }>();
		const runMock = vi.fn().mockReturnValue(deferred.promise);
		renderRoster({ paused: true, run: runMock });

		const invitedRow = screen
			.getByText("Học viên Được Mời")
			.closest("tr") as HTMLElement;
		fireEvent.click(
			within(invitedRow).getByRole("button", { name: "Hủy lời mời" }),
		);
		const dialog = screen.getByRole("dialog", {
			name: "Hủy lời mời tham gia lớp?",
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Hủy lời mời" }),
		);

		expect(runMock).toHaveBeenCalledTimes(1);
		expect(
			screen.getByRole("dialog", { name: "Hủy lời mời tham gia lớp?" }),
		).toBeTruthy();

		deferred.resolve({ kind: "refreshed" });
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Hủy lời mời tham gia lớp?" }),
			).toBeNull(),
		);
	});

	it("M1: keeps ResendInviteButton disabled when another active class enrollment is still invited", () => {
		renderRoster({
			paused: true,
			alsoActiveClass: true,
			alsoActiveStatus: "invited",
		});

		const multiRow = screen
			.getByText("Học viên Nhiều Lớp")
			.closest("tr") as HTMLElement;
		expect(
			(
				within(multiRow).getByRole("button", {
					name: /Gửi lại lời mời/,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("ResendInviteButton surfaces CLASS_PAUSED 409 Vietnamese message and invalidates caches", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(
						JSON.stringify({ error: "paused", code: "CLASS_PAUSED" }),
						{ status: 409, headers: { "content-type": "application/json" } },
					),
				),
		);
		const qc = new QueryClient({
			defaultOptions: { mutations: { retry: false } },
		});
		const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
		render(
			<QueryClientProvider client={qc}>
				<ResendInviteButton
					target={{
						kind: "student",
						studentId: "st-invited",
						enrollmentId: "en-inv",
						recipientLabel: "inv@test.local",
					}}
				/>
			</QueryClientProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: /Gửi lại lời mời/ }));
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Lớp đang tạm dừng — không thể gửi lại lời mời.",
			),
		);
		const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
		expect(keys).toContainEqual(["students", "invitations"]);
		expect(keys).toContainEqual(["kernel"]);
	});
});
