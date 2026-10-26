import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AddInvoiceModal } from "@/components/modals/add-invoice-modal";
import { RecordPaymentModal } from "@/components/modals/record-payment-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import { initialsFromName } from "@/lib/initials";
import { fmtVND } from "@/lib/mock-data";
import {
	type DebtFilterStatus,
	type DebtLedgerRow,
	type DebtStatus,
	type DebtsSearch,
	debtLedger,
	formatDue,
	validateDebtsSearch,
} from "@/lib/tuition-from-kernel";
import { useFinanceRouteGuard } from "@/lib/use-finance-route-guard";
import { todayISOVietnam } from "@/lib/week-grid";

export const Route = createFileRoute("/_auth/debts/")({
	validateSearch: validateDebtsSearch,
	component: DebtsRoute,
});

const DEBT_STATUS_FILTERS: ReadonlyArray<{
	label: string;
	id: DebtFilterStatus | undefined;
}> = [
	{ label: "Tất cả", id: undefined },
	{ label: "Quá hạn", id: "overdue" },
	{ label: "Còn nợ / Sắp đến hạn ≤ 7 ngày", id: "due" },
	{ label: "Đã thu đủ", id: "clear" },
];

const CHIP_OPTIONS = DEBT_STATUS_FILTERS.map((f) => f.label);

function buildSearchObj(
	status: DebtFilterStatus | undefined,
	q: string,
	lop: string | undefined,
): DebtsSearch {
	const trimmedQ = q.trim();
	const trimmedLop = lop?.trim() ?? "";
	return {
		...(status ? { status } : {}),
		...(trimmedQ.length > 0 ? { q } : {}),
		...(trimmedLop.length > 0 ? { lop: trimmedLop } : {}),
	};
}

function DebtStatusBadge({ status }: { status: DebtStatus }) {
	if (status === "overdue") {
		return <Badge variant="destructive">Quá hạn</Badge>;
	}
	if (status === "due_soon") {
		return (
			<Badge variant="warn" dot>
				Sắp đến hạn
			</Badge>
		);
	}
	if (status === "due") {
		return (
			<Badge variant="outline" dot>
				Còn nợ
			</Badge>
		);
	}
	return (
		<Badge variant="success" dot>
			Đã thu đủ
		</Badge>
	);
}

