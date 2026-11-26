import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	CLASS_ERROR_CODES,
	type DailyAttendanceResponse,
	type OverdueAttendanceResponse,
	type SessionAttendanceSave,
} from "@teacher-os/api/contracts";
import { AlertTriangle } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AttendanceSessionRow } from "@/components/attendance/attendance-session-row";
import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Input } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import {
	type AttendanceRowSession,
	type DailyAttendanceSession,
	isSessionPaused,
} from "@/lib/attendance-draft";
import {
	DailyAttendanceApiError,
	dailyAttendanceQuery,
	dailyAttendanceQueryKey,
	overdueAttendanceQuery,
	overdueAttendanceQueryKey,
	saveSessionAttendance,
} from "@/lib/repos/daily-attendance";
import { isValidISODate, todayISOVietnam } from "@/lib/week-grid";

const STATUS_VALUES = ["all", "pending", "completed", "overdue"] as const;
export type AttendanceFilterStatus = (typeof STATUS_VALUES)[number];

export interface AttendanceSearch {
	date: string;
	status: AttendanceFilterStatus;
}

const CHIP_OPTIONS = [
	"Tất cả",
	"Chưa điểm danh",
	"Đã điểm danh",
	"Quá hạn",
] as const;
type ChipLabel = (typeof CHIP_OPTIONS)[number];

const STATUS_TO_CHIP: Record<AttendanceFilterStatus, ChipLabel> = {
	all: "Tất cả",
	pending: "Chưa điểm danh",
	completed: "Đã điểm danh",
	overdue: "Quá hạn",
};

const CHIP_TO_STATUS: Record<ChipLabel, AttendanceFilterStatus> = {
	"Tất cả": "all",
	"Chưa điểm danh": "pending",
	"Đã điểm danh": "completed",
	"Quá hạn": "overdue",
};

const STATUS_LABEL: Record<AttendanceFilterStatus, string> = {
	all: "Tất cả ca",
	pending: "Chưa điểm danh",
	completed: "Đã điểm danh",
	overdue: "Quá hạn",
};

/** Hợp đồng URL `?date=YYYY-MM-DD&status=all|pending|completed|overdue` (TOS-6,
 * issue #439; mở rộng `overdue` ở #959). Parse non-throw như
 * tuition/index.tsx: giá trị lệch hợp đồng rơi về mặc định, không
 * throw, không redirect. `isValidISODate` chặn cả tháng/ngày vô lý. */
export function validateAttendanceSearch(
	search: Record<string, unknown>,
): AttendanceSearch {
	const rawDate = typeof search.date === "string" ? search.date : "";
	return {
		date: isValidISODate(rawDate) ? rawDate : todayISOVietnam(),
		status: STATUS_VALUES.find((value) => value === search.status) ?? "all",
	};
}

export const Route = createFileRoute("/_auth/attendance")({
	validateSearch: validateAttendanceSearch,
	component: AttendanceRoute,
});

function sessionDateOf(
	session: AttendanceRowSession,
	fallbackDate: string,
): string {
	return "date" in session ? session.date : fallbackDate;
}

function sessionKey(
	session: AttendanceRowSession,
	fallbackDate: string,
): string {
	return session.mode === "dated"
		? `dated:${session.classId}:${sessionDateOf(session, fallbackDate)}`
		: `legacy:${session.classId}:${session.time}`;
}

