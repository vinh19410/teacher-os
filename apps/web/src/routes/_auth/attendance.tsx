import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type {
	DailyAttendanceResponse,
	SessionAttendanceSave,
} from "@teacher-os/api/contracts";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AttendanceSessionRow } from "@/components/attendance/attendance-session-row";
import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Input } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import type { DailyAttendanceSession } from "@/lib/attendance-draft";
import {
	DailyAttendanceApiError,
	dailyAttendanceQuery,
	dailyAttendanceQueryKey,
	saveSessionAttendance,
} from "@/lib/repos/daily-attendance";
import { isValidISODate, todayISOVietnam } from "@/lib/week-grid";

const STATUS_VALUES = ["all", "pending", "completed"] as const;
export type AttendanceFilterStatus = (typeof STATUS_VALUES)[number];

export interface AttendanceSearch {
	date: string;
	status: AttendanceFilterStatus;
}

const CHIP_OPTIONS = ["Tất cả", "Chưa điểm danh", "Đã điểm danh"] as const;
type ChipLabel = (typeof CHIP_OPTIONS)[number];

const STATUS_TO_CHIP: Record<AttendanceFilterStatus, ChipLabel> = {
	all: "Tất cả",
	pending: "Chưa điểm danh",
	completed: "Đã điểm danh",
};

const CHIP_TO_STATUS: Record<ChipLabel, AttendanceFilterStatus> = {
	"Tất cả": "all",
	"Chưa điểm danh": "pending",
	"Đã điểm danh": "completed",
};

const STATUS_LABEL: Record<AttendanceFilterStatus, string> = {
	all: "Tất cả ca",
	pending: "Chưa điểm danh",
	completed: "Đã điểm danh",
};

