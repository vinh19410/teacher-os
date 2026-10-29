import {
	type VocabStudentProgressDeck,
	type VocabStudentProgressResponse,
	vocabStudentProgressResponseSchema,
} from "@teacher-os/api/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";

function DeckProgressRow({
	deck,
	classNameLabel,
}: {
	deck: VocabStudentProgressDeck;
	classNameLabel: string | null;
}) {
	const learnedTotal = deck.stateReview;
	const maxLevelCount = Math.max(1, ...deck.byLevel);

	return (
		<div
			data-testid={`vocab-progress-deck-${deck.deckId}`}
			className="space-y-3 rounded-md border border-border p-4"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium text-foreground text-sm">{deck.title}</p>
						<span
							data-testid={`vocab-progress-deck-source-${deck.deckId}`}
							className="rounded rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
						>
							{deck.source === "class"
								? classNameLabel
									? `Lớp ${classNameLabel}`
									: "Lớp học"
								: deck.source === "library"
									? deck.className
										? `Khóa ${deck.className}`
										: "Thư viện"
									: "Gợi ý"}
						</span>
					</div>
					<p className="mt-1 font-mono text-[11px] text-muted-foreground">
						Đang học {learnedTotal}/{deck.total} từ · Chưa học {deck.stateNew}{" "}
						từ
						{deck.lastActivityAt
							? ` · Học gần nhất ${new Date(deck.lastActivityAt).toLocaleDateString("vi-VN")}`
							: ""}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<span
						data-testid={`vocab-progress-deck-due-${deck.deckId}`}
						className={`rounded px-2 py-1 font-mono text-xs ${
							deck.dueToday > 0
								? "rounded-md border border-input bg-transparent text-primary"
								: "rounded-md bg-muted text-muted-foreground"
						}`}
					>
						Đến hạn hôm nay: {deck.dueToday}
					</span>
				</div>
			</div>

			<fieldset
				className="m-0 grid grid-cols-5 gap-2 border-0 p-0"
				aria-label={`Phân bố cấp độ nhớ ${deck.title}`}
			>
				{deck.byLevel.map((count, idx) => {
					const level = idx + 1;
					const pct =
						deck.total > 0
							? Math.min(100, Math.round((count / maxLevelCount) * 100))
							: 0;
					return (
						<div
							key={level}
							data-testid={`vocab-progress-deck-${deck.deckId}-level-${level}`}
							className="rounded rounded-md bg-muted p-2"
						>
							<div className="flex items-center justify-between font-mono text-[11px]">
								<span className="text-muted-foreground">Cấp {level}</span>
								<span
									className={
										count > 0 ? "text-foreground" : "text-muted-foreground"
									}
								>
									{count}
								</span>
							</div>
							<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									className={`h-full rounded-full ${
										level === 5 ? "bg-primary" : "bg-foreground"
									}`}
									style={{ width: `${pct}%` }}
								/>
							</div>
						</div>
					);
				})}
			</fieldset>
		</div>
	);
}

/**
 * Tab "Tiến độ" trong trang Từ vựng hub (`/vocab`, #363):
 * Chọn học viên -> fetch `GET /api/kernel/vocab/progress?studentId=` (không đưa vào kernel snapshot, #343)
 * -> hiển thị tổng từ đang học, phân bố level 1–5, số từ đến hạn hôm nay, và hoạt động 7 ngày theo giờ VN.
 */