export function AttendanceRoute() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Đồng bộ qua 00:00 giờ VN (mẫu dashboard.tsx) để key overdueAttendanceQuery
	// tự cập nhật khi giữ tab mở sang ngày mới.
	const [todayISO, setTodayISO] = useState(() => todayISOVietnam());
	useEffect(() => {
		const sync = () => {
			const next = todayISOVietnam();
			setTodayISO((prev) => (prev === next ? prev : next));
		};
		const intervalId = window.setInterval(sync, 60_000);
		const onVisibilityChange = () => {
			if (!document.hidden) sync();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			window.clearInterval(intervalId);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, []);

	const isOverdueTab = search.status === "overdue";

	const dailyQuery = useQuery(dailyAttendanceQuery(search.date));
	const overdueQuery = useQuery(overdueAttendanceQuery(todayISO));
	const data = dailyQuery.data;
	const overdueData = overdueQuery.data;
	const effectiveTodayISO = overdueData?.today ?? todayISO;
	const isFutureDate = search.date > effectiveTodayISO;

	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
		() => new Set(),
	);
	const [autoExpandedForKey, setAutoExpandedForKey] = useState<string | null>(
		null,
	);
	const [savingKey, setSavingKey] = useState<string | null>(null);
	const [errorByKey, setErrorByKey] = useState<Record<string, string | null>>(
		{},
	);
	// TOS-8 D3: ca đang được auto-advance mở (focus picker đầu tiên).
	const [autoFocusBulkKey, setAutoFocusBulkKey] = useState<string | null>(null);
	// Vùng aria-live persistent (kongming điều kiện 4) — luôn mount.
	const [liveMessage, setLiveMessage] = useState("");
	// Kongming điều kiện 2: chặn auto-advance khi date/status đổi giữa lúc lưu
	// và chặn re-entry khi một ca đang lưu.
	const latestSearchRef = useRef(search);
	const savingRef = useRef(false);
	const dateInputRef = useRef<HTMLInputElement>(null);

	// useLayoutEffect (không phải useEffect): sync ref trước cả passive effects
	// — nếu PUT resolve trong microtask trùng lúc điều hướng, guard
	// latestSearchRef trong handleSaveSession phải đọc được search mới ngay
	// (CR-Bugs M-2).
	useLayoutEffect(() => {
		latestSearchRef.current = search;
	}, [search]);

	// Tự mở sẵn ca đầu tiên khi vào status=pending (theo ngày) hoặc status=overdue.
	useEffect(() => {
		if (isOverdueTab) {
			if (!overdueData) return;
			const autoKey = `overdue:${overdueData.today}`;
			if (autoExpandedForKey === autoKey) return;
			setAutoExpandedForKey(autoKey);

			const firstOverdue = overdueData.sessions[0];
			if (firstOverdue) {
				setExpandedKeys(new Set([sessionKey(firstOverdue, todayISO)]));
			}
			return;
		}

		if (!data) return;
		const autoKey = `${search.date}:${search.status}`;
		if (autoExpandedForKey === autoKey) return;
		setAutoExpandedForKey(autoKey);

		if (search.status === "pending") {
			const firstPending = data.sessions.find(
				(s) => !s.recorded && !isSessionPaused(s),
			);
			if (firstPending) {
				setExpandedKeys(new Set([sessionKey(firstPending, search.date)]));
			}
		}
	}, [
		isOverdueTab,
		overdueData,
		data,
		search.date,
		search.status,
		todayISO,
		autoExpandedForKey,
	]);

	const handleDateChange = (nextDate: string) => {
		if (!isValidISODate(nextDate)) return;
		setExpandedKeys(new Set());
		setAutoExpandedForKey(null);
		setErrorByKey({});
		void navigate({
			to: "/attendance",
			search: {
				date: nextDate,
				status: isOverdueTab ? "all" : search.status,
			},
		});
	};

	const handleChipChange = (label: string) => {
		const nextStatus = CHIP_TO_STATUS[label as ChipLabel] ?? "all";
		void navigate({
			to: "/attendance",
			search: { date: search.date, status: nextStatus },
		});
	};

	const toggleSession = (key: string) => {
		// Mở/thu gọn thủ công là ý định của người dùng — huỷ auto-focus đang chờ.
		setAutoFocusBulkKey(null);
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const handleSaveSession = async (
		session: AttendanceRowSession,
		entries: SessionAttendanceSave["entries"],
	) => {
		// Chặn re-entry (red-team FAIL-3): ref thay vì đọc state trong closure.
		if (savingRef.current) return;
		savingRef.current = true;
		const searchAtStart = { date: search.date, status: search.status };
		const isOverdueAtStart = searchAtStart.status === "overdue";
		const todayAtStart = todayISO;
		const effectiveTodayAtStart = effectiveTodayISO;
		const targetDate = sessionDateOf(session, searchAtStart.date);
		const key = sessionKey(session, searchAtStart.date);
		const wasRecorded = session.recorded;
		const prevOverdueIndex = isOverdueAtStart
			? (overdueData?.sessions ?? []).findIndex(
					(s) => sessionKey(s, todayAtStart) === key,
				)
			: -1;
		setSavingKey(key);
		setErrorByKey((prev) => ({ ...prev, [key]: null }));
		setLiveMessage("");

		try {
			await saveSessionAttendance(session.classId, targetDate, entries);
			toast.success(wasRecorded ? "Đã cập nhật điểm danh" : "Đã lưu điểm danh");
			setExpandedKeys((prev) => {
				const next = new Set(prev);
				next.delete(key);
				return next;
			});
			const savedAt = Date.now();
			await queryClient.invalidateQueries({ queryKey: ["kernel"] });

			// CR-Bugs F3: D3 chỉ áp dụng luồng điểm danh lần đầu. Sửa một ca đã
			// recorded (chip completed/all) không auto-advance, không thông báo
			// hoàn tất, không giật focus khỏi nút Lưu — giữ hành vi TOS-7.
			if (wasRecorded) {
				return;
			}

			// TOS-8 D3 (red-team Critical + kongming điều kiện 2): tính ca kế
			// tiếp TỪ DỮ LIỆU SAU REFETCH. Bỏ auto-advance nếu người dùng đổi
			// ngày/chip giữa lúc lưu, refetch lỗi, hoặc dữ liệu chưa kịp cập nhật.
			const searchNow = latestSearchRef.current;
			if (
				searchNow.date !== searchAtStart.date ||
				searchNow.status !== searchAtStart.status
			) {
				return;
			}

			if (isOverdueAtStart) {
				const overdueKey = overdueAttendanceQueryKey(todayAtStart);
				const queryState = queryClient.getQueryState(overdueKey);
				const fresh =
					queryClient.getQueryData<OverdueAttendanceResponse>(overdueKey);
				if (
					!fresh ||
					queryState?.status === "error" ||
					(queryState?.dataUpdatedAt ?? 0) < savedAt
				) {
					return;
				}
				const overdueSessions = fresh.sessions;
				const orderedOverdue =
					prevOverdueIndex >= 0
						? [
								...overdueSessions.slice(prevOverdueIndex),
								...overdueSessions.slice(0, prevOverdueIndex),
							]
						: overdueSessions;
				const nextOverdue = orderedOverdue.find(
					(s) => sessionKey(s, todayAtStart) !== key,
				);
				if (nextOverdue) {
					const nextKey = sessionKey(nextOverdue, todayAtStart);
					setExpandedKeys((prev) => new Set(prev).add(nextKey));
					setAutoFocusBulkKey(nextKey);
					return;
				}
				if (overdueSessions.length === 0) {
					setLiveMessage("Đã điểm danh xong mọi ca quá hạn");
					dateInputRef.current?.focus();
				}
				return;
			}

			const queryKey = dailyAttendanceQueryKey(searchAtStart.date);
			const queryState = queryClient.getQueryState(queryKey);
			const fresh = queryClient.getQueryData<DailyAttendanceResponse>(queryKey);
			if (
				!fresh ||
				queryState?.status === "error" ||
				(queryState?.dataUpdatedAt ?? 0) < savedAt
			) {
				return;
			}

			const sessions = fresh.sessions;
			const savedIndex = sessions.findIndex(
				(s) => sessionKey(s, searchAtStart.date) === key,
			);
			// Quét từ ca sau ca vừa lưu tới hết rồi vòng lại từ đầu (trên danh
			// sách ĐẦY ĐỦ — chip pending đã loại ca vừa lưu khỏi danh sách lọc).
			const ordered =
				savedIndex === -1
					? sessions
					: [...sessions.slice(savedIndex + 1), ...sessions];
			const matchesChip = (s: DailyAttendanceSession) => {
				if (searchAtStart.status === "pending") {
					return !s.recorded && !isSessionPaused(s);
				}
				if (searchAtStart.status === "completed") return s.recorded;
				return true;
			};
			const next = ordered.find(
				(s) =>
					sessionKey(s, searchAtStart.date) !== key &&
					matchesChip(s) &&
					!s.recorded &&
					!isSessionPaused(s) &&
					s.mode !== "legacy",
			);
			if (next) {
				const nextKey = sessionKey(next, searchAtStart.date);
				setExpandedKeys((prev) => new Set(prev).add(nextKey));
				setAutoFocusBulkKey(nextKey);
				return;
			}

			// Hết ca trong phạm vi chip: thông báo theo số ca THẬT còn pending —
			// `actionablePending` loại legacy vì màn này không điểm danh được
			// legacy (kongming điều kiện 1), không dùng counts.pending.
			const actionable = sessions.filter(
				(s) => !s.recorded && !isSessionPaused(s) && s.mode !== "legacy",
			).length;
			const legacyPending = sessions.filter(
				(s) => !s.recorded && !isSessionPaused(s) && s.mode === "legacy",
			).length;
			if (actionable === 0) {
				setLiveMessage(
					legacyPending > 0
						? `Đã điểm danh xong mọi ca trong ngày. Còn ${legacyPending} ca lớp chưa gắn lịch ngày, mở trang lớp để điểm danh.`
						: "Đã điểm danh xong mọi ca trong ngày",
				);
				dateInputRef.current?.focus();
			} else {
				setLiveMessage(`Còn ${actionable} ca chưa điểm danh trong ngày`);
			}
		} catch (err) {
			// CR-Bugs F2: đối xứng với success path — đổi ngày/chip giữa lúc lưu
			// thì bỏ mọi side-effect lỗi trên ngữ cảnh cũ (toast, banner, refetch
			// query ngày cũ), chỉ nhường finally reset savingRef.
			if (
				latestSearchRef.current.date !== searchAtStart.date ||
				latestSearchRef.current.status !== searchAtStart.status
			) {
				return;
			}

			const refetchRelevant = async (invalidateKernel: boolean) => {
				const tasks: Promise<unknown>[] = [];
				if (!isOverdueAtStart) {
					tasks.push(dailyQuery.refetch());
				} else {
					tasks.push(
						queryClient.invalidateQueries({
							queryKey: dailyAttendanceQueryKey(targetDate),
						}),
					);
				}
				if (isOverdueAtStart || targetDate < effectiveTodayAtStart) {
					tasks.push(overdueQuery.refetch());
				}
				if (invalidateKernel) {
					tasks.push(queryClient.invalidateQueries({ queryKey: ["kernel"] }));
				}
				await Promise.all(tasks);
			};

			if (err instanceof DailyAttendanceApiError) {
				if (err.status === 400 && err.reason === "invalid-date") {
					setErrorByKey((prev) => ({
						...prev,
						[key]: "Ngày không đúng định dạng.",
					}));
					return;
				}
				if (err.status === 422 && err.reason === "future-session") {
					setErrorByKey((prev) => ({
						...prev,
						[key]: "Chưa đến ngày học, chưa thể điểm danh.",
					}));
					return;
				}
				if (err.status === 404 && err.reason === "not-found") {
					toast.error(
						"Ca học không còn tồn tại hoặc đã bị thay đổi, đã tải lại.",
					);
					await refetchRelevant(true);
					return;
				}
				if (err.status === 409 && err.code === CLASS_ERROR_CODES.CLASS_PAUSED) {
					toast.error("Lớp đang tạm dừng — chỉ xem lịch sử điểm danh.");
					await refetchRelevant(true);
					return;
				}
				if (
					(err.status === 409 && err.reason === "roster-changed") ||
					(err.status === 422 &&
						(err.reason === "incomplete-roster" ||
							err.reason === "unknown-lesson"))
				) {
					toast.error("Danh sách lớp vừa thay đổi, đã tải lại.");
					await refetchRelevant(false);
					return;
				}
			}
			setErrorByKey((prev) => ({
				...prev,
				[key]: "Không thể lưu điểm danh. Vui lòng thử lại.",
			}));
		} finally {
			setSavingKey(null);
			savingRef.current = false;
		}
	};

	const dailySessions = data?.sessions ?? [];
	const filteredDailySessions = dailySessions.filter((s) => {
		if (search.status === "pending") return !s.recorded && !isSessionPaused(s);
		if (search.status === "completed") return s.recorded;
		return true;
	});
	const renderedSessions: AttendanceRowSession[] = isOverdueTab
		? (overdueData?.sessions ?? [])
		: filteredDailySessions;

	const chipCounts =
		data || overdueData
			? {
					...(data
						? {
								"Tất cả": data.counts.all,
								"Chưa điểm danh": data.counts.pending,
								"Đã điểm danh": data.counts.completed,
							}
						: {}),
					...(overdueData ? { "Quá hạn": overdueData.totalCount } : {}),
				}
			: undefined;

	const activePending = isOverdueTab
		? overdueQuery.isPending
		: dailyQuery.isPending;
	const activeError = isOverdueTab ? overdueQuery.isError : dailyQuery.isError;
	const overdueTotalCount = overdueData?.totalCount ?? 0;

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 p-6">
			{/* Vùng thông báo aria-live persistent (TOS-8 D3): luôn mount, ẩn
			thị giác; e2e chọn qua role="status" + testid để không trùng text
			với empty-state. */}
			<div
				role="status"
				aria-live="polite"
				data-testid="attendance-live-status"
				className="sr-only"
			>
				{liveMessage}
			</div>

			<PageHead
				kicker={
					isOverdueTab
						? "Các ngày trước hôm nay · Quá hạn"
						: `${formatVNDate(search.date)} · ${STATUS_LABEL[search.status]}`
				}
				title="Điểm danh tổng theo ngày"
				action={
					<div className="flex flex-wrap items-center gap-2">
						<Input
							ref={dateInputRef}
							type="date"
							aria-label="Chọn ngày điểm danh"
							value={search.date}
							onChange={(e) => handleDateChange(e.target.value)}
							className="w-auto"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={search.date === effectiveTodayISO && !isOverdueTab}
							onClick={() => handleDateChange(effectiveTodayISO)}
						>
							Hôm nay
						</Button>
					</div>
				}
			/>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<ChipFilter
					ariaLabel="Lọc trạng thái điểm danh"
					options={[...CHIP_OPTIONS]}
					value={STATUS_TO_CHIP[search.status]}
					counts={chipCounts}
					onChange={handleChipChange}
				/>
			</div>

			{!isOverdueTab && overdueTotalCount > 0 && (
				<section
					aria-label="Nợ điểm danh quá hạn"
					data-testid="attendance-overdue-banner"
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm"
				>
					<div className="flex min-w-0 items-center gap-2.5 text-destructive">
						<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
						<span className="font-medium">
							{`Có ${overdueTotalCount} ca học từ các ngày trước chưa điểm danh.`}
						</span>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => handleChipChange("Quá hạn")}
					>
						Xem ca quá hạn
					</Button>
				</section>
			)}

			{activePending ? (
				<div
					data-testid="attendance-loading-skeleton"
					aria-busy="true"
					className="space-y-3"
				>
					{[1, 2, 3].map((item) => (
						<div
							key={item}
							className="h-14 animate-pulse rounded-xl border border-border bg-muted/40"
						/>
					))}
				</div>
			) : activeError ? (
				<section
					role="alert"
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm"
				>
					<span>
						{isOverdueTab
							? "Không thể tải danh sách ca học quá hạn."
							: "Không thể tải danh sách ca học trong ngày."}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							void (isOverdueTab
								? overdueQuery.refetch()
								: dailyQuery.refetch())
						}
					>
						Thử lại
					</Button>
				</section>
			) : renderedSessions.length === 0 ? (
				<section className="space-y-3 rounded-lg border border-border border-dashed p-10 text-center">
					<p className="text-muted-foreground text-sm">
						{isOverdueTab
							? "Không có ca học quá hạn chưa điểm danh."
							: search.status === "pending" &&
									data &&
									data.counts.all > 0 &&
									data.sessions.every(
										(s) =>
											s.recorded || s.mode === "legacy" || isSessionPaused(s),
									)
								? "Đã điểm danh xong mọi ca trong ngày"
								: "Không có ca học nào trong ngày này."}
					</p>
					{isOverdueTab && (
						<div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => handleDateChange(effectiveTodayISO)}
							>
								Quay lại hôm nay
							</Button>
						</div>
					)}
				</section>
			) : (
				<div className="space-y-3">
					{renderedSessions.map((session) => {
						const rowDate = sessionDateOf(session, search.date);
						const key = sessionKey(session, search.date);
						const isRowOverdue =
							isOverdueTab ||
							(session.mode === "dated" &&
								!session.recorded &&
								!isSessionPaused(session) &&
								rowDate < effectiveTodayISO);
						return (
							<AttendanceSessionRow
								key={key}
								session={session}
								sessionDate={rowDate}
								showDate={isOverdueTab}
								isOverdue={isRowOverdue}
								expanded={expandedKeys.has(key)}
								onToggle={() => toggleSession(key)}
								isFutureDate={isOverdueTab ? false : isFutureDate}
								saving={savingKey === key}
								serverError={errorByKey[key] ?? null}
								onSave={(entries) => handleSaveSession(session, entries)}
								autoFocusBulk={autoFocusBulkKey === key}
								onBulkFocusSettled={() =>
									setAutoFocusBulkKey((k) => (k === key ? null : k))
								}
								busy={savingKey !== null}
							/>
						);
					})}
					{isOverdueTab && overdueData?.hasMore && (
						<p className="text-center text-muted-foreground text-xs tabular-nums">
							{`Đang hiển thị ${overdueData.sessions.length}/${overdueData.totalCount} ca quá hạn gần nhất. Hoàn tất để xem tiếp các ca cũ hơn.`}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

/** `26/10/2026` straight from the ISO string — cùng quy ước formatDayMonth. */
function formatVNDate(iso: string): string {
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
