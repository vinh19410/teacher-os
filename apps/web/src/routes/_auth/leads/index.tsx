import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import {
	LEAD_COURSE_LABELS,
	LEAD_STATUS_LABELS,
	LEAD_STATUSES,
	LEAD_STUDY_DAY_LABELS,
	LEAD_STUDY_MODE_LABELS,
	LEAD_TIME_SLOT_LABELS,
	type LeadQuery,
	type LeadRow,
	type LeadStatus,
} from "@teacher-os/api/lead-contracts";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fmtWhen } from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { inputCls, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHead } from "@/components/ui/page-head";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	leadsAllQueryKey,
	leadsQueryOptions,
	patchLead,
} from "@/lib/repos/leads";
import { useFinanceRouteGuard } from "@/lib/use-finance-route-guard";

/**
 * Màn Đăng ký mới (#506 phase 4) — lead từ form đăng ký trên msmy.io.vn.
 * Bộ lọc sống URL (?q=&status=&page=) để reload/back/share giữ nguyên
 * trạng thái; search debounce 300ms; chip trạng thái hiển thị badge đếm
 * do server tính trên bộ lọc q.
 */

export interface LeadsSearch {
	q?: string;
	status?: LeadStatus;
	page?: number;
}

/** Chuẩn hóa search params — giá trị lạ/mặc định rơi về undefined (URL sạch). */
export function validateLeadsSearch(input: {
	q?: string | number;
	status?: string;
	page?: string | number;
}): LeadsSearch {
	const rawQ =
		typeof input.q === "string"
			? input.q
			: typeof input.q === "number"
				? String(input.q)
				: "";
	const q = rawQ.trim().length > 0 ? rawQ : undefined;
	const status = (LEAD_STATUSES as readonly string[]).includes(
		input.status ?? "",
	)
		? (input.status as LeadStatus)
		: undefined;
	const rawPage =
		typeof input.page === "number"
			? input.page
			: typeof input.page === "string" && input.page.trim() !== ""
				? Number(input.page)
				: Number.NaN;
	const page = Number.isInteger(rawPage) && rawPage >= 2 ? rawPage : undefined;
	return { q, status, page };
}

export const Route = createFileRoute("/_auth/leads/")({
	validateSearch: validateLeadsSearch,
	component: LeadsRoute,
});

const LEAD_STATUS_FILTERS: ReadonlyArray<{
	label: string;
	id: "all" | LeadStatus;
}> = [
	{ label: "Tất cả", id: "all" },
	{ label: LEAD_STATUS_LABELS.new, id: "new" },
	{ label: LEAD_STATUS_LABELS.contacted, id: "contacted" },
	{ label: LEAD_STATUS_LABELS.enrolled, id: "enrolled" },
	{ label: LEAD_STATUS_LABELS.dropped, id: "dropped" },
];
const STATUS_OPTIONS = LEAD_STATUS_FILTERS.map((f) => f.label);

const STATUS_TONES: Record<LeadStatus, "warn" | "neutral" | "ok" | "danger"> = {
	new: "warn",
	contacted: "neutral",
	enrolled: "ok",
	dropped: "neutral",
};

/** Giá trị mặc định (all / rỗng / trang 1) không lên URL. */
function filtersToSearch(
	q: string,
	status: "all" | LeadStatus,
	page: number,
): LeadsSearch {
	return {
		...(q.trim() ? { q } : {}),
		...(status !== "all" ? { status } : {}),
		...(page >= 2 ? { page } : {}),
	};
}

function scheduleLabel(row: LeadRow): string {
	const day = row.studyDays
		? (LEAD_STUDY_DAY_LABELS[
				row.studyDays as keyof typeof LEAD_STUDY_DAY_LABELS
			] ?? row.studyDays)
		: "";
	const slot = row.timeSlot
		? (LEAD_TIME_SLOT_LABELS[
				row.timeSlot as keyof typeof LEAD_TIME_SLOT_LABELS
			] ?? row.timeSlot)
		: "";
	return [day, slot].filter(Boolean).join(" · ");
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="font-medium text-muted-foreground text-xs">{label}</div>
			<div className="mt-0.5 whitespace-pre-wrap text-foreground text-sm">
				{children}
			</div>
		</div>
	);
}

