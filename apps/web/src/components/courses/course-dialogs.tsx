import {
	COURSE_CATEGORY_NAME_MAX,
	COURSE_NAME_MAX,
	type CourseCategoryDto,
	type CourseItemDto,
} from "@teacher-os/api/course-contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

export function CourseCategoryModal({
	open,
	mode,
	initialCategory,
	pending,
	serverError,
	onClearServerError,
	onClose,
	onSubmit,
}: {
	open: boolean;
	mode: "create" | "edit";
	initialCategory: CourseCategoryDto | null;
	pending: boolean;
	serverError: string | null;
	onClearServerError?: () => void;
	onClose: () => void;
	onSubmit: (name: string) => void;
}) {
	const [name, setName] = useState("");
	const [localError, setLocalError] = useState<string | null>(null);
	const wasOpenRef = useRef(false);

	useEffect(() => {
		const justOpened = open && !wasOpenRef.current;
		wasOpenRef.current = open;
		if (!justOpened) return;
		setName(mode === "edit" ? (initialCategory?.name ?? "") : "");
		setLocalError(null);
	}, [open, mode, initialCategory]);

	const safeClose = () => {
		if (!pending) onClose();
	};

	const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (trimmed.length === 0) {
			setLocalError("Tên nhóm khóa học không được để trống.");
			return;
		}
		if (trimmed.length > COURSE_CATEGORY_NAME_MAX) {
			setLocalError(
				`Tên nhóm khóa học tối đa ${COURSE_CATEGORY_NAME_MAX} ký tự.`,
			);
			return;
		}
		setLocalError(null);
		onSubmit(trimmed);
	};

	const displayError = localError ?? serverError;

	return (
		<Modal
			open={open}
			onClose={safeClose}
			title={mode === "create" ? "Thêm nhóm khóa học" : "Sửa nhóm khóa học"}
			description="Nhóm dùng để phân loại các khóa học đề xuất khi chấm bài kiểm tra đầu vào."
		>
			<form onSubmit={handleSubmit} noValidate>
				<Field
					label="Tên nhóm khóa học *"
					htmlFor="course-category-name-input"
					error={displayError ?? undefined}
					help={`Tối đa ${COURSE_CATEGORY_NAME_MAX} ký tự (ví dụ: Giao Tiếp, IELTS).`}
				>
					<Input
						id="course-category-name-input"
						data-testid="course-category-name-input"
						value={name}
						maxLength={COURSE_CATEGORY_NAME_MAX}
						placeholder="Nhập tên nhóm khóa học"
						disabled={pending}
						onChange={(e) => {
							setName(e.target.value);
							if (localError) setLocalError(null);
							if (serverError) onClearServerError?.();
						}}
					/>
				</Field>
				<div className="flex justify-end gap-2 pt-2">
					<Button
						variant="outline"
						size="sm"
						onClick={safeClose}
						disabled={pending}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						disabled={pending}
						aria-busy={pending}
						data-testid="course-category-submit-btn"
					>
						{pending
							? "Đang lưu…"
							: mode === "create"
								? "Tạo nhóm"
								: "Lưu thay đổi"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}

export function CourseItemModal({
	open,
	mode,
	categories,
	initialCategoryId,
	initialCourse,
	pending,
	serverError,
	onClearServerError,
	onClose,
	onSubmit,
}: {
	open: boolean;
	mode: "create" | "edit";
	categories: readonly CourseCategoryDto[];
	initialCategoryId: string;
	initialCourse: CourseItemDto | null;
	pending: boolean;
	serverError: string | null;
	onClearServerError?: () => void;
	onClose: () => void;
	onSubmit: (payload: { categoryId: string; name: string }) => void;
}) {
	const [categoryId, setCategoryId] = useState("");
	const [name, setName] = useState("");
	const [categoryError, setCategoryError] = useState<string | null>(null);
	const [nameError, setNameError] = useState<string | null>(null);
	const wasOpenRef = useRef(false);

	useEffect(() => {
		const justOpened = open && !wasOpenRef.current;
		wasOpenRef.current = open;
		if (!justOpened) return;
		const fallbackCategoryId = initialCategoryId || categories[0]?.id || "";
		setCategoryId(
			mode === "edit"
				? (initialCourse?.categoryId ?? fallbackCategoryId)
				: fallbackCategoryId,
		);
		setName(mode === "edit" ? (initialCourse?.name ?? "") : "");
		setCategoryError(null);
		setNameError(null);
	}, [open, mode, initialCategoryId, initialCourse, categories]);

	const safeClose = () => {
		if (!pending) onClose();
	};

	const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const trimmedCategoryId = categoryId.trim();
		const trimmedName = name.trim();
		let hasError = false;
		if (!trimmedCategoryId) {
			setCategoryError("Vui lòng chọn nhóm khóa học.");
			hasError = true;
		} else {
			setCategoryError(null);
		}
		if (trimmedName.length === 0) {
			setNameError("Tên khóa học không được để trống.");
			hasError = true;
		} else if (trimmedName.length > COURSE_NAME_MAX) {
			setNameError(`Tên khóa học tối đa ${COURSE_NAME_MAX} ký tự.`);
			hasError = true;
		} else {
			setNameError(null);
		}
		if (hasError) return;
		onSubmit({ categoryId: trimmedCategoryId, name: trimmedName });
	};

	const displayNameError = nameError ?? serverError;

	return (
		<Modal
			open={open}
			onClose={safeClose}
			title={mode === "create" ? "Thêm khóa học" : "Sửa khóa học"}
			description="Khóa học đang hoạt động sẽ xuất hiện theo nhóm trong danh sách đề xuất khi chấm bài kiểm tra đầu vào."
		>
			<form onSubmit={handleSubmit} noValidate>
				<Field
					label="Nhóm khóa học *"
					htmlFor="course-item-category-select"
					error={categoryError ?? undefined}
				>
					<Select
						id="course-item-category-select"
						data-testid="course-item-category-select"
						value={categoryId}
						disabled={pending}
						onChange={(e) => {
							setCategoryId(e.target.value);
							if (categoryError) setCategoryError(null);
							if (serverError) onClearServerError?.();
						}}
					>
						<option value="">-- Chọn nhóm khóa học --</option>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.isActive ? category.name : `${category.name} (đã ẩn)`}
							</option>
						))}
					</Select>
				</Field>
				<Field
					label="Tên khóa học *"
					htmlFor="course-item-name-input"
					error={displayNameError ?? undefined}
					help={`Tối đa ${COURSE_NAME_MAX} ký tự (ví dụ: Foundation, Pre IELTS).`}
				>
					<Input
						id="course-item-name-input"
						data-testid="course-item-name-input"
						value={name}
						maxLength={COURSE_NAME_MAX}
						placeholder="Nhập tên khóa học"
						disabled={pending}
						onChange={(e) => {
							setName(e.target.value);
							if (nameError) setNameError(null);
							if (serverError) onClearServerError?.();
						}}
					/>
				</Field>
				<div className="flex justify-end gap-2 pt-2">
					<Button
						variant="outline"
						size="sm"
						onClick={safeClose}
						disabled={pending}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						disabled={pending}
						aria-busy={pending}
						data-testid="course-item-submit-btn"
					>
						{pending
							? "Đang lưu…"
							: mode === "create"
								? "Tạo khóa học"
								: "Lưu thay đổi"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}

