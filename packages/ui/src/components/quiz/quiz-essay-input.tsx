import { cn } from "@teacher-os/ui/lib/utils";
import type { ChangeEvent } from "react";

/**
 * Control chars không đóng góp gì cho bài viết nhưng có thể đẩy body vượt
 * cap 48KB → PATCH 413 tất định → drain throw → không nộp được (RT
 * red-team N + code-review F3): C0 (trừ \n \t \r) JSON-escape 6 byte/ký tự,
 * U+2028/U+2029 (line/paragraph separator, hay dính khi paste từ PDF/editor
 * khác) cũng escape 6 byte. Strip ở nguồn để lớp lỗi này không tồn tại.
 */
export function stripEssayControls(text: string): string {
	return Array.from(text)
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			// Giữ tab (09), LF (0A), CR (0D); strip C0 còn lại (00–1F) và
			// U+2028/U+2029.
			return (
				(code > 0x1f && code !== 0x2028 && code !== 0x2029) ||
				code === 0x09 ||
				code === 0x0a ||
				code === 0x0d
			);
		})
		.join("");
}

/**
 * Ô nhập bài viết Writing ở take screen (#304) — plain text, tắt spellcheck
 * như thi IELTS thật. Review mode thì readOnly, giữ nguyên xuống dòng.
 */
export function QuizEssayInput({
	value,
	onChange,
	readOnly = false,
	maxLength,
}: {
	value: string;
	onChange: (value: string) => void;
	readOnly?: boolean;
	maxLength: number;
}) {
	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		onChange(stripEssayControls(event.target.value));
	};
	return (
		<div className="flex flex-col gap-1.5">
			<label
				htmlFor="quiz-essay-input"
				className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]"
			>
				Bài viết của bạn
			</label>
			<textarea
				id="quiz-essay-input"
				value={value}
				onChange={handleChange}
				readOnly={readOnly}
				aria-readonly={readOnly || undefined}
				spellCheck={false}
				autoCorrect="off"
				autoCapitalize="off"
				maxLength={maxLength}
				placeholder="Viết bài của bạn ở đây…"
				className={cn(
					"min-h-[420px] w-full resize-y rounded-md rounded-md border border-input bg-transparent p-4 text-[15px] leading-[1.7] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40",
					readOnly && "border-transparent bg-muted",
				)}
			/>
		</div>
	);
}