function LeadsRoute() {
	const canAccessFinance = useFinanceRouteGuard();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const searchParams = useSearch({ from: "/_auth/leads/" });

	const statusFilter: "all" | LeadStatus = LEAD_STATUS_FILTERS.some(
		(f) => f.id === searchParams.status,
	)
		? (searchParams.status as "all" | LeadStatus)
		: "all";
	const page = typeof searchParams.page === "number" ? searchParams.page : 1;

	// Query giữ state local rồi debounce 300ms lên URL — chuẩn /notifications.
	const [query, setQuery] = useState(() => searchParams.q ?? "");
	const lastEmittedQuery = useRef(query);
	const [detailId, setDetailId] = useState<string | null>(null);
	const queryParams: LeadQuery = {
		...(searchParams.q ? { q: searchParams.q } : {}),
		...(statusFilter !== "all" ? { status: statusFilter } : {}),
		...(page >= 2 ? { page } : {}),
	};
	const { data, error, isPending } = useQuery({
		...leadsQueryOptions(queryParams),
		enabled: canAccessFinance,
	});

	useEffect(() => {
		if (isHttpError(error) && error.status === 401) {
			reauth();
		}
	}, [error]);

	const patchMutation = useMutation({
		mutationFn: ({
			id,
			status,
			teacherNote,
		}: {
			id: string;
			status: LeadStatus;
			teacherNote: string;
		}) => patchLead(id, { status, teacherNote }),
		onSuccess: async () => {
			toast.success("Đã cập nhật đăng ký.");
			setDetailId(null);
			await queryClient.invalidateQueries({ queryKey: leadsAllQueryKey });
		},
		onError: async (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			if (isHttpError(err) && err.status === 404) {
				toast.error("Đăng ký không còn tồn tại hoặc thuộc tổ chức khác.");
				await queryClient.invalidateQueries({ queryKey: leadsAllQueryKey });
				setDetailId(null);
				return;
			}
			toast.error("Không thể cập nhật đăng ký. Vui lòng thử lại.");
		},
	});

	function applyFilters(next: {
		q: string;
		status: "all" | LeadStatus;
		page: number;
	}) {
		lastEmittedQuery.current = next.q;
		void navigate({
			to: "/leads",
			search: filtersToSearch(next.q, next.status, next.page),
			replace: true,
		});
	}

	// q đổi từ phía URL (back/forward, link chia sẻ) → synced xuống state.
	useEffect(() => {
		const urlQ = searchParams.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [searchParams.q]);

	// Ngừng gõ 300ms → đẩy q lên URL (reload/share giữ được từ khóa).
	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			applyFilters({ q: query, status: statusFilter, page: 1 });
		}, 300);
		return () => clearTimeout(timer);
	}, [query, statusFilter, navigate]);

	const rows = data?.rows ?? [];
	const total = data?.total ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / (data?.pageSize ?? 20)));

	const statusChipCounts = (() => {
		if (!data) return undefined;
		const counts: Record<string, number> = {};
		for (const filter of LEAD_STATUS_FILTERS) {
			counts[filter.label] =
				filter.id === "all" ? data.counts.all : data.counts[filter.id];
		}
		return counts;
	})();

	const selectedStatusLabel =
		LEAD_STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ?? "Tất cả";

	const detailRow = rows.find((row) => row.id === detailId) ?? null;

	if (!canAccessFinance) return null;

	if (isPending) {
		return (
			<Card variant="white" className="mt-10">
				Đang tải danh sách đăng ký…
			</Card>
		);
	}

	if (error) {
		return (
			<Card variant="white" className="mx-auto mt-10 max-w-md text-center">
				<p className="text-foreground text-sm">
					Không tải được danh sách đăng ký. Thử tải lại trang.
				</p>
			</Card>
		);
	}

	const hasActiveFilter =
		Boolean(searchParams.q?.trim()) || statusFilter !== "all";
	const showGlobalEmptyState =
		(data?.counts.all ?? 0) === 0 && !hasActiveFilter;

	return (
		<div className="min-w-0">
			<PageHead
				kicker={`${total} đăng ký`}
				title="Đăng ký mới"
				lead="Đăng ký học từ form trên msmy.io.vn: gọi lại học viên qua Zalo, đổi trạng thái sau mỗi lần liên hệ."
			/>

			{showGlobalEmptyState ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="leads-empty-state"
				>
					<h2 className="font-semibold text-foreground text-lg">
						Chưa có đăng ký nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						Khi học viên điền form đăng ký học trên msmy.io.vn, danh sách sẽ
						xuất hiện tại đây để bạn liên hệ.
					</p>
				</Card>
			) : (
				<div className="flex min-w-0 flex-col gap-4">
					<Card className="flex flex-col gap-4 p-5">
						<div>
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Tìm theo tên hoặc số điện thoại…"
								aria-label="Tìm theo tên hoặc số điện thoại"
								className={inputCls}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="font-medium text-muted-foreground text-xs">
								Trạng thái
							</span>
							<ChipFilter
								options={STATUS_OPTIONS}
								value={selectedStatusLabel}
								onChange={(label) => {
									const next =
										LEAD_STATUS_FILTERS.find((f) => f.label === label)?.id ??
										"all";
									applyFilters({
										q: query,
										status: next,
										page: 1,
									});
								}}
								ariaLabel="Trạng thái"
								counts={statusChipCounts}
							/>
						</div>
					</Card>

					{rows.length === 0 ? (
						<Card variant="white" className="p-8 text-center">
							<p className="text-muted-foreground text-sm">
								Không có đăng ký nào phù hợp với bộ lọc.
							</p>
						</Card>
					) : (
						<>
							{/* 375px: bảng cuộn ngang trong container, không cuộn trang. */}
							<div
								className="min-w-0 overflow-x-auto"
								data-testid="leads-table"
							>
								<DataTable
									headers={[
										"Thời gian gửi",
										"Họ tên",
										"SĐT Zalo",
										"Khóa",
										"Hình thức",
										"Lịch mong muốn",
										"Trạng thái",
									]}
									emptyMessage="Chưa có đăng ký."
									rows={rows.map((row) => ({
										// Bấm dòng mở chi tiết (plan phase 4 bước 4).
										onClick: () => setDetailId(row.id),
										cells: [
											<span
												key="time"
												className="whitespace-nowrap text-muted-foreground text-xs tabular-nums"
											>
												{fmtWhen(row.createdAt)}
											</span>,
											<div key="name" className="min-w-[140px]">
												<div className="font-medium text-sm">{row.name}</div>
												{row.submitCount > 1 && (
													<div className="text-muted-foreground text-xs">
														{`${row.submitCount} lần gửi`}
													</div>
												)}
											</div>,
											<a
												key="phone"
												href={`https://zalo.me/${row.phone}`}
												target="_blank"
												rel="noreferrer"
												className="whitespace-nowrap text-sm underline underline-offset-2"
												onClick={(e) => e.stopPropagation()}
											>
												{row.phone}
											</a>,
											<span key="course" className="whitespace-nowrap text-sm">
												{row.course
													? (LEAD_COURSE_LABELS[
															row.course as keyof typeof LEAD_COURSE_LABELS
														] ?? row.course)
													: "—"}
											</span>,
											<span key="mode" className="whitespace-nowrap text-sm">
												{row.studyMode
													? (LEAD_STUDY_MODE_LABELS[
															row.studyMode as keyof typeof LEAD_STUDY_MODE_LABELS
														] ?? row.studyMode)
													: "—"}
											</span>,
											<span
												key="schedule"
												className="whitespace-nowrap text-sm"
											>
												{scheduleLabel(row) || "—"}
											</span>,
											<div key="status" className="whitespace-nowrap">
												<StatusTag tone={STATUS_TONES[row.status]}>
													{LEAD_STATUS_LABELS[row.status]}
												</StatusTag>
											</div>,
										],
									}))}
								/>
							</div>

							{/* Phân trang server-side — ?page sống trên URL. */}
							<div className="flex items-center justify-between gap-2">
								<p
									aria-live="polite"
									className="text-muted-foreground text-xs tabular-nums"
								>
									{`Trang ${page}/${pageCount} · ${total} đăng ký`}
								</p>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										disabled={page <= 1}
										onClick={() =>
											applyFilters({
												q: query,
												status: statusFilter,
												page: page - 1,
											})
										}
									>
										Trang trước
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={page >= pageCount}
										onClick={() =>
											applyFilters({
												q: query,
												status: statusFilter,
												page: page + 1,
											})
										}
									>
										Trang sau
									</Button>
								</div>
							</div>
						</>
					)}
				</div>
			)}

			{detailRow && (
				<LeadDetailModal
					row={detailRow}
					onClose={() => setDetailId(null)}
					onSave={(status, teacherNote) =>
						patchMutation.mutate({
							id: detailRow.id,
							status,
							teacherNote,
						})
					}
					saving={patchMutation.isPending}
				/>
			)}
		</div>
	);
}