export type DeleteTarget =
	| { kind: "category"; category: CourseCategoryDto }
	| { kind: "course"; categoryName: string; course: CourseItemDto };

export function CourseDeleteConfirmModal({
	target,
	pending,
	onClose,
	onConfirm,
}: {
	target: DeleteTarget | null;
	pending: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	if (!target) return null;

	const safeClose = () => {
		if (!pending) onClose();
	};
	const isCategory = target.kind === "category";
	const title = isCategory ? "Xóa nhóm khóa học" : "Xóa khóa học";

	return (
		<Modal
			open
			onClose={safeClose}
			title={title}
			footer={
				<>
					<Button
						variant="outline"
						size="sm"
						onClick={safeClose}
						disabled={pending}
					>
						Hủy
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={pending}
						aria-busy={pending}
						onClick={onConfirm}
						data-testid="course-delete-confirm-btn"
					>
						{pending ? "Đang xóa…" : "Xóa"}
					</Button>
				</>
			}
		>
			{isCategory ? (
				<p className="text-foreground text-sm">
					Bạn có chắc muốn xóa nhóm{" "}
					<strong className="font-semibold">{target.category.name}</strong>?
					Hành động này không thể hoàn tác.
				</p>
			) : (
				<div className="space-y-2 text-sm">
					<p className="text-foreground">
						Bạn có chắc muốn xóa khóa học{" "}
						<strong className="font-semibold">
							{target.categoryName} - {target.course.name}
						</strong>
						?
					</p>
					<p className="text-muted-foreground text-xs">
						Xóa khóa học này không ảnh hưởng đến các bài kiểm tra đầu vào đã
						chấm trước đó — kết quả đã chốt vẫn giữ nguyên tên khóa đề xuất đã
						lưu.
					</p>
				</div>
			)}
		</Modal>
	);
}