export function DebtsRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const canAccessFinance = useFinanceRouteGuard();
	const rawSearch = Route.useSearch();
	const search = useMemo(
		() => validateDebtsSearch(rawSearch as Record<string, unknown>),
		[rawSearch],
	);

	const [modalOpen, setModalOpen] = useState(false);
	const [payRow, setPayRow] = useState<DebtLedgerRow | null>(null);
	const [query, setQuery] = useState(() => search.q ?? "");
	const lastEmittedQuery = useRef(query);
	const latestSearchRef = useRef(search);

	useLayoutEffect(() => {
		latestSearchRef.current = search;
	}, [search]);

	// Đồng bộ khi URL đổi từ bên ngoài (Back/Forward, Xóa bộ lọc).
	useEffect(() => {
		const urlQ = search.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [search.q]);

	// Debounce 300ms đẩy từ khóa tìm kiếm lên URL (không chạy lại khi chỉ đổi chip/lớp).
	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			const cur = latestSearchRef.current;
			void navigate({
				to: "/debts",
				search: buildSearchObj(cur.status, query, cur.lop),
				replace: true,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [query, navigate]);

	const today = todayISOVietnam();

	const ledger = useMemo(
		() =>
			debtLedger({
				invoices: data.invoices,
				students: data.students,
				enrollments: data.enrollments ?? [],
				classes: data.classes,
				todayISO: today,
				classId: search.lop,
				q: query,
				status: search.status,
			}),
		[
			data.invoices,
			data.students,
			data.enrollments,
			data.classes,
			today,
			search.lop,
			query,
			search.status,
		],
	);

	const chipCounts = useMemo(
		() => ({
			"Tất cả": ledger.counts.all,
			"Quá hạn": ledger.counts.overdue,
			"Còn nợ / Sắp đến hạn ≤ 7 ngày": ledger.counts.due,
			"Đã thu đủ": ledger.counts.clear,
		}),
		[ledger.counts],
	);

	const selectedChipLabel =
		DEBT_STATUS_FILTERS.find((f) => f.id === search.status)?.label ?? "Tất cả";

	const hasActiveFilter =
		search.status !== undefined ||
		Boolean(search.lop) ||
		query.trim().length > 0;

	function handleChipChange(label: string) {
		const found = DEBT_STATUS_FILTERS.find((f) => f.label === label);
		const nextStatus = found?.id;
		lastEmittedQuery.current = query;
		void navigate({
			to: "/debts",
			search: buildSearchObj(nextStatus, query, search.lop),
			replace: true,
		});
	}

	function handleClassChange(nextClassId: string) {
		lastEmittedQuery.current = query;
		void navigate({
			to: "/debts",
			search: buildSearchObj(search.status, query, nextClassId || undefined),
			replace: true,
		});
	}

	function clearFilters() {
		setQuery("");
		lastEmittedQuery.current = "";
		void navigate({
			to: "/debts",
			search: {},
			replace: true,
		});
	}

	const { kpis, rows } = ledger;

	if (!canAccessFinance) return null;

	return (
		<div>
			<div role="status" aria-live="polite" className="sr-only">
				{`Đang hiển thị ${rows.length} học viên`}
			</div>

			<PageHead
				kicker="Học phí"
				title="Sổ công nợ học viên"
				action={
					<div className="flex flex-wrap items-center gap-2">
						{/* Chỗ cho nút "Gửi nhắc học phí (N)" của TOS-18 */}
						<Button
							variant="outline"
							data-testid="create-invoice"
							onClick={() => setModalOpen(true)}
						>
							+ Tạo khoản thu
						</Button>
					</div>
				}
			/>

			<div
				className="grid grid-cols-1 gap-4 md:grid-cols-3"
				data-testid="debt-kpis"
			>
				<StatCard
					num={fmtVND(kpis.receivable.amount)}
					label="Tổng phải thu kỳ này"
					sub={`${kpis.receivable.students} học viên`}
				/>
				<StatCard
					num={fmtVND(kpis.collected.amount)}
					label="Tổng đã thu"
					sub={`${kpis.collected.students} học viên`}
				/>
				<StatCard
					num={fmtVND(kpis.overdue.amount)}
					label="Tổng còn nợ quá hạn"
					sub={`${kpis.overdue.students} học viên`}
					hot={kpis.overdue.amount > 0}
				/>
			</div>

			<Card className="mt-6 flex flex-col gap-4 p-4">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="w-full lg:max-w-xs">
						<Input
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Tìm học viên / SĐT"
							aria-label="Tìm học viên hoặc số điện thoại"
						/>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<ChipFilter
							ariaLabel="Lọc trạng thái công nợ"
							options={CHIP_OPTIONS}
							value={selectedChipLabel}
							counts={chipCounts}
							onChange={handleChipChange}
						/>

						<div className="w-full sm:w-48">
							<Select
								aria-label="Lọc theo lớp"
								value={search.lop ?? ""}
								onChange={(e) => handleClassChange(e.target.value)}
							>
								<option value="">Tất cả lớp</option>
								{data.classes.map((cls) => (
									<option key={cls.id} value={cls.id}>
										{cls.name}
									</option>
								))}
							</Select>
						</div>

						{hasActiveFilter && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={clearFilters}
							>
								Xóa bộ lọc
							</Button>
						)}
					</div>
				</div>
			</Card>

			<div className="mt-6" data-testid="debt-ledger-table">
				{data.invoices.length === 0 && !hasActiveFilter ? (
					<Card
						variant="white"
						className="p-8 text-center"
						data-testid="debts-empty"
					>
						<h2 className="font-semibold text-base">Chưa có khoản thu nào</h2>
						<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
							Bấm "+ Tạo khoản thu" để ghi nhận học phí và theo dõi công nợ lũy
							kế của từng học viên.
						</p>
						<div className="mt-4 flex justify-center">
							<Button variant="outline" onClick={() => setModalOpen(true)}>
								+ Tạo khoản thu
							</Button>
						</div>
					</Card>
				) : rows.length === 0 ? (
					<Card
						variant="white"
						className="p-8 text-center"
						data-testid="debts-filtered-empty"
					>
						<h2 className="font-semibold text-base">
							Không có học viên khớp bộ lọc
						</h2>
						<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
							Thử đổi trạng thái công nợ, chọn lớp khác hoặc xóa từ khóa tìm
							kiếm.
						</p>
						{hasActiveFilter && (
							<div className="mt-4 flex justify-center">
								<Button type="button" variant="outline" onClick={clearFilters}>
									Xóa bộ lọc
								</Button>
							</div>
						)}
					</Card>
				) : (
					<DataTable
						headers={[
							"Học viên",
							"Lớp",
							"Phải đóng",
							"Đã thu",
							"Còn nợ",
							"Hạn đóng",
							"Thao tác",
						]}
						emptyMessage="Không có học viên khớp bộ lọc."
						rows={rows.map((row) => ({
							onClick: () =>
								void navigate({
									to: "/students/$studentId",
									params: { studentId: row.studentId },
								}),
							cells: [
								<div key="stu" className="flex items-center gap-2 font-medium">
									<Avatar text={initialsFromName(row.name)} size="sm" />
									<span>{row.name}</span>
								</div>,
								<span key="cls" className="text-muted-foreground text-sm">
									{row.classNames.length > 0 ? row.classNames.join(", ") : "—"}
								</span>,
								<span key="due-amt" className="font-mono tabular-nums">
									{fmtVND(row.totalDue)}
								</span>,
								<span key="paid-amt" className="font-mono tabular-nums">
									{fmtVND(row.totalPaid)}
								</span>,
								<span
									key="rem-amt"
									className={cn(
										"font-mono font-semibold tabular-nums",
										row.remaining > 0 && "text-destructive",
									)}
								>
									{fmtVND(row.remaining)}
								</span>,
								<div
									key="due-date"
									className="flex flex-wrap items-center gap-2"
								>
									<span className="font-mono text-muted-foreground text-xs tabular-nums">
										{row.nextDue ? formatDue(row.nextDue) : "—"}
									</span>
									<DebtStatusBadge status={row.status} />
								</div>,
								// biome-ignore lint/a11y/noStaticElementInteractions: wrapper chặn sự kiện click + Enter/Space nổi bọt lên <tr> khi TOS-16/18 gắn nút Thu / (eye)
								<div
									key="act"
									className="flex justify-end gap-1"
									onClick={(e) => e.stopPropagation()}
									onKeyDown={(e) => {
										if (e.key === " " || e.key === "Enter") {
											e.stopPropagation();
										}
									}}
								>
									{row.remaining > 0 && (
										<Button
											size="sm"
											variant="outline"
											data-testid={`record-payment-${row.studentId}`}
											aria-label={`Thu tiền cho ${row.name}`}
											onClick={() => setPayRow(row)}
										>
											Thu
										</Button>
									)}
								</div>,
							],
						}))}
					/>
				)}
			</div>

			<AddInvoiceModal open={modalOpen} onClose={() => setModalOpen(false)} />
			<RecordPaymentModal
				open={payRow !== null}
				row={payRow}
				onClose={() => setPayRow(null)}
			/>
		</div>
	);
}