/** Hợp đồng URL `?date=YYYY-MM-DD&status=all|pending|completed` (TOS-6,
 * issue #439) — chốt cho TOS-7 dựng nội dung. Parse non-throw như
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

function sessionKey(session: DailyAttendanceSession): string {
	return session.mode === "dated"
		? `dated:${session.classId}`
		: `legacy:${session.classId}:${session.time}`;
}

export function AttendanceRoute() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const todayISO = todayISOVietnam();
	const isFutureDate = search.date > todayISO;

	const dailyQuery = useQuery(dailyAttendanceQuery(search.date));
	const data = dailyQuery.data;

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
	// (sessionKey không chứa ngày) và chặn re-entry khi một ca đang lưu.
	const latestSearchRef = useRef(search);
	const savingRef = useRef(false);
	const dateInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		latestSearchRef.current = search;
	}, [search]);

	// Khi vào màn với status=pending (hoặc đổi ngày ở chế độ pending), ca chưa điểm danh đầu tiên tự mở sẵn.
	useEffect(() => {
		if (!data) return;
		const autoKey = `${search.date}:${search.status}`;
		if (autoExpandedForKey === autoKey) return;
		setAutoExpandedForKey(autoKey);

		if (search.status === "pending") {
			const firstPending = data.sessions.find((s) => !s.recorded);
			if (firstPending) {
				setExpandedKeys(new Set([sessionKey(firstPending)]));
				return;
			}
		}
	}, [data, search.date, search.status, autoExpandedForKey]);

	const handleDateChange = (nextDate: string) => {
		if (!isValidISODate(nextDate)) return;
		setExpandedKeys(new Set());
		setAutoExpandedForKey(null);
		setErrorByKey({});
		void navigate({
			to: "/attendance",
			search: { date: nextDate, status: search.status },
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
		session: DailyAttendanceSession,
		entries: SessionAttendanceSave["entries"],
	) => {
		// Chặn re-entry (red-team FAIL-3): ref thay vì đọc state trong closure.
		if (savingRef.current) return;
		savingRef.current = true;
		const key = sessionKey(session);
		const wasRecorded = session.recorded;
		const searchAtStart = { date: search.date, status: search.status };
		setSavingKey(key);
		setErrorByKey((prev) => ({ ...prev, [key]: null }));
		setLiveMessage("");

		try {
			await saveSessionAttendance(session.classId, searchAtStart.date, entries);
			toast.success(wasRecorded ? "Đã cập nhật điểm danh" : "Đã lưu điểm danh");
			setExpandedKeys((prev) => {
				const next = new Set(prev);
				next.delete(key);
				return next;
			});
			const savedAt = Date.now();
			await queryClient.invalidateQueries({ queryKey: ["kernel"] });

			// TOS-8 D3 (red-team Critical + kongming điều kiện 2): tính ca kế
			// tiếp TỪ DỮ LIỆU SAU REFETCH — danh sách trước refetch vẫn giữ
			// recorded=false cho ca vừa lưu. Bỏ auto-advance nếu người dùng đổi
			// ngày/chip giữa lúc lưu, refetch lỗi, hoặc dữ liệu chưa kịp cập nhật.
			const searchNow = latestSearchRef.current;
			if (
				searchNow.date !== searchAtStart.date ||
				searchNow.status !== searchAtStart.status
			) {
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
			const savedIndex = sessions.findIndex((s) => sessionKey(s) === key);
			// Quét từ ca sau ca vừa lưu tới hết rồi vòng lại từ đầu (trên danh
			// sách ĐẦY ĐỦ — chip pending đã loại ca vừa lưu khỏi danh sách lọc).
			const ordered =
				savedIndex === -1
					? sessions
					: [...sessions.slice(savedIndex + 1), ...sessions];
			const matchesChip = (s: DailyAttendanceSession) => {
				if (searchAtStart.status === "pending") return !s.recorded;
				if (searchAtStart.status === "completed") return s.recorded;
				return true;
			};
			const next = ordered.find(
				(s) =>
					sessionKey(s) !== key &&
					matchesChip(s) &&
					!s.recorded &&
					s.mode !== "legacy",
			);
			if (next) {
				const nextKey = sessionKey(next);
				setExpandedKeys((prev) => new Set(prev).add(nextKey));
				setAutoFocusBulkKey(nextKey);
				return;
			}

			// Hết ca trong phạm vi chip: thông báo theo số ca THẬT còn pending —
			// `actionablePending` loại legacy vì màn này không điểm danh được
			// legacy (kongming điều kiện 1), không dùng counts.pending.
			const actionable = sessions.filter(
				(s) => !s.recorded && s.mode !== "legacy",
			).length;
			const legacyPending = sessions.filter(
				(s) => !s.recorded && s.mode === "legacy",
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
				if (
					(err.status === 409 && err.reason === "roster-changed") ||
					(err.status === 422 &&
						(err.reason === "incomplete-roster" ||
							err.reason === "unknown-lesson"))
				) {
					toast.error("Danh sách lớp vừa thay đổi, đã tải lại.");
					await dailyQuery.refetch();
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

	const sessions = data?.sessions ?? [];
	const filteredSessions = sessions.filter((s) => {
		if (search.status === "pending") return !s.recorded;
		if (search.status === "completed") return s.recorded;
		return true;
	});

	const chipCounts = data
		? {
				"Tất cả": data.counts.all,
				"Chưa điểm danh": data.counts.pending,
				"Đã điểm danh": data.counts.completed,
			}
		: undefined;

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
				kicker={`${formatVNDate(search.date)} · ${STATUS_LABEL[search.status]}`}
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
							disabled={search.date === todayISO}
							onClick={() => handleDateChange(todayISO)}
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

			{dailyQuery.isPending ? (
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
			) : dailyQuery.isError ? (
				<section
					role="alert"
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm"
				>
					<span>Không thể tải danh sách ca học trong ngày.</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => void dailyQuery.refetch()}
					>
						Thử lại
					</Button>
				</section>
			) : filteredSessions.length === 0 ? (
				<section className="rounded-lg border border-border border-dashed p-10 text-center">
					<p className="text-muted-foreground text-sm">
						{/* TOS-8 D3 + kongming điều kiện 1: chip pending hết ca nhưng
						ngày có dữ liệu (đã điểm danh hết các ca điểm danh được) →
						thông báo hoàn tất thay vì "không có ca". */}
						{search.status === "pending" &&
						data &&
						data.counts.all > 0 &&
						data.sessions.every((s) => s.recorded || s.mode === "legacy")
							? "Đã điểm danh xong mọi ca trong ngày"
							: "Không có ca học nào trong ngày này."}
					</p>
				</section>
			) : (
				<div className="space-y-3">
					{filteredSessions.map((session) => {
						const key = sessionKey(session);
						return (
							<AttendanceSessionRow
								key={key}
								session={session}
								expanded={expandedKeys.has(key)}
								onToggle={() => toggleSession(key)}
								isFutureDate={isFutureDate}
								saving={savingKey === key}
								serverError={errorByKey[key] ?? null}
								onSave={(entries) => handleSaveSession(session, entries)}
								autoFocusBulk={autoFocusBulkKey === key}
								onBulkFocusSettled={() =>
									setAutoFocusBulkKey((k) => (k === key ? null : k))
								}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

/** `26/10/2026` straight from the ISO string — cùng quy ước formatDayMonth. */
function formatVNDate(iso: string): string {
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
