import { createFileRoute, Link } from "@tanstack/react-router";
import {
	type LibraryExerciseView,
	STUDY_PACK_LEVELS,
	type StudyPackDetailView,
	type StudyPackItemInput,
	type StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import {
	Button,
	buttonVariants,
} from "@teacher-os/ui/components/web-kit/button";
import {
	Field,
	Input,
	Select,
	Textarea,
} from "@teacher-os/ui/components/web-kit/field";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";

export const Route = createFileRoute("/_auth/library/packs")({
	component: AdminLibraryPacksRoute,
});

const SAMPLE_GRAMMAR_EXERCISE_JSON = JSON.stringify(
	{
		skill: "grammar",
		part: "g1",
		type: "mcq",
		title: "Grammar: Present Perfect vs Past Simple",
		band: "7.0",
		intro: "<p>Chọn đáp án đúng cho mỗi câu dưới đây.</p>",
		passage: "",
		questions: [
			{
				stem: "She ____ in London since 2018.",
				opts: ["lives", "has lived", "lived", "is living"],
				answer: "B",
				alts: "",
				pin: null,
			},
		],
		optionBank: [],
		note: "<p>Since + mốc thời gian dùng thì hiện tại hoàn thành.</p>",
		status: "ready",
	},
	null,
	2,
);

function AdminLibraryPacksRoute() {
	const [packs, setPacks] = useState<StudyPackSummaryView[]>([]);
	const [exercises, setExercises] = useState<LibraryExerciseView[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// System study pack creation state
	const [packTitle, setPackTitle] = useState("");
	const [packDescription, setPackDescription] = useState("");
	const [packLevel, setPackLevel] = useState("");
	const [packStatus, setPackStatus] = useState<"draft" | "ready">("ready");
	const [packItemsJson, setPackItemsJson] = useState("[]");
	const [creatingPack, setCreatingPack] = useState(false);

	// Quick item adder for system pack
	const [quickDayIndex, setQuickDayIndex] = useState(1);
	const [quickExerciseId, setQuickExerciseId] = useState("");

	// Library exercise JSON creation state
	const [exerciseJson, setExerciseJson] = useState(
		SAMPLE_GRAMMAR_EXERCISE_JSON,
	);
	const [creatingExercise, setCreatingExercise] = useState(false);

	const loadAll = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [packsRes, exRes] = await Promise.all([
				apiJson<{ packs: StudyPackSummaryView[] }>("/api/admin/library/packs"),
				apiJson<{ exercises: LibraryExerciseView[] }>(
					"/api/admin/library/exercises",
				),
			]);
			setPacks(packsRes.packs);
			setExercises(exRes.exercises);
			if (exRes.exercises.length > 0) {
				setQuickExerciseId((prev) => prev || exRes.exercises[0].id);
			}
		} catch {
			setError("Không tải được dữ liệu bộ đề hệ thống.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadAll();
	}, [loadAll]);

	function handleAppendExerciseToPackJson() {
		if (!quickExerciseId) {
			toast.error("Chưa chọn bài tập thư viện.");
			return;
		}
		try {
			const parsed: unknown = JSON.parse(packItemsJson);
			const current = Array.isArray(parsed) ? parsed : [];
			const next: StudyPackItemInput[] = [
				...current,
				{
					dayIndex: quickDayIndex,
					sourceKind: "library_exercise",
					sourceId: quickExerciseId,
					note: "",
				},
			];
			setPackItemsJson(JSON.stringify(next, null, 2));
			setQuickDayIndex((d) => d + 1);
		} catch {
			toast.error("JSON danh sách bài chưa hợp lệ.");
		}
	}

	async function handleCreatePack(event: FormEvent) {
		event.preventDefault();
		if (!packTitle.trim()) {
			toast.error("Nhập tiêu đề bộ đề hệ thống.");
			return;
		}
		let parsedItems: unknown;
		try {
			parsedItems = JSON.parse(packItemsJson);
		} catch {
			toast.error("JSON danh sách bài tập không hợp lệ.");
			return;
		}
		setCreatingPack(true);
		try {
			await apiJson<{ pack: StudyPackDetailView }>("/api/admin/library/packs", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					title: packTitle.trim(),
					description: packDescription.trim(),
					...(packLevel ? { level: packLevel } : {}),
					status: packStatus,
					items: parsedItems,
				}),
			});
			toast.success("Đã tạo bộ đề hệ thống.");
			setPackTitle("");
			setPackDescription("");
			setPackLevel("");
			setPackItemsJson("[]");
			await loadAll();
		} catch {
			toast.error("Không thể tạo bộ đề hệ thống. Kiểm tra lại dữ liệu.");
		} finally {
			setCreatingPack(false);
		}
	}

	async function handleDeletePack(packId: string) {
		try {
			await apiJson<{ ok: true }>(
				`/api/admin/library/packs/${encodeURIComponent(packId)}`,
				{ method: "DELETE" },
			);
			toast.success("Đã xoá bộ đề hệ thống.");
			setPacks((prev) => prev.filter((p) => p.id !== packId));
		} catch {
			toast.error("Không thể xoá bộ đề hệ thống.");
		}
	}

	async function handleCreateExercise(event: FormEvent) {
		event.preventDefault();
		let parsed: unknown;
		try {
			parsed = JSON.parse(exerciseJson);
		} catch {
			toast.error("JSON bài tập không hợp lệ.");
			return;
		}
		setCreatingExercise(true);
		try {
			await apiJson<{ exercise: LibraryExerciseView }>(
				"/api/admin/library/exercises",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(parsed),
				},
			);
			toast.success("Đã tạo bài tập thư viện.");
			await loadAll();
		} catch {
			toast.error("Không thể tạo bài tập thư viện. Kiểm tra lại JSON.");
		} finally {
			setCreatingExercise(false);
		}
	}

	async function handleDeleteExercise(exerciseId: string) {
		try {
			await apiJson<{ ok: true }>(
				`/api/admin/library/exercises/${encodeURIComponent(exerciseId)}`,
				{ method: "DELETE" },
			);
			toast.success("Đã xoá bài tập thư viện.");
			setExercises((prev) => prev.filter((ex) => ex.id !== exerciseId));
		} catch {
			toast.error("Không thể xoá bài tập thư viện.");
		}
	}

	return (
		<section
			aria-label="Bộ đề tự học hệ thống"
			className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
		>
			<div>
				<Link
					to="/library/tests"
					className={buttonVariants({
						variant: "ghost",
						size: "sm",
						className: "mb-3 gap-1.5",
					})}
				>
					<ArrowLeft className="size-4" />
					Thư viện đề
				</Link>
				<h1 className="font-semibold text-xl">
					Bộ đề tự học &amp; Bài tập thư viện hệ thống
				</h1>
				<p className="text-muted-foreground text-sm">
					Quản lý bài tập lẻ (Reading, Listening, Grammar, Vocabulary) và bộ đề
					tự học mẫu dùng chung cho toàn hệ thống.
				</p>
			</div>

			{error && (
				<div
					role="alert"
					className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm"
				>
					{error}
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Left: System Study Packs */}
				<div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
					<h2 className="font-semibold text-base">
						Bộ đề hệ thống ({packs.length})
					</h2>

					{loading ? (
						<p className="text-muted-foreground text-sm">Đang tải…</p>
					) : packs.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Chưa có bộ đề hệ thống nào.
						</p>
					) : (
						<ul className="space-y-2">
							{packs.map((pack) => (
								<li
									key={pack.id}
									className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
								>
									<div className="min-w-0">
										<p className="font-medium text-foreground">{pack.title}</p>
										<p className="text-muted-foreground text-xs">
											{pack.level ? `${pack.level} · ` : ""}
											{pack.status === "ready" ? "Sẵn sàng" : "Nháp"} ·{" "}
											{pack.dayCount} ngày · {pack.itemCount} bài
										</p>
									</div>
									<Button
										type="button"
										variant="danger"
										size="sm"
										onClick={() => void handleDeletePack(pack.id)}
									>
										<Trash2 className="size-3.5" />
										Xoá
									</Button>
								</li>
							))}
						</ul>
					)}

					<form
						onSubmit={(e) => void handleCreatePack(e)}
						className="space-y-3 border-t pt-4"
					>
						<h3 className="font-medium text-sm">Tạo bộ đề hệ thống mới</h3>
						<Field label="Tiêu đề bộ đề" required htmlFor="admin-pack-title">
							<Input
								id="admin-pack-title"
								value={packTitle}
								onChange={(e) => setPackTitle(e.target.value)}
								placeholder="Ví dụ: Lộ trình 7 ngày Grammar nền tảng"
							/>
						</Field>
						<Field label="Mô tả" htmlFor="admin-pack-desc">
							<Input
								id="admin-pack-desc"
								value={packDescription}
								onChange={(e) => setPackDescription(e.target.value)}
								placeholder="Mô tả ngắn gọn"
							/>
						</Field>
						<Field label="Trình độ (tuỳ chọn)" htmlFor="admin-pack-level">
							<Select
								id="admin-pack-level"
								value={packLevel}
								onChange={(e) => setPackLevel(e.target.value)}
							>
								<option value="">Không gắn trình độ</option>
								{STUDY_PACK_LEVELS.map((lvl) => (
									<option key={lvl} value={lvl}>
										{lvl}
									</option>
								))}
							</Select>
						</Field>
						<Field label="Trạng thái" htmlFor="admin-pack-status">
							<Select
								id="admin-pack-status"
								value={packStatus}
								onChange={(e) =>
									setPackStatus(e.target.value as "draft" | "ready")
								}
							>
								<option value="ready">Sẵn sàng</option>
								<option value="draft">Nháp</option>
							</Select>
						</Field>

						{exercises.length > 0 && (
							<div className="space-y-2 rounded-md border bg-muted/40 p-3">
								<p className="font-medium text-xs">
									Thêm nhanh bài tập thư viện vào JSON
								</p>
								<div className="grid grid-cols-[80px_1fr] gap-2">
									<Input
										type="number"
										min={1}
										aria-label="Ngày thứ"
										value={String(quickDayIndex)}
										onChange={(e) =>
											setQuickDayIndex(Number(e.target.value) || 1)
										}
									/>
									<Select
										aria-label="Chọn bài tập thư viện"
										value={quickExerciseId}
										onChange={(e) => setQuickExerciseId(e.target.value)}
									>
										{exercises.map((ex) => (
											<option key={ex.id} value={ex.id}>
												[{ex.skill}] {ex.title}
											</option>
										))}
									</Select>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleAppendExerciseToPackJson}
								>
									<Plus className="size-3.5" />
									Chèn vào danh sách ngày
								</Button>
							</div>
						)}

						<Field label="Danh sách items (JSON)" htmlFor="admin-pack-items">
							<Textarea
								id="admin-pack-items"
								rows={5}
								className="font-mono text-xs"
								value={packItemsJson}
								onChange={(e) => setPackItemsJson(e.target.value)}
							/>
						</Field>

						<Button type="submit" disabled={creatingPack}>
							{creatingPack ? "Đang tạo…" : "Lưu bộ đề hệ thống"}
						</Button>
					</form>
				</div>

				{/* Right: System Library Exercises */}
				<div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
					<h2 className="font-semibold text-base">
						Bài tập thư viện lẻ ({exercises.length})
					</h2>

					{loading ? (
						<p className="text-muted-foreground text-sm">Đang tải…</p>
					) : exercises.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Chưa có bài tập thư viện nào.
						</p>
					) : (
						<ul className="max-h-60 space-y-2 overflow-y-auto">
							{exercises.map((ex) => (
								<li
									key={ex.id}
									className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
								>
									<div className="min-w-0">
										<p className="font-medium text-foreground">{ex.title}</p>
										<p className="font-mono text-muted-foreground text-xs">
											{ex.skill} · {ex.part}/{ex.type} · {ex.status} · ID:{" "}
											{ex.id}
										</p>
									</div>
									<Button
										type="button"
										variant="danger"
										size="sm"
										onClick={() => void handleDeleteExercise(ex.id)}
									>
										<Trash2 className="size-3.5" />
										Xoá
									</Button>
								</li>
							))}
						</ul>
					)}

					<form
						onSubmit={(e) => void handleCreateExercise(e)}
						className="space-y-3 border-t pt-4"
					>
						<h3 className="font-medium text-sm">
							Nhập JSON bài tập thư viện (`library_exercise`)
						</h3>
						<Field label="Payload JSON" htmlFor="admin-exercise-json">
							<Textarea
								id="admin-exercise-json"
								rows={10}
								className="font-mono text-xs"
								value={exerciseJson}
								onChange={(e) => setExerciseJson(e.target.value)}
							/>
						</Field>
						<Button type="submit" disabled={creatingExercise}>
							{creatingExercise ? "Đang lưu…" : "Tạo bài tập thư viện"}
						</Button>
					</form>
				</div>
			</div>
		</section>
	);
}
