import type {
	PlacementError,
	PlacementErrorSkill,
} from "@teacher-os/api/placement-test-contracts";
import { useState } from "react";
import { cn } from "@/lib/cn";
import {
	buildPlacementHighlightSegments,
	circledErrorNumber,
	PLACEMENT_ERROR_STYLES,
	placementErrorCategoriesForSkill,
	resolvePlacementErrorStyle,
} from "@/lib/placement-test-helpers";

export function PlacementErrorLegend({
	skill,
}: {
	skill: PlacementErrorSkill;
}) {
	const categories = placementErrorCategoriesForSkill(skill);
	return (
		<ul
			aria-label="Chú giải loại lỗi"
			className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground text-xs"
		>
			{categories.map((cat) => {
				const style = PLACEMENT_ERROR_STYLES[cat.key];
				return (
					<li key={cat.key} className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className={cn(
								"inline-block h-3 w-4 rounded-sm border-b-2",
								style.swatchCls,
							)}
						/>
						<span>{cat.label}</span>
						<span className="sr-only">({style.lineLabel})</span>
					</li>
				);
			})}
		</ul>
	);
}

export function PlacementAnnotatedText({
	idPrefix,
	skill,
	text,
	errors,
	emptyLabel = "Không có nội dung.",
}: {
	idPrefix: string;
	skill: PlacementErrorSkill;
	text: string;
	errors: readonly PlacementError[];
	emptyLabel?: string;
}) {
	const [activeErrorId, setActiveErrorId] = useState<string | null>(null);
	const trimmed = text.trim();

	if (!trimmed && errors.length === 0) {
		return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
	}

	const { located, segments } = buildPlacementHighlightSegments(text, errors);

	return (
		<div className="space-y-4">
			{errors.length > 0 ? <PlacementErrorLegend skill={skill} /> : null}

			{trimmed ? (
				<div
					data-testid={`${idPrefix}-annotated-text`}
					className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-foreground text-sm leading-[1.8]"
				>
					{segments.map((seg) => {
						if (seg.kind === "text") {
							return (
								<span key={`${idPrefix}-txt-${seg.start}`}>{seg.text}</span>
							);
						}
						const style = resolvePlacementErrorStyle(seg.error.category, skill);
						const isActive = activeErrorId === seg.error.id;
						return (
							<mark
								key={`${idPrefix}-err-${seg.error.id}-${seg.start}`}
								id={`${idPrefix}-mark-${seg.number}`}
								className={cn(
									"rounded-sm px-0.5 text-foreground underline decoration-2 underline-offset-4",
									style.markCls,
									isActive && "ring-2 ring-primary",
								)}
							>
								{seg.text}
								<a
									href={`#${idPrefix}-card-${seg.number}`}
									onClick={() => setActiveErrorId(seg.error.id)}
									aria-label={`Lỗi ${seg.number}, ${style.label}. Xem giải thích`}
									className="ml-0.5 align-super font-mono text-[11px] text-foreground no-underline hover:underline"
								>
									{circledErrorNumber(seg.number)}
								</a>
							</mark>
						);
					})}
				</div>
			) : null}

			{located.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					Giáo viên không ghi nhận lỗi nào cần đánh dấu.
				</p>
			) : (
				<ol className="space-y-2.5" data-testid={`${idPrefix}-error-cards`}>
					{located.map((err, idx) => {
						const number = idx + 1;
						const style = resolvePlacementErrorStyle(err.category, skill);
						const isLocated = err.start !== null && err.end !== null;
						const isActive = activeErrorId === err.id;
						return (
							<li
								key={`${err.id}-${idx}`}
								id={`${idPrefix}-card-${number}`}
								className={cn(
									"rounded-lg border bg-card p-3 text-sm transition-colors",
									isActive && "border-primary ring-1 ring-primary",
									style.borderLeftCls,
								)}
							>
								<div className="flex flex-wrap items-center gap-2">
									{isLocated ? (
										<a
											href={`#${idPrefix}-mark-${number}`}
											onClick={() => setActiveErrorId(err.id)}
											aria-label={`Lỗi ${number}. Về đoạn trong bài`}
											className="inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs hover:bg-accent"
										>
											{circledErrorNumber(number)}
										</a>
									) : (
										<span className="inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
											{circledErrorNumber(number)}
										</span>
									)}
									<span
										className={cn(
											"inline-block size-2.5 shrink-0 rounded-full",
											style.dotCls,
										)}
										aria-hidden="true"
									/>
									<span className="font-semibold text-foreground text-xs">
										{style.label}
									</span>
								</div>

								<p className="mt-2 break-words text-sm">
									<span className="rounded bg-destructive-soft px-1.5 py-0.5 text-destructive line-through">
										{err.quote}
									</span>
									{err.correction ? (
										<>
											<span className="mx-1.5 text-muted-foreground">→</span>
											<span className="rounded bg-success-soft px-1.5 py-0.5 font-medium text-success">
												{err.correction}
											</span>
										</>
									) : null}
								</p>

								{err.explanation ? (
									<p className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
										{err.explanation}
									</p>
								) : null}
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}
