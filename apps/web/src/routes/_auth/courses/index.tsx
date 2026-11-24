import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import type {
	CourseCategoryDto,
	CourseItemDto,
} from "@teacher-os/api/course-contracts";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	CourseCategoryModal,
	CourseDeleteConfirmModal,
	CourseItemModal,
	type DeleteTarget,
} from "@/components/courses/course-dialogs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { inputCls } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	courseCatalogQueryKey,
	courseCatalogQueryOptions,
	courseErrorMessage,
	coursesAllQueryKey,
	createCourseCategory,
	createCourseItem,
	deleteCourseCategory,
	deleteCourseItem,
	reorderCourseCategories,
	reorderCourseItems,
	updateCourseCategory,
	updateCourseItem,
} from "@/lib/repos/courses";
import { useFinanceRouteGuard } from "@/lib/use-finance-route-guard";

export type CourseStatusFilter = "all" | "active" | "inactive";

export interface CoursesSearch {
	q?: string;
	status?: "active" | "inactive";
}

/** Chuẩn hóa search params — giá trị mặc định/lạ rơi về undefined (URL sạch). */
export function validateCoursesSearch(input: {
	q?: string | number;
	status?: string;
}): CoursesSearch {
	const rawQ =
		typeof input.q === "string"
			? input.q
			: typeof input.q === "number"
				? String(input.q)
				: "";
	const q = rawQ.trim().length > 0 ? rawQ : undefined;
	const status =
		input.status === "active" || input.status === "inactive"
			? input.status
			: undefined;
	return { q, status };
}

export const Route = createFileRoute("/_auth/courses/")({
	validateSearch: validateCoursesSearch,
	component: CoursesRoute,
});

const STATUS_FILTERS: ReadonlyArray<{
	id: CourseStatusFilter;
	label: string;
}> = [
	{ id: "all", label: "Tất cả" },
	{ id: "active", label: "Đang hoạt động" },
	{ id: "inactive", label: "Đã ẩn" },
];
const STATUS_OPTIONS = STATUS_FILTERS.map((f) => f.label);

function filtersToSearch(q: string, status: CourseStatusFilter): CoursesSearch {
	return {
		...(q.trim().length > 0 ? { q } : {}),
		...(status !== "all" ? { status } : {}),
	};
}

function swapIds(ids: readonly string[], from: number, to: number): string[] {
	const next = [...ids];
	const a = next[from];
	const b = next[to];
	if (a === undefined || b === undefined) return next;
	next[from] = b;
	next[to] = a;
	return next;
}

function StatusDotBadge({
	active,
	label,
}: {
	active: boolean;
	label?: string;
}) {
	const text = label ?? (active ? "Đang hoạt động" : "Đã ẩn");
	return (
		<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 font-medium text-muted-foreground text-xs">
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					active ? "bg-success" : "bg-warn",
				)}
			/>
			{text}
		</span>
	);
}

interface FilteredCategory {
	category: CourseCategoryDto;
	visibleCourses: CourseItemDto[];
}

