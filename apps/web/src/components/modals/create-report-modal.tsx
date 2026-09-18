import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

export function CreateReportModal({
	open,
	onClose,
	defaultStudentId,
}: {
	open: boolean;
	onClose: () => void;
	defaultStudentId?: string;
}) {
	const { data, dispatch } = useData();
	const [sid, setSid] = useState(
		defaultStudentId ?? data.students[0]?.id ?? "",
	);
	const [period, setPeriod] = useState("");
	const [content, setContent] = useState("");
	const [channel, setChannel] = useState("Zalo OA");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function save(status: "draft" | "sent") {
		if (busy) return;
		if (!sid) {
			setError("Chọn học viên trước khi lưu.");
			return;
		}
		if (!period.trim()) {
			setError("Nhập chu kỳ báo cáo (VD: 01–07/09).");
			return;
		}
		if (status === "sent" && !content.trim()) {
			setError("Nhập nội dung báo cáo trước khi gửi.");
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const result = await dispatch({
				type: "create-report",
				payload: {
					studentId: sid,
					period: period.trim(),
					content,
					channel,
					status,
				},
			});
			// definite-failure: nothing landed — keep the modal so the text
			// isn't lost. outcome-unknown: the write may have landed; keeping
			// the modal open beats risking a duplicate on blind retry.
			if (result.kind === "definite-failure") {
				setError(
					status === "sent"
						? "Không gửi được báo cáo — thử lại."
						: "Không lưu được nháp — thử lại.",
				);
				return;
			}
			if (result.kind === "outcome-unknown") {
				setError(
					"Không chắc báo cáo đã lưu — kiểm tra danh sách trước khi thử lại.",
				);
				return;
			}
			setPeriod("");
			setContent("");
			setError(null);
			onClose();
		} finally {
			setBusy(false);
		}
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		void save("sent");
	}

	return (
		<Modal open={open} onClose={onClose} title="Tạo báo cáo tuần">
			<form noValidate onSubmit={submit}>
				<Field label="Học viên">
					<Select value={sid} onChange={(e) => setSid(e.target.value)}>
						{data.students.length === 0 && (
							<option value="">Chưa có học viên</option>
						)}
						{data.students.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Chu kỳ">
					<Input
						value={period}
						onChange={(e) => setPeriod(e.target.value)}
						placeholder="VD: 01–07/09"
					/>
				</Field>
				<Field label="Nội dung báo cáo">
					<Textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="Nhập nội dung báo cáo..."
						className="min-h-35"
					/>
				</Field>
				<Field label="Gửi qua">
					<Select value={channel} onChange={(e) => setChannel(e.target.value)}>
						<option value="Zalo OA">Zalo OA (Chưa kết nối)</option>
						<option>Email</option>
					</Select>
				</Field>
				{error && (
					<p className="mb-3 text-[13px] text-[color-mix(in_oklab,var(--danger),black_18%)]">
						{error}
					</p>
				)}
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						type="button"
						disabled={busy}
						onClick={() => void save("draft")}
					>
						Lưu nháp
					</Button>
					<Button type="submit" size="sm" disabled={busy}>
						Gửi báo cáo
					</Button>
				</div>
			</form>
		</Modal>
	);
}
