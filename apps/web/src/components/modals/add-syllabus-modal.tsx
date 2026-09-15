import {
	CLASS_TYPES,
	type ClassType,
	IELTS_SKILLS,
	type SyllabusModuleContent,
} from "@teacher-os/api/contracts";
import { X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipMulti } from "@/components/ui/chip-multi";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tag } from "@/components/ui/tag";
import { CLASS_TYPE_LABELS } from "@/lib/mock-data";
import {
	buildSampleCsv,
	parseSyllabusFile,
	type SyllabusImportResult,
} from "@/lib/syllabus-import";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const CLASS_TYPE_OPTIONS = CLASS_TYPES.map((value) => ({
	value,
	label: CLASS_TYPE_LABELS[value],
}));

const SKILL_OPTIONS = IELTS_SKILLS.map((value) => ({ value, label: value }));

const STATUS_LABELS: Record<"done" | "current" | "upcoming", string> = {
	done: "Đã dạy",
	current: "Đang học",
	upcoming: "Sắp tới",
};

const PREVIEW_HEADERS = ["#", "Module", "Mục tiêu", "Tài liệu", "Trạng thái"];

export function AddSyllabusModal({
	open,
	onClose,
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	onCreated?: (id: string) => void;
}) {
	const [name, setName] = useState("");
	const [level, setLevel] = useState("Band 7.0");
	const [classType, setClassType] = useState<ClassType>("ielts");
	const [skills, setSkills] = useState<string[]>([]);
	const [description, setDescription] = useState("");
	const [total, setTotal] = useState("10");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [importResult, setImportResult] = useState<SyllabusImportResult | null>(
		null,
	);
	const [parsing, setParsing] = useState(false);
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	function resetForm() {
		setName("");
		setDescription("");
		setSkills([]);
		setImportResult(null);
	}

	async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = ""; // cho phép chọn lại cùng file
		if (!file) return;
		setParsing(true);
		try {
			const result = await parseSyllabusFile(file);
			setImportResult(result);
			if (result.ok) setTotal(String(result.lessonCount));
		} finally {
			setParsing(false);
		}
	}

	function downloadSample() {
		const csv = buildSampleCsv();
		const url = URL.createObjectURL(
			new Blob([csv], { type: "text/csv;charset=utf-8" }),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = "syllabus-template.csv";
		a.click();
		// Revoke sau khi download khởi hành — revoke đồng bộ ngay sau click
		// có thể hủy download trên Safari/Firefox.
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	const importBlocked = importResult !== null && !importResult.ok;

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		// Đang parse hoặc file parse lỗi → chặn submit: teacher đã cố import,
		// tạo syllabus rỗng lúc đó là sai.
		if (parsing || importBlocked) return;
		if (!name.trim()) {
			setError("Vui lòng nhập tên syllabus.");
			return;
		}
		if (classType === "ielts" && skills.length === 0) {
			setError("Chọn ít nhất một kỹ năng.");
			return;
		}
		const result = await run({
			type: "add-syllabus",
			payload: {
				id: "",
				name: name.trim(),
				type: classType,
				level,
				skills: classType === "ielts" ? skills : [],
				description: description.trim(),
				totalLessons: importResult?.ok
					? importResult.lessonCount
					: Number.parseInt(total, 10) || 10,
				modules: importResult?.ok ? importResult.modules : undefined,
			},
		});
		// Close/reset/navigate only after the refreshed result — a committed
		// id without the snapshot would navigate into a stale-store 404.
		if (result?.kind === "refreshed") {
			resetForm();
			onClose();
			if (result.id && onCreated) onCreated(result.id);
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			resetForm();
			onClose();
		}
	}

	// Số thứ tự buổi toàn file cho cột `#` của bảng preview — cùng phép đếm
	// với `lessonOrdinal` của parser, không parse ngược từ title.
	function lessonNumber(
		modules: SyllabusModuleContent[],
		moduleIndex: number,
		lessonIndex: number,
	): number {
		let before = 0;
		for (let i = 0; i < moduleIndex; i++) before += modules[i].lessons.length;
		return before + lessonIndex + 1;
	}

	// Gỡ file không hoàn tác `total`: giá trị là dự định số buổi user vừa thấy
	// ở preview và tự chỉnh được — đưa về mặc định sẽ giết input của user.
	const removeFileButton = (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="px-1.5 text-muted-fg hover:text-danger"
			onClick={() => setImportResult(null)}
			disabled={saving || parsing}
			aria-label="Gỡ file"
			title="Gỡ file"
		>
			<X className="size-4" aria-hidden="true" />
		</Button>
	);

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Tạo syllabus mới"
		>
			<form onSubmit={submit}>
				<Field label="Tên syllabus *" error={error}>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="VD: IELTS Writing 7.0"
						maxLength={500}
					/>
				</Field>
				<Field label="Loại lớp">
					<ChipMulti
						options={CLASS_TYPE_OPTIONS}
						value={[classType]}
						onChange={(next) => {
							const other = next.find((v) => v !== classType);
							if (other) setClassType(other as ClassType);
						}}
					/>
				</Field>
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Trình độ">
						<Select value={level} onChange={(e) => setLevel(e.target.value)}>
							<option>Band 5.5</option>
							<option>Band 6.0</option>
							<option>Band 6.5</option>
							<option>Band 7.0</option>
							<option>Band 7.5+</option>
						</Select>
					</Field>
				</div>
				{classType === "ielts" && (
					<Field label="Kỹ năng *">
						<ChipMulti
							options={SKILL_OPTIONS}
							value={skills}
							onChange={setSkills}
						/>
					</Field>
				)}
				<Field label="Mô tả">
					<Textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Mô tả lộ trình và mục tiêu…"
					/>
				</Field>
				<Field label="Nhập nhanh từ Excel/CSV (tùy chọn)">
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv,.xlsx"
						className="hidden"
						onChange={onFileChange}
					/>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
							disabled={parsing}
						>
							Chọn file
						</Button>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={downloadSample}
						>
							Tải file mẫu
						</Button>
						{parsing && <span className="text-xs">Đang đọc file…</span>}
					</div>
					{importResult?.ok && (
						<div className="rounded-md border border-line-soft border-solid bg-surface">
							<div className="flex items-center justify-between gap-2 px-3 py-2">
								<span className="text-xs">
									{importResult.modules.length} module ·{" "}
									{importResult.lessonCount} buổi học
								</span>
								{removeFileButton}
							</div>
							<div className="max-h-64 overflow-y-auto border-line-soft border-t">
								<table className="w-full border-collapse text-xs">
									<thead>
										<tr>
											{PREVIEW_HEADERS.map((h) => (
												<th
													key={h}
													className="border-line border-b px-2 py-1.5 text-left font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]"
												>
													{h}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{importResult.modules.map((m, mi) =>
											m.lessons.map((l, li) => (
												<tr
													key={`${mi}-${li}-${l.title}`}
													className="border-line-soft border-b"
												>
													<td className="px-2 py-1.5 font-mono text-muted-fg">
														{lessonNumber(importResult.modules, mi, li)}
													</td>
													<td className="px-2 py-1.5">
														<span
															className="block max-w-[7rem] truncate"
															title={m.title}
														>
															{li === 0 ? m.title : ""}
														</span>
													</td>
													<td className="px-2 py-1.5">
														<span
															className="block max-w-[9rem] truncate"
															title={l.objectives}
														>
															{l.objectives}
														</span>
													</td>
													<td className="px-2 py-1.5">
														<span
															className="block max-w-[7rem] truncate"
															title={l.materials}
														>
															{l.materials}
														</span>
													</td>
													<td className="px-2 py-1.5">
														<Tag>{STATUS_LABELS[l.status]}</Tag>
													</td>
												</tr>
											)),
										)}
									</tbody>
								</table>
							</div>
						</div>
					)}
					{importResult && !importResult.ok && (
						<div className="rounded-md border border-line-soft border-solid bg-surface">
							<div className="flex items-center justify-between gap-2 px-3 py-2">
								<span className="text-danger text-xs">
									File có {importResult.errors.length} lỗi
								</span>
								{removeFileButton}
							</div>
							<ul
								role="alert"
								className="list-disc py-2 pr-3 pl-8 text-danger text-xs"
							>
								{importResult.errors.slice(0, 100).map((err, i) => (
									<li key={`${i}-${err}`}>{err}</li>
								))}
								{importResult.errors.length > 100 && (
									<li key="more-errors">
										…và {importResult.errors.length - 100} lỗi khác (sửa 100 lỗi
										đầu rồi nhập lại)
									</li>
								)}
							</ul>
						</div>
					)}
				</Field>
				<Field label="Số buổi dự kiến">
					<Input
						type="number"
						value={total}
						onChange={(e) => setTotal(e.target.value)}
					/>
				</Field>
				<div className="flex flex-col gap-2">
					{error && (
						<p role="alert" className="text-danger text-xs">
							{error}
						</p>
					)}
					{notice && (
						<KernelSubmitNotice
							notice={notice}
							onReconcile={reconcileAndFinish}
							disabled={saving}
						/>
					)}
				</div>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						size="sm"
						disabled={saving || submitBlocked || parsing || importBlocked}
					>
						Tạo
					</Button>
				</div>
			</form>
		</Modal>
	);
}