function CoursesRoute() {
	const canAccessFinance = useFinanceRouteGuard();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const searchParams = useSearch({ from: "/_auth/courses/" });

	const statusFilter: CourseStatusFilter =
		searchParams.status === "active" || searchParams.status === "inactive"
			? searchParams.status
			: "all";

	// Query giữ state local rồi debounce 300ms lên URL để không mất ký tự khi gõ.
	const [query, setQuery] = useState(() => searchParams.q ?? "");
	const lastEmittedQuery = useRef(query);

	const activeFilterCount =
		(statusFilter !== "all" ? 1 : 0) + (query.trim().length > 0 ? 1 : 0);
	const hasActiveFilter = activeFilterCount > 0;

	const [filtersOpen, setFiltersOpen] = useState(
		() =>
			typeof window === "undefined" ||
			window.innerWidth >= 1024 ||
			hasActiveFilter,
	);

	// Modal states
	const [categoryModal, setCategoryModal] = useState<{
		open: boolean;
		mode: "create" | "edit";
		category: CourseCategoryDto | null;
	}>({ open: false, mode: "create", category: null });
	const [categoryModalError, setCategoryModalError] = useState<string | null>(
		null,
	);

	const [courseModal, setCourseModal] = useState<{
		open: boolean;
		mode: "create" | "edit";
		categoryId: string;
		course: CourseItemDto | null;
	}>({ open: false, mode: "create", categoryId: "", course: null });
	const [courseModalError, setCourseModalError] = useState<string | null>(null);

	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

	const catalogQuery = useQuery({
		...courseCatalogQueryOptions(),
		enabled: canAccessFinance,
	});

	useEffect(() => {
		if (isHttpError(catalogQuery.error) && catalogQuery.error.status === 401) {
			reauth();
		}
	}, [catalogQuery.error]);

	function applyFilters(next: { q: string; status: CourseStatusFilter }) {
		lastEmittedQuery.current = next.q;
		void navigate({
			to: "/courses",
			search: filtersToSearch(next.q, next.status),
			replace: true,
		});
	}

	// Sync URL -> state khi back/forward hoặc dán link chia sẻ.
	useEffect(() => {
		const urlQ = searchParams.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [searchParams.q]);

	// Debounce 300ms trước khi đẩy q lên URL.
	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			void navigate({
				to: "/courses",
				search: filtersToSearch(query, statusFilter),
				replace: true,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [query, statusFilter, navigate]);

	const invalidateCourses = () =>
		queryClient.invalidateQueries({ queryKey: coursesAllQueryKey });

	const saveCategoryMutation = useMutation({
		mutationFn: async (input: { id?: string; name: string }) => {
			if (input.id) {
				return updateCourseCategory(input.id, { name: input.name });
			}
			return createCourseCategory({ name: input.name });
		},
		onSuccess: async (_res, vars) => {
			toast.success(
				vars.id ? "Đã cập nhật nhóm khóa học." : "Đã thêm nhóm khóa học mới.",
			);
			setCategoryModal({ open: false, mode: "create", category: null });
			setCategoryModalError(null);
			await invalidateCourses();
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			const msg = courseErrorMessage(
				err,
				"Không thể lưu nhóm khóa học. Vui lòng thử lại.",
			);
			setCategoryModalError(msg);
			toast.error(msg);
		},
	});

	const toggleCategoryMutation = useMutation({
		mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
			updateCourseCategory(id, { isActive }),
		onSuccess: async (_res, vars) => {
			toast.success(
				vars.isActive ? "Đã hiện nhóm khóa học." : "Đã ẩn nhóm khóa học.",
			);
			await invalidateCourses();
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			toast.error(
				courseErrorMessage(err, "Không thể cập nhật trạng thái nhóm khóa học."),
			);
		},
	});

	const reorderCategoriesMutation = useMutation({
		mutationFn: (orderedIds: string[]) =>
			reorderCourseCategories({ orderedIds }),
		onSuccess: async (res) => {
			queryClient.setQueryData(courseCatalogQueryKey, res);
			await invalidateCourses();
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			toast.error(
				courseErrorMessage(err, "Không thể sắp xếp lại thứ tự nhóm khóa học."),
			);
		},
	});

	const saveCourseMutation = useMutation({
		mutationFn: async (input: {
			id?: string;
			categoryId: string;
			name: string;
		}) => {
			if (input.id) {
				return updateCourseItem(input.id, {
					categoryId: input.categoryId,
					name: input.name,
				});
			}
			return createCourseItem({
				categoryId: input.categoryId,
				name: input.name,
			});
		},
		onSuccess: async (_res, vars) => {
			toast.success(
				vars.id ? "Đã cập nhật khóa học." : "Đã thêm khóa học mới.",
			);
			setCourseModal({
				open: false,
				mode: "create",
				categoryId: "",
				course: null,
			});
			setCourseModalError(null);
			await invalidateCourses();
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			const msg = courseErrorMessage(
				err,
				"Không thể lưu khóa học. Vui lòng thử lại.",
			);
			setCourseModalError(msg);
			toast.error(msg);
		},
	});

	const toggleCourseMutation = useMutation({
		mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
			updateCourseItem(id, { isActive }),
		onSuccess: async (_res, vars) => {
			toast.success(vars.isActive ? "Đã hiện khóa học." : "Đã ẩn khóa học.");
			await invalidateCourses();
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			toast.error(
				courseErrorMessage(err, "Không thể cập nhật trạng thái khóa học."),
			);
		},
	});

	const reorderCoursesMutation = useMutation({
		mutationFn: ({
			categoryId,
			orderedIds,
		}: {
			categoryId: string;
			orderedIds: string[];
		}) => reorderCourseItems({ categoryId, orderedIds }),
		onSuccess: async (res) => {
			queryClient.setQueryData(courseCatalogQueryKey, res);
			await invalidateCourses();
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			toast.error(
				courseErrorMessage(err, "Không thể sắp xếp lại thứ tự khóa học."),
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (target: DeleteTarget) => {
			if (target.kind === "category") {
				return deleteCourseCategory(target.category.id);
			}
			return deleteCourseItem(target.course.id);
		},
		onSuccess: async (_res, target) => {
			toast.success(
				target.kind === "category"
					? "Đã xóa nhóm khóa học."
					: "Đã xóa khóa học.",
			);
			setDeleteTarget(null);
			await invalidateCourses();
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			toast.error(
				courseErrorMessage(err, "Không thể xóa mục này. Vui lòng thử lại."),
			);
		},
	});

	const categories = catalogQuery.data?.categories ?? [];
	const normalizedQ = query.trim().toLowerCase();

	const totalCourses = useMemo(
		() => categories.reduce((sum, cat) => sum + cat.courses.length, 0),
		[categories],
	);

	// Số khóa khớp theo từng trạng thái (tôn trọng ô search hiện tại).
	const statusChipCounts = useMemo(() => {
		let all = 0;
		let active = 0;
		let inactive = 0;
		for (const cat of categories) {
			const catMatches =
				!normalizedQ || cat.name.toLowerCase().includes(normalizedQ);
			for (const course of cat.courses) {
				const matchesQ =
					catMatches || course.name.toLowerCase().includes(normalizedQ);
				if (!matchesQ) continue;
				all += 1;
				if (cat.isActive && course.isActive) {
					active += 1;
				} else {
					inactive += 1;
				}
			}
		}
		return {
			"Tất cả": all,
			"Đang hoạt động": active,
			"Đã ẩn": inactive,
		};
	}, [categories, normalizedQ]);

	const filteredCategories = useMemo<FilteredCategory[]>(() => {
		const list: FilteredCategory[] = [];
		for (const category of categories) {
			const catMatchesQ =
				!normalizedQ || category.name.toLowerCase().includes(normalizedQ);

			if (statusFilter === "all") {
				if (!normalizedQ) {
					list.push({ category, visibleCourses: category.courses });
				} else if (catMatchesQ) {
					list.push({ category, visibleCourses: category.courses });
				} else {
					const matching = category.courses.filter((course) =>
						course.name.toLowerCase().includes(normalizedQ),
					);
					if (matching.length > 0) {
						list.push({ category, visibleCourses: matching });
					}
				}
				continue;
			}

			if (statusFilter === "active") {
				if (!category.isActive) continue;
				const matchingActive = category.courses.filter(
					(course) =>
						course.isActive &&
						(catMatchesQ || course.name.toLowerCase().includes(normalizedQ)),
				);
				if (
					matchingActive.length > 0 ||
					(category.courses.length === 0 && catMatchesQ)
				) {
					list.push({ category, visibleCourses: matchingActive });
				}
				continue;
			}

			// statusFilter === "inactive"
			if (!category.isActive) {
				const matchingCourses = category.courses.filter(
					(course) =>
						catMatchesQ || course.name.toLowerCase().includes(normalizedQ),
				);
				if (catMatchesQ || matchingCourses.length > 0) {
					list.push({ category, visibleCourses: matchingCourses });
				}
			} else {
				const matchingHidden = category.courses.filter(
					(course) =>
						!course.isActive &&
						(catMatchesQ || course.name.toLowerCase().includes(normalizedQ)),
				);
				if (matchingHidden.length > 0) {
					list.push({ category, visibleCourses: matchingHidden });
				}
			}
		}
		return list;
	}, [categories, normalizedQ, statusFilter]);

	const visibleCourseCount = useMemo(
		() =>
			filteredCategories.reduce(
				(sum, entry) => sum + entry.visibleCourses.length,
				0,
			),
		[filteredCategories],
	);

	const selectedStatusLabel =
		STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ?? "Tất cả";

	const isReordering =
		reorderCategoriesMutation.isPending || reorderCoursesMutation.isPending;

	const openCreateCategory = () => {
		setCategoryModalError(null);
		setCategoryModal({ open: true, mode: "create", category: null });
	};

	const openEditCategory = (category: CourseCategoryDto) => {
		setCategoryModalError(null);
		setCategoryModal({ open: true, mode: "edit", category });
	};

	const openCreateCourse = (categoryId?: string) => {
		setCourseModalError(null);
		setCourseModal({
			open: true,
			mode: "create",
			categoryId: categoryId ?? categories[0]?.id ?? "",
			course: null,
		});
	};

	const openEditCourse = (course: CourseItemDto) => {
		setCourseModalError(null);
		setCourseModal({
			open: true,
			mode: "edit",
			categoryId: course.categoryId,
			course,
		});
	};

	const clearFilters = () => {
		setQuery("");
		applyFilters({ q: "", status: "all" });
	};

	if (!canAccessFinance) return null;

	return (
		<div className="min-w-0">
			<PageHead
				title="Khóa học"
				lead="Quản trị danh mục nhóm và khóa học đề xuất cho bài kiểm tra đầu vào."
				action={
					<>
						<Button
							variant="outline"
							onClick={openCreateCategory}
							data-testid="add-category-btn"
						>
							+ Thêm nhóm
						</Button>
						<Button
							variant="primary"
							disabled={categories.length === 0}
							onClick={() => openCreateCourse()}
							data-testid="add-course-btn"
						>
							+ Thêm khóa học
						</Button>
					</>
				}
			/>

			{catalogQuery.isPending ? (
				<Card className="p-6 text-muted-foreground text-sm">
					Đang tải danh mục khóa học…
				</Card>
			) : catalogQuery.isError ? (
				<Card className="mx-auto max-w-md space-y-3 p-6 text-center">
					<p className="text-foreground text-sm">
						Không tải được danh mục khóa học. Vui lòng thử lại.
					</p>
					<div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void catalogQuery.refetch()}
						>
							Thử lại
						</Button>
					</div>
				</Card>
			) : categories.length === 0 ? (
				<Card className="p-8 text-center" data-testid="courses-empty-state">
					<h2 className="font-semibold text-foreground text-lg">
						Chưa có nhóm khóa học nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						Tạo nhóm khóa học đầu tiên (ví dụ: Giao Tiếp, IELTS) để quản lý danh
						sách khóa đề xuất khi chấm bài kiểm tra đầu vào.
					</p>
					<div className="mt-5 flex justify-center">
						<Button variant="primary" onClick={openCreateCategory}>
							+ Thêm nhóm đầu tiên
						</Button>
					</div>
				</Card>
			) : (
				<div className="flex min-w-0 flex-col gap-4">
					{/* Filter Card */}
					<Card className="flex flex-col gap-4 p-4 sm:p-5">
						<div className="flex items-center justify-between border-border border-b pb-3 lg:hidden">
							<button
								type="button"
								onClick={() => setFiltersOpen((v) => !v)}
								aria-expanded={filtersOpen}
								aria-controls="courses-filters-body"
								className="flex items-center gap-1.5 rounded-md font-medium text-foreground text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								Bộ lọc
								{activeFilterCount > 0 && (
									<span
										aria-hidden="true"
										className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground tabular-nums leading-4"
									>
										{activeFilterCount}
									</span>
								)}
								<ChevronDown
									aria-hidden="true"
									className={cn(
										"size-4 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150",
										filtersOpen && "rotate-180",
									)}
								/>
							</button>
							<span
								aria-hidden="true"
								className="text-muted-foreground text-xs tabular-nums"
							>
								{visibleCourseCount}/{totalCourses} khóa
							</span>
						</div>

						<div
							id="courses-filters-body"
							className={cn(
								"flex flex-col gap-4",
								!filtersOpen && "hidden lg:flex",
							)}
						>
							<div>
								<input
									type="text"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Tìm theo tên nhóm hoặc khóa học…"
									aria-label="Tìm theo tên nhóm hoặc khóa học"
									data-testid="courses-search-input"
									className={inputCls}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-foreground text-xs">
									Trạng thái
								</span>
								<ChipFilter
									options={STATUS_OPTIONS}
									value={selectedStatusLabel}
									onChange={(label) => {
										const next =
											STATUS_FILTERS.find((f) => f.label === label)?.id ??
											"all";
										applyFilters({ q: query, status: next });
									}}
									ariaLabel="Trạng thái khóa học"
									counts={statusChipCounts}
								/>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-3">
								<p
									aria-live="polite"
									data-testid="courses-status-summary"
									className="text-muted-foreground text-xs tabular-nums"
								>
									{`Hiển thị ${filteredCategories.length} nhóm · ${visibleCourseCount} khóa học`}
								</p>
								{hasActiveFilter && (
									<Button
										variant="outline"
										size="sm"
										onClick={clearFilters}
										data-testid="courses-clear-filters-btn"
									>
										Xóa bộ lọc
									</Button>
								)}
							</div>
						</div>
					</Card>

					{filteredCategories.length === 0 ? (
						<Card
							className="space-y-3 p-8 text-center"
							data-testid="courses-no-match"
						>
							<p className="text-muted-foreground text-sm">
								Không có nhóm hoặc khóa học nào phù hợp với bộ lọc hiện tại.
							</p>
							{hasActiveFilter && (
								<div>
									<Button variant="outline" size="sm" onClick={clearFilters}>
										Xóa bộ lọc
									</Button>
								</div>
							)}
						</Card>
					) : (
						<div className="flex min-w-0 flex-col gap-4">
							{filteredCategories.map(({ category, visibleCourses }) => {
								const categoryIndex = categories.findIndex(
									(c) => c.id === category.id,
								);
								const canDeleteCategory = category.courses.length === 0;
								const disableMoveCategoryUp =
									hasActiveFilter || categoryIndex <= 0 || isReordering;
								const disableMoveCategoryDown =
									hasActiveFilter ||
									categoryIndex < 0 ||
									categoryIndex >= categories.length - 1 ||
									isReordering;

								return (
									<Card
										key={category.id}
										data-testid="course-category-card"
										data-category-id={category.id}
										className="min-w-0 overflow-hidden p-0"
									>
										{/* Category Header */}
										<div className="flex flex-col gap-2.5 border-border border-b bg-muted/30 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
											<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
												<h2 className="break-words font-semibold text-base text-foreground">
													{category.name}
												</h2>
												<span className="inline-flex shrink-0 items-center rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground text-xs tabular-nums">
													{category.courses.length} khóa
												</span>
												<StatusDotBadge active={category.isActive} />
											</div>

											<div className="flex shrink-0 flex-wrap items-center gap-1.5">
												<Button
													variant="outline"
													size="icon-sm"
													disabled={disableMoveCategoryUp}
													aria-label={`Di chuyển nhóm ${category.name} lên`}
													title={
														hasActiveFilter
															? "Xóa bộ lọc để sắp xếp thứ tự"
															: "Di chuyển lên"
													}
													onClick={() => {
														const nextIds = swapIds(
															categories.map((c) => c.id),
															categoryIndex,
															categoryIndex - 1,
														);
														reorderCategoriesMutation.mutate(nextIds);
													}}
												>
													<ArrowUp aria-hidden="true" />
												</Button>
												<Button
													variant="outline"
													size="icon-sm"
													disabled={disableMoveCategoryDown}
													aria-label={`Di chuyển nhóm ${category.name} xuống`}
													title={
														hasActiveFilter
															? "Xóa bộ lọc để sắp xếp thứ tự"
															: "Di chuyển xuống"
													}
													onClick={() => {
														const nextIds = swapIds(
															categories.map((c) => c.id),
															categoryIndex,
															categoryIndex + 1,
														);
														reorderCategoriesMutation.mutate(nextIds);
													}}
												>
													<ArrowDown aria-hidden="true" />
												</Button>
												<Button
													variant="outline"
													size="sm"
													aria-label={`Thêm khóa học vào nhóm ${category.name}`}
													onClick={() => openCreateCourse(category.id)}
												>
													+ Thêm khóa
												</Button>
												<Button
													variant="outline"
													size="sm"
													aria-label={`Sửa nhóm ${category.name}`}
													onClick={() => openEditCategory(category)}
												>
													Sửa
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={toggleCategoryMutation.isPending}
													aria-label={
														category.isActive
															? `Ẩn nhóm ${category.name}`
															: `Hiện nhóm ${category.name}`
													}
													onClick={() =>
														toggleCategoryMutation.mutate({
															id: category.id,
															isActive: !category.isActive,
														})
													}
												>
													{category.isActive ? "Ẩn" : "Hiện"}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={!canDeleteCategory}
													title={
														canDeleteCategory
															? "Xóa nhóm khóa học"
															: "Chỉ xóa được nhóm không còn khóa học nào bên trong"
													}
													aria-label={`Xóa nhóm ${category.name}`}
													className={
														canDeleteCategory
															? "text-destructive hover:bg-destructive/10 hover:text-destructive"
															: undefined
													}
													onClick={() =>
														setDeleteTarget({
															kind: "category",
															category,
														})
													}
												>
													Xóa
												</Button>
											</div>
										</div>

										{/* Courses List */}
										{visibleCourses.length === 0 ? (
											<div className="px-4 py-5 text-center text-muted-foreground text-sm sm:px-5">
												Nhóm này chưa có khóa học nào.
											</div>
										) : (
											<ol className="divide-y divide-border">
												{visibleCourses.map((course) => {
													const courseIndex = category.courses.findIndex(
														(c) => c.id === course.id,
													);
													const disableMoveCourseUp =
														hasActiveFilter || courseIndex <= 0 || isReordering;
													const disableMoveCourseDown =
														hasActiveFilter ||
														courseIndex < 0 ||
														courseIndex >= category.courses.length - 1 ||
														isReordering;

													return (
														<li
															key={course.id}
															data-testid="course-item-row"
															data-course-id={course.id}
															className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5"
														>
															<div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
																<span className="w-6 shrink-0 pt-0.5 font-mono text-muted-foreground text-xs tabular-nums sm:pt-0">
																	{courseIndex + 1}.
																</span>
																<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
																	<span
																		className={cn(
																			"break-words font-medium text-sm",
																			course.isActive && category.isActive
																				? "text-foreground"
																				: "text-muted-foreground",
																		)}
																	>
																		{course.name}
																	</span>
																	<StatusDotBadge active={course.isActive} />
																	{!category.isActive && course.isActive && (
																		<span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs">
																			Nhóm đang ẩn
																		</span>
																	)}
																</div>
															</div>

															<div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-8 sm:pl-0">
																<Button
																	variant="outline"
																	size="icon-sm"
																	disabled={disableMoveCourseUp}
																	aria-label={`Di chuyển khóa học ${course.name} lên`}
																	title={
																		hasActiveFilter
																			? "Xóa bộ lọc để sắp xếp thứ tự"
																			: "Di chuyển lên"
																	}
																	onClick={() => {
																		const nextIds = swapIds(
																			category.courses.map((c) => c.id),
																			courseIndex,
																			courseIndex - 1,
																		);
																		reorderCoursesMutation.mutate({
																			categoryId: category.id,
																			orderedIds: nextIds,
																		});
																	}}
																>
																	<ArrowUp aria-hidden="true" />
																</Button>
																<Button
																	variant="outline"
																	size="icon-sm"
																	disabled={disableMoveCourseDown}
																	aria-label={`Di chuyển khóa học ${course.name} xuống`}
																	title={
																		hasActiveFilter
																			? "Xóa bộ lọc để sắp xếp thứ tự"
																			: "Di chuyển xuống"
																	}
																	onClick={() => {
																		const nextIds = swapIds(
																			category.courses.map((c) => c.id),
																			courseIndex,
																			courseIndex + 1,
																		);
																		reorderCoursesMutation.mutate({
																			categoryId: category.id,
																			orderedIds: nextIds,
																		});
																	}}
																>
																	<ArrowDown aria-hidden="true" />
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	aria-label={`Sửa khóa học ${course.name}`}
																	onClick={() => openEditCourse(course)}
																>
																	Sửa
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	disabled={toggleCourseMutation.isPending}
																	aria-label={
																		course.isActive
																			? `Ẩn khóa học ${course.name}`
																			: `Hiện khóa học ${course.name}`
																	}
																	onClick={() =>
																		toggleCourseMutation.mutate({
																			id: course.id,
																			isActive: !course.isActive,
																		})
																	}
																>
																	{course.isActive ? "Ẩn" : "Hiện"}
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	aria-label={`Xóa khóa học ${course.name}`}
																	className="text-destructive hover:bg-destructive/10 hover:text-destructive"
																	onClick={() =>
																		setDeleteTarget({
																			kind: "course",
																			categoryName: category.name,
																			course,
																		})
																	}
																>
																	Xóa
																</Button>
															</div>
														</li>
													);
												})}
											</ol>
										)}
									</Card>
								);
							})}
						</div>
					)}
				</div>
			)}

			<CourseCategoryModal
				open={categoryModal.open}
				mode={categoryModal.mode}
				initialCategory={categoryModal.category}
				pending={saveCategoryMutation.isPending}
				serverError={categoryModalError}
				onClearServerError={() => setCategoryModalError(null)}
				onClose={() => {
					setCategoryModal({ open: false, mode: "create", category: null });
					setCategoryModalError(null);
				}}
				onSubmit={(name) =>
					saveCategoryMutation.mutate({
						id:
							categoryModal.mode === "edit"
								? categoryModal.category?.id
								: undefined,
						name,
					})
				}
			/>

			<CourseItemModal
				open={courseModal.open}
				mode={courseModal.mode}
				categories={categories}
				initialCategoryId={courseModal.categoryId}
				initialCourse={courseModal.course}
				pending={saveCourseMutation.isPending}
				serverError={courseModalError}
				onClearServerError={() => setCourseModalError(null)}
				onClose={() => {
					setCourseModal({
						open: false,
						mode: "create",
						categoryId: "",
						course: null,
					});
					setCourseModalError(null);
				}}
				onSubmit={({ categoryId, name }) =>
					saveCourseMutation.mutate({
						id:
							courseModal.mode === "edit" ? courseModal.course?.id : undefined,
						categoryId,
						name,
					})
				}
			/>

			<CourseDeleteConfirmModal
				target={deleteTarget}
				pending={deleteMutation.isPending}
				onClose={() => setDeleteTarget(null)}
				onConfirm={() => {
					if (deleteTarget) {
						deleteMutation.mutate(deleteTarget);
					}
				}}
			/>
		</div>
	);
}