function LeadDetailModal({
	row,
	onClose,
	onSave,
	saving,
}: {
	row: LeadRow;
	onClose: () => void;
	onSave: (status: LeadStatus, teacherNote: string) => void;
	saving: boolean;
}) {
	const [status, setStatus] = useState<LeadStatus>(row.status);
	const [teacherNote, setTeacherNote] = useState(row.teacherNote);

	return (
		<Modal open onClose={onClose} title={row.name}>
			<div className="flex flex-col gap-4">
				<div className="grid grid-cols-2 gap-4">
					<Field label="SĐT Zalo">
						<a
							href={`https://zalo.me/${row.phone}`}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-2"
						>
							{row.phone}
						</a>
					</Field>
					<Field label="Email">
						{row.email ? (
							<a
								href={`mailto:${row.email}`}
								className="underline underline-offset-2"
							>
								{row.email}
							</a>
						) : (
							"—"
						)}
					</Field>
					<Field label="Ngày sinh">{row.birthDate || "—"}</Field>
					<Field label="Khóa học">
						{row.course
							? (LEAD_COURSE_LABELS[
									row.course as keyof typeof LEAD_COURSE_LABELS
								] ?? row.course)
							: "—"}
					</Field>
					<Field label="Hình thức lớp">
						{row.studyMode
							? (LEAD_STUDY_MODE_LABELS[
									row.studyMode as keyof typeof LEAD_STUDY_MODE_LABELS
								] ?? row.studyMode)
							: "—"}
					</Field>
					<Field label="Lịch mong muốn">{scheduleLabel(row) || "—"}</Field>
					<Field label="Gửi lúc">{fmtWhen(row.createdAt)}</Field>
					<Field label="Số lần gửi">
						{row.submitCount > 1 ? `${row.submitCount} lần` : "1 lần"}
					</Field>
				</div>
				{row.placement && <Field label="Kết quả test">{row.placement}</Field>}
				{row.note && <Field label="Mục tiêu / ghi chú">{row.note}</Field>}
				<Field label="Nguồn">{row.source}</Field>

				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="lead-status"
						className="font-medium text-muted-foreground text-xs"
					>
						Trạng thái
					</label>
					<Select
						id="lead-status"
						value={status}
						onChange={(e) => setStatus(e.target.value as LeadStatus)}
					>
						{LEAD_STATUSES.map((value) => (
							<option key={value} value={value}>
								{LEAD_STATUS_LABELS[value]}
							</option>
						))}
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="lead-teacher-note"
						className="font-medium text-muted-foreground text-xs"
					>
						Ghi chú giáo viên
					</label>
					<textarea
						id="lead-teacher-note"
						value={teacherNote}
						onChange={(e) => setTeacherNote(e.target.value)}
						rows={3}
						className={inputCls}
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline" size="sm" onClick={onClose}>
						Đóng
					</Button>
					<Button
						size="sm"
						disabled={saving}
						aria-busy={saving}
						onClick={() => onSave(status, teacherNote)}
					>
						Lưu thay đổi
					</Button>
				</div>
			</div>
		</Modal>
	);
}
