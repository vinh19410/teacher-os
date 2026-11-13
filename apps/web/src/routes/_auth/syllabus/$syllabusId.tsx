import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { type ChangeEvent, useRef, useState } from "react";
import { AddLessonModal } from "@/components/modals/add-lesson-modal";
import { AddModuleModal } from "@/components/modals/add-module-modal";
import { EditLessonModal } from "@/components/modals/edit-lesson-modal";
import { EditModuleModal } from "@/components/modals/edit-module-modal";
import { SyllabusImportPreview } from "@/components/syllabus/import-preview";
import { LessonBankMaterialsBadge } from "@/components/syllabus/lesson-bank-materials-badge";
import {
	isTestSessionKind,
	LessonKindBadge,
} from "@/components/syllabus/lesson-kind";
import {
	SyllabusMutationButtons,
	useSyllabusMutations,
} from "@/components/syllabus/syllabus-mutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { PageHead } from "@/components/ui/page-head";
import { Progress } from "@/components/ui/progress";
import { SectionLabel } from "@/components/ui/section-label";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import { CLASS_TYPE_LABELS, type Syllabus } from "@/lib/mock-data";
import { useTemplates } from "@/lib/repos/use-syllabus";
import {
	downloadSyllabusSampleCsv,
	parseSyllabusFile,
	type SyllabusImportResult,
} from "@/lib/syllabus-import";
import {
	type DirectKernelAction,
	useDirectKernelAction,
} from "@/lib/use-direct-kernel-action";

export const Route = createFileRoute("/_auth/syllabus/$syllabusId")({
	component: SyllabusDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-semibold text-xl">Không tìm thấy syllabus</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Syllabus này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/syllabus"
				className="mt-4 inline-block font-medium text-primary text-sm hover:text-primary"
			>
				← Về danh sách syllabus
			</Link>
		</Card>
	),
});

function SyllabusDetailRoute() {
	const { syllabusId } = Route.useParams();
	// Trang này chỉ là template editor (issue #394): id bản copy của lớp hoặc
	// id lạ đều rơi vào not-found, không còn vai trò kép.
	const templates = useTemplates();
	const kernel = useDirectKernelAction();
	const sy = templates.find((t) => t.id === syllabusId);
	if (!sy) {
		throw notFound();
	}
	return <SyllabusDetail sy={sy} kernel={kernel} />;
}

