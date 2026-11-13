import {
	CLASS_TYPES,
	type ClassType,
	IELTS_SKILLS,
} from "@teacher-os/api/contracts";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { SyllabusImportPreview } from "@/components/syllabus/import-preview";
import { Button } from "@/components/ui/button";
import { ChipMulti } from "@/components/ui/chip-multi";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { CLASS_TYPE_LABELS } from "@/lib/mock-data";
import {
	downloadSyllabusSampleXlsx,
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

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Tạo syllabus mới"
		>
			<form noValidate onSubmit={submit}>
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
				<Field label="Nhập nhanh từ Excel (tùy chọn)">
					<input
						ref={fileInputRef}
						type="file"
						accept=".xlsx"
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
							onClick={downloadSyllabusSampleXlsx}
						>
							Tải file mẫu
						</Button>
						{parsing && <span className="text-xs">Đang đọc file…</span>}
					</div>
					{/* Gỡ file không hoàn tác `total`: giá trị là dự định số buổi user
					    vừa thấy ở preview và tự chỉnh được — đưa về mặc định sẽ giết
					    input của user (component preview dùng chung không biết `total`). */}
					<SyllabusImportPreview
						result={importResult}
						onRemove={() => setImportResult(null)}
						disabled={saving || parsing}
					/>
				</Field>
				<Field
					label="Số buổi dự kiến"
					help={
						importResult?.ok
							? "Số buổi lấy từ file import. Gỡ file để chỉnh thủ công."
							: undefined
					}
				>
					<Input
						type="number"
						disabled={importResult?.ok === true}
						value={total}
						onChange={(e) => setTotal(e.target.value)}
					/>
				</Field>
				<div className="flex flex-col gap-2 empty:hidden">
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
				<div className="flex justify-end gap-2 border-border border-t border-solid pt-4">
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
