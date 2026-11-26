import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { type RefObject, useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	type DashboardRiskIssue,
	type DashboardRiskRow,
	formatWeekdayLong,
} from "@/lib/dashboard-from-kernel";
import { formatDayMonth, isValidISODate } from "@/lib/week-grid";

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function formatIssueDescription(issue: DashboardRiskIssue): string {
	if (issue.kind === "missed-check-in") {
		const dateLabel = issue.dateIso
			? formatDayMonth(issue.dateIso)
			: formatWeekdayLong(issue.day);
		const timePart = issue.time.trim() ? ` (${issue.time.trim()})` : "";
		return `Buổi ${dateLabel}${timePart} · ${issue.className} chưa được ghi nhận.`;
	}
	const dueLabel = isValidISODate(issue.due)
		? formatDayMonth(issue.due)
		: issue.due.trim();
	const prefix = issue.className
		? `${issue.title} (${issue.className})`
		: issue.title;
	return dueLabel
		? `${prefix} · hạn nộp ${dueLabel}, chưa nộp.`
		: `${prefix} · đã quá hạn, chưa nộp.`;
}

/**
 * Ngăn kéo trượt phải hiển thị chi tiết học viên cần kiểm tra.
 * - Render qua portal ở `z-40`/`z-[45]` (dưới `CommandDialog` `z-50` và `Modal` `z-100`).
 * - Giữ `onCloseRef` / `returnFocusRef` và chỉ keyed effect theo `openId` để
 *   chu kỳ tick 60s không reset focus.
 * - Focus trap bỏ lọc `offsetParent !== null` để hoạt động chuẩn cả trên JSDOM
 *   lẫn trình duyệt thật (cùng mẫu `BillingTimelineDrawer`).
 */
