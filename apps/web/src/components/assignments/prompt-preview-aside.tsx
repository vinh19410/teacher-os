import { Link, useNavigate } from "@tanstack/react-router";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { AssignmentPrompt } from "@/lib/mock-data";
import {
	isAutoSkill,
	partOf,
	selectedTypeOf,
	skillOf,
} from "./assignment-presets";
import { PromptStudentPaper } from "./prompt-student-paper";

interface PromptPreviewAsideProps {
	prompt: AssignmentPrompt;
}

/**
 * Bản xem trước độc lập nhỏ gọn (giữ lại cho kiểm thử #269/#271/#282/#847):
 * uỷ quyền render tờ đề phía học viên cho `PromptStudentPaper` (không hiện
 * Band hay đáp án bí mật).
 */
export function PromptPreviewAside({ prompt }: PromptPreviewAsideProps) {
	const navigate = useNavigate();
	const skillId = prompt.skill ?? "writing";
	const partId = prompt.part ?? prompt.task ?? "task2";
	const typeId = prompt.type ?? prompt.genre ?? "";
	const skill = skillOf(skillId);
	const part = partOf(skillId, partId);
	const type = selectedTypeOf(skillId, partId, typeId);
	const trimmedTitle = prompt.title.trim() || "Chưa đặt tên đề";
	const isAuto = isAutoSkill(skillId);

	return (
		<aside
			aria-label="Xem trước đề"
			className="rounded-xl border bg-card p-5 shadow-sm lg:sticky lg:top-[76px]"
		>
			<p className="text-muted-foreground text-xs">Xem trước phía học viên</p>
			<p className="mt-1 font-semibold text-[17px] text-foreground">
				{trimmedTitle}
			</p>
			<p className="mt-1.5 mb-3 text-muted-foreground text-xs">
				{part.spec}
				{prompt.level?.trim() ? ` · ${prompt.level.trim()}` : ""}
			</p>

			<PromptStudentPaper prompt={prompt} />

			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{skill.name}</Tag>
				<Tag>{part.label}</Tag>
				<Tag>{type?.label ?? "Chưa chọn dạng"}</Tag>
				{prompt.source.trim() && <Tag>{prompt.source.trim()}</Tag>}
				{isAuto && <Tag>Chấm tự động</Tag>}
				{isAuto && prompt.writing != null && <Tag>+ Writing</Tag>}
				{!isEmptyRichText(prompt.note ?? "") && <Tag>Có hướng dẫn thêm</Tag>}
			</div>

			<div className="mt-4 rounded-md bg-muted px-3 py-2.5 text-muted-foreground text-xs leading-relaxed">
				Đề này chưa giao lớp. Giao cho học viên ở trang{" "}
				<Link
					to="/classes"
					className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
				>
					Lớp học
				</Link>
				.
			</div>

			<div className="mt-3 flex gap-2">
				<Button
					variant="secondary"
					className="flex-1"
					onClick={() =>
						navigate({ to: "/assignments/preview", search: { id: prompt.id } })
					}
				>
					Xem trước
				</Button>
				<Button
					className="flex-1"
					onClick={() =>
						navigate({
							to: "/assignments/new",
							search: { promptId: prompt.id },
						})
					}
				>
					Chỉnh sửa
				</Button>
			</div>
		</aside>
	);
}