export function VocabProgressTab() {
	const { data } = useData();
	const [studentFilter, setStudentFilter] = useState("");
	const [selectedStudentId, setSelectedStudentId] = useState<string>(
		() => data.students[0]?.id ?? "",
	);
	const [progress, setProgress] = useState<VocabStudentProgressResponse | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState(false);

	const filteredStudents = useMemo(() => {
		const q = studentFilter.trim().toLowerCase();
		if (!q) return data.students;
		return data.students.filter(
			(s) =>
				s.name.toLowerCase().includes(q) ||
				s.phone.toLowerCase().includes(q) ||
				s.email.toLowerCase().includes(q),
		);
	}, [data.students, studentFilter]);

	useEffect(() => {
		if (
			filteredStudents.length > 0 &&
			!filteredStudents.some((s) => s.id === selectedStudentId)
		) {
			setSelectedStudentId(filteredStudents[0]?.id ?? "");
		}
	}, [filteredStudents, selectedStudentId]);

	const classNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const c of data.classes) {
			map.set(c.id, c.name);
		}
		return map;
	}, [data.classes]);

	const loadProgress = useCallback(async (studentId: string) => {
		if (!studentId) {
			setProgress(null);
			return;
		}
		setLoading(true);
		setLoadError(false);
		try {
			const res = await fetch(
				`${getApiBaseUrl()}/api/kernel/vocab/progress?studentId=${encodeURIComponent(studentId)}`,
				{ credentials: "include" },
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = vocabStudentProgressResponseSchema.parse(await res.json());
			setProgress(body);
		} catch {
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (selectedStudentId) {
			void loadProgress(selectedStudentId);
		} else {
			setProgress(null);
		}
	}, [selectedStudentId, loadProgress]);

	const summary = useMemo(() => {
		if (!progress) {
			return {
				totalLearning: 0,
				totalDueToday: 0,
				sessions7d: 0,
				correct7d: 0,
			};
		}
		let totalLearning = 0;
		let totalDueToday = 0;
		for (const d of progress.decks) {
			totalLearning += d.stateReview;
			totalDueToday += d.dueToday;
		}
		let sessions7d = 0;
		let correct7d = 0;
		for (const day of progress.activity7Days) {
			sessions7d += day.sessions;
			correct7d += day.correct;
		}
		return { totalLearning, totalDueToday, sessions7d, correct7d };
	}, [progress]);

	if (data.students.length === 0) {
		return (
			<Card className="p-5">
				<SectionLabel>Tiến độ học từ vựng</SectionLabel>
				<p className="mt-4 text-muted-foreground text-sm">
					Chưa có học viên nào trong trung tâm để theo dõi tiến độ.
				</p>
			</Card>
		);
	}

	return (
		<div className="space-y-5" data-testid="vocab-progress-tab">
			<Card className="p-5">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="min-w-[220px] flex-1">
						<label
							htmlFor="vocab-progress-student-search"
							className="mb-1 block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]"
						>
							Tìm học viên
						</label>
						<Input
							id="vocab-progress-student-search"
							aria-label="Tìm học viên"
							data-testid="vocab-progress-student-search"
							value={studentFilter}
							onChange={(e) => setStudentFilter(e.target.value)}
							placeholder="Lọc theo tên, SĐT, email..."
						/>
					</div>
					<div className="min-w-[240px] flex-1">
						<label
							htmlFor="vocab-progress-student-select"
							className="mb-1 block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]"
						>
							Học viên đang xem
						</label>
						<Select
							id="vocab-progress-student-select"
							aria-label="Chọn học viên"
							data-testid="vocab-progress-student-select"
							value={selectedStudentId}
							onChange={(e) => setSelectedStudentId(e.target.value)}
						>
							{filteredStudents.map((st) => (
								<option key={st.id} value={st.id}>
									{st.name}
								</option>
							))}
						</Select>
					</div>
				</div>

				{loading ? (
					<p className="mt-4 font-mono text-muted-foreground text-xs">
						Đang tải tiến độ học viên...
					</p>
				) : loadError ? (
					<div className="mt-4 flex items-center gap-3">
						<p className="text-primary text-sm">
							Không tải được tiến độ từ vựng của học viên này.
						</p>
						<Button
							size="sm"
							variant="secondary"
							type="button"
							onClick={() => void loadProgress(selectedStudentId)}
						>
							Thử lại
						</Button>
					</div>
				) : progress ? (
					<div className="mt-5 space-y-5">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div
								data-testid="vocab-progress-stat-learning"
								className="rounded-md rounded-md bg-muted p-3"
							>
								<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
									Từ đang học
								</p>
								<p className="mt-1 font-extrabold text-2xl text-foreground">
									{summary.totalLearning}
								</p>
							</div>
							<div
								data-testid="vocab-progress-stat-due"
								className="rounded-md rounded-md bg-muted p-3"
							>
								<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
									Đến hạn hôm nay
								</p>
								<p
									className={`mt-1 font-extrabold text-2xl ${
										summary.totalDueToday > 0
											? "text-primary"
											: "text-foreground"
									}`}
								>
									{summary.totalDueToday}
								</p>
							</div>
							<div
								data-testid="vocab-progress-stat-activity7d"
								className="rounded-md rounded-md bg-muted p-3"
							>
								<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
									Lượt ôn 7 ngày qua
								</p>
								<p className="mt-1 font-extrabold text-2xl text-foreground">
									{summary.sessions7d}{" "}
									<span className="font-mono font-normal text-muted-foreground text-xs">
										({summary.correct7d} đúng)
									</span>
								</p>
							</div>
						</div>

						<div>
							<SectionLabel>Hoạt động 7 ngày (giờ Việt Nam)</SectionLabel>
							<div
								data-testid="vocab-progress-activity-7d"
								className="mt-2 grid grid-cols-7 gap-2"
							>
								{progress.activity7Days.map((day) => (
									<div
										key={day.dateISO}
										data-testid={`vocab-progress-activity-${day.dateISO}`}
										className="rounded rounded-md bg-muted p-2 text-center"
									>
										<p className="font-mono text-[10px] text-muted-foreground">
											{day.dateISO.slice(5)}
										</p>
										<p
											className={`mt-1 font-mono font-semibold text-sm ${
												day.sessions > 0
													? "text-primary"
													: "text-muted-foreground"
											}`}
										>
											{day.sessions}
										</p>
										<p className="font-mono text-[10px] text-muted-foreground">
											{day.correct} đúng
										</p>
									</div>
								))}
							</div>
						</div>

						<div>
							<SectionLabel>Bộ từ vựng của học viên</SectionLabel>
							{progress.decks.length === 0 ? (
								<p
									data-testid="vocab-progress-empty"
									className="mt-3 text-muted-foreground text-sm"
								>
									Học viên chưa có bộ từ vựng nào (chưa vào lớp có bộ từ hoặc
									chưa nhận gợi ý).
								</p>
							) : (
								<div className="mt-3 space-y-3">
									{progress.decks.map((deck) => (
										<DeckProgressRow
											key={deck.deckId}
											deck={deck}
											classNameLabel={
												deck.classId
													? (classNameById.get(deck.classId) ?? deck.classId)
													: null
											}
										/>
									))}
								</div>
							)}
						</div>
					</div>
				) : null}
			</Card>
		</div>
	);
}