export function StudentRiskDrawer({
	row,
	issues,
	classNames,
	onClose,
	returnFocusTo,
	fallbackFocusRef,
}: {
	row: DashboardRiskRow | null;
	issues: readonly DashboardRiskIssue[];
	classNames: readonly string[];
	onClose: () => void;
	returnFocusTo: HTMLElement | null;
	fallbackFocusRef?: RefObject<HTMLElement | null>;
}) {
	const titleId = useId();
	const overlayRef = useRef<HTMLDivElement>(null);
	const drawerRef = useRef<HTMLDivElement>(null);
	const closeBtnRef = useRef<HTMLButtonElement>(null);
	const hadPointerDownRef = useRef(false);
	const pointerDownOnOverlayRef = useRef(false);

	const onCloseRef = useRef(onClose);
	const returnFocusRef = useRef(returnFocusTo);
	const fallbackFocusRefRef = useRef(fallbackFocusRef);
	onCloseRef.current = onClose;
	returnFocusRef.current = returnFocusTo;
	fallbackFocusRefRef.current = fallbackFocusRef;

	const openId = row?.student.id ?? null;

	const hasOpenHigherDialog = useCallback(() => {
		return Array.from(
			document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
		).some(
			(el) =>
				el !== drawerRef.current &&
				!drawerRef.current?.contains(el) &&
				!el.contains(drawerRef.current) &&
				!el.hasAttribute("hidden") &&
				el.getAttribute("aria-hidden") !== "true" &&
				(el.getAttribute("aria-modal") === "true" ||
					el.hasAttribute("data-open") ||
					el.closest("[data-base-ui-portal]") !== null ||
					el.closest(".fixed") !== null),
		);
	}, []);

	const trapFocus = useCallback((e: KeyboardEvent) => {
		if (e.key !== "Tab" || !drawerRef.current) return;
		const focusables = Array.from(
			drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (!active || !drawerRef.current.contains(active)) {
			e.preventDefault();
			(e.shiftKey ? last : first)?.focus();
			return;
		}
		if (e.shiftKey && active === first) {
			e.preventDefault();
			last?.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first?.focus();
		}
	}, []);

	useEffect(() => {
		if (!openId) return;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		closeBtnRef.current?.focus();

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || hasOpenHigherDialog()) return;
			if (e.key === "Escape") {
				e.preventDefault();
				onCloseRef.current();
				return;
			}
			trapFocus(e);
		};

		document.addEventListener("keydown", onKeyDown);
		return () => {
			hadPointerDownRef.current = false;
			pointerDownOnOverlayRef.current = false;
			document.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = prevOverflow;
			const target = returnFocusRef.current;
			if (target && document.contains(target)) {
				target.focus();
			} else {
				const fallback = fallbackFocusRefRef.current?.current;
				if (fallback && document.contains(fallback)) {
					fallback.focus();
				}
			}
		};
	}, [openId, trapFocus, hasOpenHigherDialog]);

	if (!row) return null;

	const classSummary =
		classNames.length > 0 ? classNames.join(" · ") : "Chưa ghi danh lớp";
	const pkgSummary = row.student.hasPackage
		? `còn ${row.student.pkg.remaining}/${row.student.pkg.total} buổi`
		: "Chưa có gói";

	const content = (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click đóng drawer tương đương phím Escape */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: đóng bằng bàn phím qua Escape listener gắn trên document */}
			<div
				ref={overlayRef}
				data-testid="student-risk-drawer-backdrop"
				onPointerDown={(e) => {
					hadPointerDownRef.current = true;
					pointerDownOnOverlayRef.current =
						e.target === overlayRef.current && !hasOpenHigherDialog();
				}}
				onClick={(e) => {
					const allowed = hadPointerDownRef.current
						? pointerDownOnOverlayRef.current
						: true;
					hadPointerDownRef.current = false;
					pointerDownOnOverlayRef.current = false;
					if (
						allowed &&
						e.target === overlayRef.current &&
						!hasOpenHigherDialog()
					) {
						onClose();
					}
				}}
				className="fixed inset-0 z-40 bg-black/50"
			/>
			<div
				ref={drawerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				data-testid="student-risk-drawer"
				className="fixed inset-y-0 right-0 z-[45] grid w-[min(440px,100vw)] grid-rows-[auto_minmax(0,1fr)_auto] border-border border-l bg-card text-card-foreground shadow-lg"
			>
				<div className="flex items-center justify-between gap-3 border-border border-b px-5 py-4">
					<h2 id={titleId} className="font-semibold text-lg tracking-tight">
						Chi tiết học viên
					</h2>
					<Button
						ref={closeBtnRef}
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Đóng chi tiết học viên"
						onClick={onClose}
					>
						<X className="size-4" aria-hidden="true" />
					</Button>
				</div>

				<div className="grid content-start gap-6 overflow-y-auto p-5">
					<div className="flex items-center gap-4">
						<Avatar
							text={row.student.avatar}
							size="md"
							className="size-12 text-sm"
						/>
						<div className="min-w-0">
							<p className="break-words font-semibold text-lg [overflow-wrap:anywhere]">
								{row.student.name}
							</p>
							<p className="break-words text-muted-foreground text-sm [overflow-wrap:anywhere]">
								{classSummary}
							</p>
						</div>
					</div>

					<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="grid gap-0.5 rounded-lg bg-muted px-4 py-3">
							<dt className="text-muted-foreground text-xs">Gói học</dt>
							<dd className="font-semibold text-sm tabular-nums">
								{pkgSummary}
							</dd>
						</div>
						<div className="grid gap-0.5 rounded-lg bg-muted px-4 py-3">
							<dt className="text-muted-foreground text-xs">Vấn đề</dt>
							<dd className="font-semibold text-sm tabular-nums">
								{issues.length}
							</dd>
						</div>
					</dl>

					<div>
						<h3 className="mb-3 font-semibold text-sm">Cần kiểm tra</h3>
						<ul className="grid gap-3">
							{issues.map((issue, idx) => (
								<li
									key={
										issue.kind === "missed-check-in"
											? `missed-${issue.classId}-${issue.dateIso ?? issue.day}-${issue.time}`
											: `overdue-${issue.title}-${issue.due}-${idx}`
									}
									className="grid gap-1 rounded-lg border border-border px-4 py-3"
								>
									<span className="inline-flex items-center gap-2 font-semibold text-sm text-warn">
										<AlertTriangle
											className="size-4 shrink-0"
											aria-hidden="true"
										/>
										{issue.kind === "missed-check-in"
											? "Chưa điểm danh"
											: "Bài tập trễ hạn"}
									</span>
									<span className="break-words text-muted-foreground text-sm [overflow-wrap:anywhere]">
										{formatIssueDescription(issue)}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className="flex flex-wrap justify-end gap-2 border-border border-t px-5 py-4">
					<Button type="button" variant="ghost" onClick={onClose}>
						Đóng
					</Button>
					<Link
						to="/students/$studentId"
						params={{ studentId: row.student.id }}
						onClick={onClose}
						className={buttonVariants({ variant: "default" })}
					>
						Mở hồ sơ học viên
						<ArrowRight className="size-4" aria-hidden="true" />
					</Link>
				</div>
			</div>
		</>
	);

	if (typeof document === "undefined") return content;
	return createPortal(content, document.body);
}
