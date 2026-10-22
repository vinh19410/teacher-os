import type {
	LibraryPartIssue,
	LibrarySkill,
} from "@teacher-os/api/library-contracts";
import {
	Button,
	buttonVariants,
} from "@teacher-os/ui/components/web-kit/button";
import { useState } from "react";
import { libraryIssuesOf } from "@/lib/repos/library";
import { formatIssue } from "./part-issues";

/**
 * Thanh trạng thái xuất bản của trang edit (phase 6): hiển thị Draft/Ready,
 * nút Xuất bản (PATCH ready — hiển thị danh sách lý do nếu bị chặn) và
 * Hạ về nháp. Lý do chặn được kiểm tra TRƯỚC phía client bằng
 * `validateTestReady` (một nguồn sự thật với server); 400 `NOT_READY` từ
 * server vẫn được bắt và render cùng một cách.
 */

export function PublishBar({
	status,
	issues,
	busy,
	skill,
	onPublish,
	onUnpublish,
}: {
	status: "draft" | "ready";
	/** Lý do chặn ready tính từ dữ liệu form hiện tại (validateTestReady). */
	issues: LibraryPartIssue[];
	busy: boolean;
	skill: LibrarySkill;
	onPublish: () => Promise<unknown>;
	onUnpublish: () => Promise<unknown>;
}) {
	const [shownIssues, setShownIssues] = useState<LibraryPartIssue[] | null>(
		null,
	);
	const [live, setLive] = useState("");

	const handlePublish = async () => {
		setShownIssues(null);
		if (issues.length > 0) {
			// Client chặn trước bằng cùng luật của server — không cần 400.
			setShownIssues(issues);
			setLive("Chưa đủ điều kiện xuất bản — xem danh sách lý do.");
			return;
		}
		try {
			await onPublish();
			setLive("Đã xuất bản bộ đề.");
		} catch (error) {
			const serverIssues = libraryIssuesOf(error);
			setShownIssues(serverIssues ?? []);
			setLive("Chưa xuất bản được bộ đề.");
		}
	};

	const handleUnpublish = async () => {
		setShownIssues(null);
		try {
			await onUnpublish();
			setLive("Đã hạ về bản nháp.");
		} catch {
			setLive("Chưa hạ được về bản nháp.");
		}
	};

	return (
		<div className="flex flex-col gap-2 rounded-md border bg-card p-3">
			<div className="flex flex-wrap items-center gap-3">
				<p className="flex items-center gap-2 font-medium text-sm">
					Trạng thái:{" "}
					<span
						className={
							status === "ready"
								? "rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-700 text-xs"
								: "rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground text-xs"
						}
					>
						{status === "ready" ? "Đã xuất bản" : "Nháp"}
					</span>
				</p>
				<Button
					disabled={busy || status === "ready"}
					onClick={() => void handlePublish()}
				>
					{busy ? "Đang xử lý…" : "Xuất bản"}
				</Button>
				<button
					type="button"
					disabled={busy || status === "draft"}
					onClick={() => void handleUnpublish()}
					className={buttonVariants({
						variant: "outline",
						className:
							status === "draft" ? "pointer-events-none opacity-50" : "",
					})}
				>
					Hạ về nháp
				</button>
				<p
					aria-live="polite"
					role="status"
					className="text-muted-foreground text-xs"
				>
					{live}
				</p>
			</div>
			<p className="text-muted-foreground text-xs">
				Xuất bản yêu cầu đủ part theo cấu trúc đề và mỗi part đạt điều kiện
				(passage/audio, câu hỏi, ghim ảnh…). Đề đã xuất bản vẫn sửa được nội
				dung, nhưng phải hạ về nháp để xóa part/audio.
			</p>
			{shownIssues && shownIssues.length > 0 && (
				<div
					role="alert"
					className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
				>
					<p className="font-medium text-destructive text-sm">
						Chưa xuất bản được — {shownIssues.length} lý do:
					</p>
					<ul className="mt-1 list-disc pl-5 text-destructive text-xs">
						{shownIssues.map((issue) => (
							<li key={`${issue.path}:${issue.message}`}>
								{formatIssue(issue, skill)}
							</li>
						))}
					</ul>
				</div>
			)}
			{shownIssues && shownIssues.length === 0 && (
				<p role="alert" className="text-destructive text-xs">
					Chưa xuất bản được — hãy thử lại.
				</p>
			)}
		</div>
	);
}
