import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

const DEFAULT_CONTENT = `Số buổi: 2 · Chuyên cần: Đủ

Band gần nhất: 6.5 (Writing)
Bài đã nộp: Task 2 Opinion Essay

Việc cần làm ở nhà:
- Làm bài Task 1 (Bar chart) — hạn 24/08
- Ôn lại article a/an`;

export function CreateReportModal({
	open,
	onClose,
	defaultStudentId,
}: {
	open: boolean;
	onClose: () => void;
	defaultStudentId?: string;
}) {
	const { data } = useData();
	const [sid, setSid] = useState(
		defaultStudentId ?? data.students[0]?.id ?? "",
	);
	const [period, setPeriod] = useState("19–25/08");
	const [content, setContent] = useState(DEFAULT_CONTENT);
	const [channel, setChannel] = useState("Zalo OA");

	function submit(e: FormEvent) {
		e.preventDefault();
		// Export behavior: send is a modal-only flow; closing is the effect.
		onClose();
	}

	return (
		<Modal open={open} onClose={onClose} title="Tạo báo cáo tuần">
			<form onSubmit={submit}>
				<Field label="Học viên">
					<Select value={sid} onChange={(e) => setSid(e.target.value)}>
						{data.students.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Chu kỳ">
					<Input value={period} onChange={(e) => setPeriod(e.target.value)} />
				</Field>
				<Field label="Nội dung báo cáo">
					<Textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						className="min-h-35"
					/>
				</Field>
				<Field label="Gửi qua">
					<Select value={channel} onChange={(e) => setChannel(e.target.value)}>
						<option>Zalo OA</option>
						<option>Email</option>
					</Select>
				</Field>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Lưu nháp
					</Button>
					<Button type="submit" size="sm">
						Gửi báo cáo
					</Button>
				</div>
			</form>
		</Modal>
	);
}