function SyllabusDetail({
	sy,
	kernel,
}: {
	sy: Syllabus;
	kernel: DirectKernelAction;
}) {
	const navigate = useNavigate();
	const { classesForSyllabus, refresh } = useData();
	const { run, busy } = kernel;
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(
		null,
	);
	const [editLessonRef, setEditLessonRef] = useState<{
		moduleId: string;
		lessonId: string;
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [importResult, setImportResult] = useState<SyllabusImportResult | null>(
		null,
	);
	const [parsing, setParsing] = useState(false);
	const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
	const mutations = useSyllabusMutations({
		target: { kind: "template", syllabusId: sy.id },
		syllabus: sy,
		isClassCopy: false,
		run,
		busy,
	});

	const assigned = classesForSyllabus(sy.id);

	// Derived để TypeScript narrowing giữ được qua closure của modal.
	const pendingImport = importResult?.ok ? importResult : null;
	const currentLessons = sy.modules.reduce(
		(sum, m) => sum + m.lessons.length,
		0,
	);

	function toggle(id: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = ""; // cho phép chọn lại cùng file
		if (!file) return;
		setParsing(true);
		try {
			setImportResult(await parseSyllabusFile(file));
		} finally {
			setParsing(false);
		}
	}

	// Refresh snapshot trước khi mở modal: số module/buổi "sẽ bị xóa" phải
	// lấy từ dữ liệu mới nhất (staleTime Infinity, đa tab).
	async function openOverwriteConfirm() {
		await refresh();
		setConfirmOverwriteOpen(true);
	}

	return (
		<div>
			<PageHead
				kicker={
					<span className="flex flex-wrap items-center gap-1.5">
						{sy.skills.length > 0 ? (
							sy.skills.map((sk) => <Tag key={sk}>{sk}</Tag>)
						) : (
							<Tag>{CLASS_TYPE_LABELS[sy.type]}</Tag>
						)}
						<Tag>{sy.level}</Tag>
					</span>
				}
				title={sy.name}
				lead={`${sy.description} · Đang dùng ${assigned.length} lớp`}
				action={
					<Link
						to="/syllabus"
						className="inline-block text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
					>
						← Giáo trình
					</Link>
				}
			/>

			<div className="mb-6 grid grid-cols-2 gap-4">
				<StatCard num={String(sy.totalLessons)} label="tổng buổi" />
				<StatCard num={String(sy.modules.length)} label="module" />
			</div>

			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<SectionLabel>Nội dung giáo trình</SectionLabel>
				<div className="flex flex-wrap items-center gap-2">
					{/* Trang này luôn là template (issue #394): import ghi đè luôn
					    khả dụng — bản copy của lớp không vào được đây nữa. */}
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv,.xlsx"
						className="hidden"
						onChange={onImportFileChange}
					/>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={downloadSyllabusSampleCsv}
					>
						Tải file mẫu
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						disabled={parsing || busy}
						onClick={() => fileInputRef.current?.click()}
					>
						Nhập từ Excel/CSV
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setAddModuleOpen(true)}
					>
						+ Thêm module
					</Button>
				</div>
			</div>

			{parsing && <p className="mb-3 text-xs">Đang đọc file…</p>}
			{importResult !== null && (
				<div className="mb-3">
					<SyllabusImportPreview
						result={importResult}
						onRemove={() => setImportResult(null)}
						disabled={busy || parsing}
					/>
					{importResult.ok && (
						<div className="mt-2 flex justify-end">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								disabled={busy || parsing}
								onClick={openOverwriteConfirm}
							>
								Ghi đè nội dung
							</Button>
						</div>
					)}
				</div>
			)}

			{sy.modules.length === 0 && (
				<Card variant="white" className="p-8 text-center text-muted-foreground">
					<p className="text-sm">
						Chưa có module nào. Nhấn <strong>+ Thêm module</strong> để bắt đầu
						xây dựng giáo trình.
					</p>
				</Card>
			)}

			{sy.modules.map((m, mi) => {
				return (
					<div
						key={m.id}
						data-testid="module-card"
						className="mb-4 overflow-hidden rounded-xl border bg-card shadow-sm"
					>
						<div className="flex flex-wrap items-center justify-between gap-4 border-border border-b bg-muted/40 px-5 py-4 transition-colors duration-[150ms] hover:bg-muted/60">
							<button
								type="button"
								onClick={() => toggle(m.id)}
								className="text-left"
							>
								<h3 className="font-semibold text-lg tracking-tight">
									{m.title}
								</h3>
							</button>
							<div className="flex flex-wrap items-center gap-3">
								<button
									type="button"
									onClick={() => setEditModuleId(m.id)}
									disabled={busy}
									className="rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors duration-[150ms] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
								>
									Sửa
								</button>
								<SyllabusMutationButtons
									label={m.title}
									upDisabled={mi === 0}
									downDisabled={mi === sy.modules.length - 1}
									busy={busy}
									onUp={() => mutations.moveModule(mi, -1)}
									onDown={() => mutations.moveModule(mi, 1)}
									onDelete={() => mutations.requestDeleteModule(m)}
								/>
								<span className="text-muted-foreground">
									{m.lessons.length} buổi
								</span>
							</div>
						</div>
						{!collapsed.has(m.id) && (
							<div className="block">
								{m.lessons.map((l, li) => (
									<div
										key={l.id}
										data-testid={
											isTestSessionKind(l.kind) ? "test-session-row" : undefined
										}
										// Buổi thi tint nền xám; kind lạ không bao giờ
										// highlight (isTestSessionKind kiểm tra dương, #154).
										// cn() — concat template bị biome gộp mất space
										// giữa class tĩnh và class điều kiện.
										className={cn(
											"grid grid-cols-[1fr_auto] items-start gap-3 border-border border-b border-solid px-5 py-3 last:border-b-0 hover:bg-muted/40 max-app:grid-cols-[1fr]",
											isTestSessionKind(l.kind) && "bg-warn-soft",
										)}
									>
										<div>
											<div className="flex items-center gap-2 font-medium text-sm">
												{l.title}
												<LessonKindBadge kind={l.kind} />
											</div>
											<div className="mt-0.5 text-[11px] text-muted-foreground">
												{l.materials}
												<LessonBankMaterialsBadge
													count={l.bankMaterials?.length ?? 0}
												/>
											</div>
											<div className="mt-[3px] text-muted-foreground text-xs leading-[1.4]">
												Mục tiêu: {l.objectives}
											</div>
										</div>
										<div className="flex flex-wrap items-center gap-2 max-app:pt-1">
											<button
												type="button"
												onClick={() =>
													setEditLessonRef({ moduleId: m.id, lessonId: l.id })
												}
												disabled={busy}
												className="rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors duration-[150ms] hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
											>
												Sửa
											</button>
											<SyllabusMutationButtons
												label={l.title}
												upDisabled={li === 0}
												downDisabled={li === m.lessons.length - 1}
												busy={busy}
												onUp={() => mutations.moveLesson(m.id, li, -1)}
												onDown={() => mutations.moveLesson(m.id, li, 1)}
												onDelete={() =>
													mutations.requestDeleteLesson(m.id, l.id, l.title)
												}
											/>
										</div>
									</div>
								))}
								<button
									type="button"
									onClick={() => setAddLessonModuleId(m.id)}
									className="mt-2 w-full px-5 pb-3 text-left font-medium text-primary text-xs hover:text-primary"
								>
									+ Thêm buổi học
								</button>
							</div>
						)}
					</div>
				);
			})}

			{assigned.length > 0 && (
				<div className="mt-6">
					<SectionLabel>Lớp đang dùng template này</SectionLabel>
					<Card className="p-0">
						<DataTable
							headers={["Lớp", "Sĩ số", "Tiến độ", "Trạng thái"]}
							rows={assigned.map((c) => {
								const cpct =
									c.sessionsTotal > 0
										? (c.sessionsDone / c.sessionsTotal) * 100
										: 0;
								return {
									onClick: () =>
										navigate({
											to: "/classes/$classId",
											params: { classId: c.id },
										}),
									cells: [
										<span key="n" className="font-medium text-sm">
											{c.name}
										</span>,
										<span key="s" className="tabular-nums">
											{c.studentIds.length}
										</span>,
										<Progress key="p" value={cpct} className="min-w-[100px]" />,
										c.status === "active" ? (
											<Badge key="b" variant="success" dot>
												Đang học
											</Badge>
										) : (
											<Badge key="b" variant="muted">
												Tạm dừng
											</Badge>
										),
									],
								};
							})}
						/>
					</Card>
				</div>
			)}

			<AddModuleModal
				open={addModuleOpen}
				onClose={() => setAddModuleOpen(false)}
				target={{ kind: "template", syllabusId: sy.id }}
			/>
			<EditModuleModal
				open={editModuleId !== null}
				onClose={() => setEditModuleId(null)}
				target={{ kind: "template", syllabusId: sy.id }}
				moduleId={editModuleId}
			/>
			<AddLessonModal
				open={addLessonModuleId !== null}
				onClose={() => setAddLessonModuleId(null)}
				target={{ kind: "template", syllabusId: sy.id }}
				moduleId={addLessonModuleId}
				showKind
			/>
			<EditLessonModal
				open={editLessonRef !== null}
				onClose={() => setEditLessonRef(null)}
				target={{ kind: "template", syllabusId: sy.id }}
				moduleId={editLessonRef?.moduleId ?? null}
				lessonId={editLessonRef?.lessonId ?? null}
				showKind
			/>
			<Modal
				open={confirmOverwriteOpen}
				onClose={busy ? () => undefined : () => setConfirmOverwriteOpen(false)}
				title="Ghi đè nội dung giáo trình?"
			>
				<p className="text-sm">
					Toàn bộ nội dung hiện tại — {sy.modules.length} module ·{" "}
					{currentLessons} buổi học — sẽ bị XÓA và thay bằng{" "}
					{pendingImport?.modules.length ?? 0} module ·{" "}
					{pendingImport?.lessonCount ?? 0} buổi học từ file. Hành động này
					không thể hoàn tác. Các lớp đã nhập bản sao từ template này không bị
					ảnh hưởng.
				</p>
				<div className="mt-4 flex justify-end gap-2 border-border border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						disabled={busy}
						onClick={() => setConfirmOverwriteOpen(false)}
					>
						Hủy
					</Button>
					<Button
						variant="danger"
						size="sm"
						disabled={busy || !pendingImport}
						onClick={async () => {
							if (!pendingImport) return;
							setConfirmOverwriteOpen(false);
							const result = await run(
								"replace-syllabus-content",
								{
									type: "replace-syllabus-content",
									syllabusId: sy.id,
									modules: pendingImport.modules,
								},
								"Đã ghi đè nội dung giáo trình.",
							);
							// Chỉ clear preview khi write chắc chắn đã land;
							// definite-failure giữ preview để user sửa rồi retry.
							if (result.kind === "refreshed" || result.kind === "committed") {
								setImportResult(null);
							} else {
								setConfirmOverwriteOpen(true);
							}
						}}
					>
						Ghi đè
					</Button>
				</div>
			</Modal>
			{mutations.confirmModal}
		</div>
	);
}
