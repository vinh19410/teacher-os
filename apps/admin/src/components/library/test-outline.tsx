import { cn } from "@/lib/cn";
import type { OutlineSection } from "./test-outline-model";

/**
 * Cây điều hướng ba tầng Part → Nhóm → Câu (#424 Task 3.2). Nút part có
 * accessible name ĐÚNG bằng nhãn slot (e2e chọn theo tên); phụ đề đếm và
 * chấm cảnh báo nằm NGOÀI button (aria-hidden) để không lọt vào tên.
 * Cây chỉ liệt kê nhóm/câu của part đang mở; part trống chỉ có dòng part.
 */

export interface OutlineTarget {
	part: string;
	group?: number;
	question?: number;
}

export function TestOutline({
	sections,
	active,
	onSelect,
	collapsed,
	onCollapsedChange,
}: {
	sections: readonly OutlineSection[];
	active: OutlineTarget | null;
	onSelect: (target: OutlineTarget) => void;
	collapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
}) {
	return (
		<nav aria-label="Mục lục đề" className="flex flex-col gap-1 text-sm">
			<button
				type="button"
				aria-expanded={!collapsed}
				onClick={() => onCollapsedChange(!collapsed)}
				className="self-start text-muted-foreground text-xs underline-offset-2 hover:underline"
			>
				{collapsed ? "Mở mục lục" : "Thu gọn mục lục"}
			</button>
			{!collapsed &&
				sections.map((section) => {
					const isPartActive = active?.part === section.part;
					const expanded = isPartActive;
					return (
						<div key={section.part} className="flex flex-col gap-0.5">
							<div className="flex items-center gap-1.5">
								<button
									type="button"
									aria-current={isPartActive ? "true" : undefined}
									onClick={() => onSelect({ part: section.part })}
									className={cn(
										"rounded px-1.5 py-1 text-left font-medium hover:bg-accent",
										isPartActive
											? "bg-muted font-medium text-foreground"
											: "text-foreground",
									)}
								>
									{section.label}
								</button>
								{section.state === "dirty" && (
									<span className="flex items-center gap-1">
										<span
											aria-hidden="true"
											className="inline-block size-2 rounded-full bg-amber-500"
										/>
										<span className="sr-only">chưa lưu</span>
									</span>
								)}
								{section.state === "empty" ? (
									<span
										aria-hidden="true"
										className="text-muted-foreground text-xs"
									>
										Trống
									</span>
								) : (
									<span
										aria-hidden="true"
										className="text-muted-foreground text-xs"
									>
										{section.groupCount} nhóm · {section.questionCount} câu
									</span>
								)}
							</div>
							{expanded &&
								section.groups.map((group) => (
									<div key={group.index} className="ml-3 flex flex-col gap-0.5">
										<div className="flex items-center gap-1.5">
											<button
												type="button"
												aria-current={
													isPartActive && active?.group === group.index
														? "true"
														: undefined
												}
												onClick={() =>
													onSelect({
														part: section.part,
														group: group.index,
													})
												}
												className={cn(
													"rounded px-1.5 py-1 text-left hover:bg-accent",
													isPartActive && active?.group === group.index
														? "bg-muted font-medium text-foreground"
														: "text-foreground",
												)}
											>
												{group.label}
											</button>
											<span
												aria-hidden="true"
												className="text-muted-foreground text-xs"
											>
												{group.typeLabel}
											</span>
										</div>
										{isPartActive &&
											active?.group === group.index &&
											group.questions.map((question) => (
												<button
													key={question.offset}
													type="button"
													aria-current={
														active.question === question.offset
															? "true"
															: undefined
													}
													onClick={() =>
														onSelect({
															part: section.part,
															group: group.index,
															question: question.offset,
														})
													}
													className={cn(
														"ml-3 flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent",
														active.question === question.offset
															? "bg-muted font-medium text-foreground"
															: "text-muted-foreground",
													)}
												>
													Câu {question.number}
													{!question.hasAnswer && (
														<span
															aria-hidden="true"
															className="inline-block size-2 rounded-full bg-amber-500"
														/>
													)}
												</button>
											))}
									</div>
								))}
						</div>
					);
				})}
		</nav>
	);
}
