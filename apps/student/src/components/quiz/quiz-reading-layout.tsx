import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import type { ReactNode } from "react";

/**
 * Layout reading split-pane (#286): bài đọc trái, bài làm phải — mỗi pane
 * cuộn độc lập ở viewport ≥ lg; dưới lg xếp chồng 1 cột như cũ (KISS — không
 * tab, không collapse). Navigator đặt TRONG pane bài làm để không ăn chiều
 * cao pane đọc; mỗi pane tự khoá chiều cao calc(100svh - 3.5rem) (trừ
 * runtime header h-14) và cuộn nội bộ riêng.
 *
 * Điều kiện áp dụng do caller quyết (`skill === "reading"` && passage không
 * rỗng) — component chỉ dựng khung, không đọc detail.
 */
export function QuizReadingSplitLayout({
	passage,
	children,
	navigator,
}: {
	/** Rich-text HTML của đoạn đọc (đã kiểm tra không rỗng). */
	passage: string;
	/** Nội dung pane bài làm (QuizPaper đã ẩn passage). */
	children: ReactNode;
	/** Navigator (take/review) — neo đáy pane bài làm. */
	navigator: ReactNode;
}) {
	return (
		<div className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
			<section
				aria-label="Bài đọc"
				data-testid="reading-passage-pane"
				className="border-line border-b px-4 py-6 lg:h-[calc(100svh-3.5rem)] lg:overflow-y-auto lg:border-r lg:border-b-0"
			>
				<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
					Bài đọc
				</p>
				<RichTextBody text={passage} className="mt-2 text-sm leading-[1.55]" />
			</section>
			<section
				aria-label="Bài làm"
				className="flex flex-1 flex-col lg:h-[calc(100svh-3.5rem)]"
			>
				<div
					data-testid="reading-work-pane"
					className="flex-1 px-4 py-6 lg:min-h-0 lg:overflow-y-auto"
				>
					<p className="mb-4 font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
						Bài làm
					</p>
					{children}
				</div>
				{navigator}
			</section>
		</div>
	);
}

/** Điều kiện split-pane: đề reading có passage thật (không rỗng sau trim). */
export function isReadingSplitPane(skill: string, passage: string): boolean {
	return skill === "reading" && !isEmptyRichText(passage);
}
