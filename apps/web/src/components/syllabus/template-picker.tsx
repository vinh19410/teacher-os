import { LessonKindBadge } from "@/components/syllabus/lesson-kind";
import { Field, Select } from "@/components/ui/field";
import { Tag } from "@/components/ui/tag";
import type { SyllabusTemplate } from "@/lib/mock-data";

/**
 * Một component chọn template duy nhất (design D8, issue #394): dùng cho tạo
 * lớp (allowEmpty) và gán sau ở tab Giáo trình. Preview chỉ đọc từ dữ liệu
 * template đã có trong snapshot — không thêm endpoint. Toàn bộ class lấy từ
 * token globals.css, không hex/px tuỳ ý.
 */
export function TemplatePicker({
	templates,
	value,
	onChange,
	allowEmpty = false,
	emptyLabel = "— Lớp trống —",
	label = "Template giáo trình",
	disabled = false,
}: {
	templates: readonly SyllabusTemplate[];
	value: string;
	onChange: (id: string) => void;
	/** Cho phép không chọn (tạo lớp trống) — thêm option rỗng. */
	allowEmpty?: boolean;
	emptyLabel?: string;
	label?: string;
	disabled?: boolean;
}) {
	if (templates.length === 0) {
		return (
			<Field label={label}>
				<p className="text-muted-foreground text-sm">
					Chưa có template nào — tạo syllabus ở trang Syllabus trước.
				</p>
			</Field>
		);
	}

	const selected = templates.find((item) => item.id === value) ?? null;

	return (
		<>
			<Field label={label}>
				<Select
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
				>
					{allowEmpty ? <option value="">{emptyLabel}</option> : null}
					{templates.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name} · {item.totalLessons} buổi
						</option>
					))}
				</Select>
			</Field>
			{/* aria-live để màn hình đọc biết preview đổi theo template được chọn. */}
			<div aria-live="polite">
				{selected ? (
					<div className="text-muted-foreground text-sm">
						<div className="flex flex-wrap items-center gap-1">
							<span>{selected.totalLessons} buổi</span>
							{selected.skills.length > 0 ? (
								<>
									<span aria-hidden="true">·</span>
									{selected.skills.map((skill) => (
										<Tag key={skill}>{skill}</Tag>
									))}
								</>
							) : (
								<span>· Syllabus chưa khai báo kỹ năng</span>
							)}
						</div>
						<details className="mt-1">
							<summary className="cursor-pointer">Xem nội dung</summary>
							<ul className="mt-1 list-disc space-y-1 pl-5">
								{selected.modules.map((mod) => (
									<li key={mod.id}>
										<span className="text-foreground">{mod.title}</span>
										{mod.lessons.length > 0 ? (
											<ul className="list-[circle] space-y-0.5 pl-5">
												{mod.lessons.map((lesson) => (
													<li
														key={lesson.id}
														className="flex items-center gap-1"
													>
														<span>{lesson.title}</span>
														<LessonKindBadge kind={lesson.kind} />
													</li>
												))}
											</ul>
										) : null}
									</li>
								))}
							</ul>
						</details>
					</div>
				) : null}
			</div>
		</>
	);
}
