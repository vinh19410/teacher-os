import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentSkill,
} from "@teacher-os/api/contracts";
import { useState } from "react";
import { TestPreviewPaper } from "@/components/assignment-tests/test-preview-paper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import {
	isTestPreviewRef,
	loadTestPreviewDraft,
	type TestPreviewDraft,
	type TestPreviewRefDraft,
} from "@/lib/assignment-test-preview-draft";
import { useData } from "@/lib/data-store";
import type { KernelHydratedData } from "@/lib/mock-data";

export const Route = createFileRoute("/_auth/assignments/tests/preview")({
	component: PreviewAssignmentTestRoute,
});

/**
 * Ref fallback (>1MB handoff): dựng lại draft từ snapshot repo — edit mode
 * ưu tiên test row theo id (header + parts + override đã lưu), slot map của
 * ref phủ phần còn lại (create mode không có test id).
 */
function resolveRefDraft(
	ref: TestPreviewRefDraft,
	data: KernelHydratedData,
): TestPreviewDraft | null {
	const testRow = ref.testId
		? (data.assignmentTests.find((row) => row.id === ref.testId) ?? null)
		: null;
	const skill = testRow?.skill ?? ref.test.skill;
	const slots = ASSIGNMENT_TEST_PRESETS[skill as AssignmentSkill]?.slots ?? [];
	if (slots.length === 0) return null;
	const promptById = new Map(data.assignmentPrompts.map((p) => [p.id, p]));
	const assignedByPart: Record<string, string> = { ...ref.assignedByPart };
	const overridesByPart: Record<string, number | null> = {};
	if (testRow)
		for (const part of testRow.parts) {
			if (part.promptId) assignedByPart[part.part] = part.promptId;
			overridesByPart[part.part] = part.qStartOverride ?? null;
		}
	return {
		schemaVersion: ref.schemaVersion,
		savedAt: ref.savedAt,
		test: testRow
			? {
					title: testRow.title,
					skill,
					timeLimitSeconds: testRow.timeLimitSeconds,
					collection: testRow.collection ?? ref.test.collection,
					testGroup: testRow.testGroup ?? ref.test.testGroup,
				}
			: ref.test,
		parts: slots.map((slot) => {
			const promptId = assignedByPart[slot.part] ?? null;
			const prompt = promptId ? promptById.get(promptId) : undefined;
			return {
				part: slot.part,
				label: slot.label,
				qStartOverride: overridesByPart[slot.part] ?? null,
				promptId,
				type: prompt?.type ?? "",
				title: prompt?.title ?? "",
				intro: prompt?.intro ?? "",
				passage: prompt?.passage ?? "",
				prompt: prompt?.prompt ?? "",
				audioName: prompt?.audioName ?? "",
				optionBank: prompt?.optionBank ?? [],
				items: prompt?.questions ?? [],
			};
		}),
	};
}

export function PreviewAssignmentTestRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	// Read without clearing: reloading the preview keeps working; the builder
	// saves a fresh handoff on every "Xem trước" click (mirror single-part).
	const [draft] = useState(() => {
		const handoff = loadTestPreviewDraft();
		if (!handoff) return null;
		return isTestPreviewRef(handoff) ? resolveRefDraft(handoff, data) : handoff;
	});

	if (!draft) {
		return (
			<div>
				<PageHead
					title="Xem trước bộ đề"
					lead="Trang này mô phỏng bộ đề đúng như học viên sẽ đọc khi làm. Bài làm ở đây không được lưu."
				/>
				<Card variant="white" className="mx-auto max-w-xl p-8 text-center">
					<h2 className="font-display font-semibold text-lg">
						Chưa có bộ đề nào để xem trước.
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Soạn bộ đề ở trang soạn full test rồi bấm Xem trước. Trang này không
						mở được trực tiếp bằng link.
					</p>
					<div className="mt-6 flex justify-center">
						<Button
							variant="secondary"
							onClick={() => navigate({ to: "/assignments/tests/new" })}
						>
							Mở trang soạn bộ đề
						</Button>
					</div>
				</Card>
			</div>
		);
	}
	return (
		<div className="max-w-3xl">
			<nav
				aria-label="Breadcrumb"
				className="mb-3 flex items-center gap-2 font-mono text-meta text-xs"
			>
				<Link
					to="/assignments"
					className="underline-offset-[3px] hover:text-fg hover:underline"
				>
					Bài tập
				</Link>
				<span aria-hidden="true">›</span>
				<span>Xem trước bộ đề</span>
			</nav>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<PageHead
					title="Xem trước bộ đề"
					lead="Đúng format đề thi — số câu chạy liên tục theo từng part. Không hiển thị đáp án."
				/>
				<Button variant="secondary" onClick={() => window.history.back()}>
					Quay lại soạn
				</Button>
			</div>
			<div className="mt-5">
				<TestPreviewPaper draft={draft} />
			</div>
		</div>
	);
}
