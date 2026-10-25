import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { cn } from "@teacher-os/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Layout reading split-pane (#286): bài đọc trái, bài làm phải — mỗi pane
 * cuộn độc lập ở viewport ≥ lg; dưới lg xếp chồng 1 cột như cũ (KISS — không
 * tab, không collapse). Dùng chung student/admin (#433) — dời từ app student.
 *
 * Chiều cao (red-team RT13/C-kongming): mặc định wrapper khoá
 * `calc(100svh - 3.5rem)` (trừ runtime header h-14 của take screen).
 * `fillParent` thay bằng `h-full` — parent co giãn (overlay preview bọc
 * `flex-1 min-h-0`) quyết chiều cao, banner động không làm tràn pane.
 * Grid 2 pane chiếm phần còn lại, navigator là anh em của grid nên neo đáy
 * toàn layout và trải cả hai pane (không nằm trong pane bài làm).
 *
 * Điều kiện áp dụng do caller quyết (`skill === "reading"` && passage không
 * rỗng) — component chỉ dựng khung, không đọc detail.
 */
export function QuizReadingSplitLayout({
	passage,
	children,
	navigator,
	fillParent = false,
}: {
	/** Rich-text HTML của đoạn đọc (đã kiểm tra không rỗng). */
	passage: string;
	/** Nội dung pane bài làm (QuizPaper đã ẩn passage). */
	children: ReactNode;
	/** Navigator (take/review) — neo đáy layout, trải full chiều ngang. */
	navigator: ReactNode;
	/** Chiếm đúng chiều cao parent thay vì calc từ viewport (#433 overlay). */
	fillParent?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col lg:flex-none",
				fillParent ? "lg:h-full lg:min-h-0" : "lg:h-[calc(100svh-3.5rem)]",
			)}
		>
			<div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
				<section
					aria-label="Bài đọc"
					data-testid="reading-passage-pane"
					className="border-border border-b px-4 py-6 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
				>
					<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
						Bài đọc
					</p>
					<RichTextBody
						text={passage}
						className="mt-2 text-sm leading-[1.85]"
					/>
				</section>
				<section
					aria-label="Bài làm"
					className="flex flex-1 flex-col lg:min-h-0"
				>
					<div
						data-testid="reading-work-pane"
						className="flex-1 px-4 py-6 lg:min-h-0 lg:overflow-y-auto"
					>
						<p className="mb-4 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
							Bài làm
						</p>
						{children}
					</div>
				</section>
			</div>
			{navigator}
		</div>
	);
}

/** Điều kiện split-pane: đề reading có passage thật (không rỗng sau trim). */
export function isReadingSplitPane(skill: string, passage: string): boolean {
	return skill === "reading" && !isEmptyRichText(passage);
}
