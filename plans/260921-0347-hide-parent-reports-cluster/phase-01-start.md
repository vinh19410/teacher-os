---
title: "Phase 1: Ẩn điều hướng và điểm vào UI của cụm Phụ huynh Báo cáo"
status: todo
phase: 1
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Ẩn điều hướng và điểm vào UI của cụm Phụ huynh Báo cáo

## Overview

Tạo module feature flag `features.ts` và gate toàn bộ điểm vào UI tĩnh: section sidebar, title app-shell, nút/modal ở trang học viên, copy + Card "Mẫu báo cáo tuần" trong Cài đặt. Cập nhật `settings.test.tsx` theo trạng thái flag tắt.

## Requirements

- [ ] Tạo `apps/web/src/lib/features.ts` với `export const PARENT_REPORTS_ENABLED = false;`
- [ ] `sidebar.tsx:145-167`: ẩn section "Phụ huynh" bằng conditional spread
- [ ] `app-shell.tsx:24`: ẩn entry `"/_auth/reports"` trong `routeTitles` bằng conditional spread
- [ ] `$studentId.tsx:116-118`: ẩn nút "Tạo báo cáo"; `:272-278`: ẩn `CreateReportModal`; giữ nút "Nhắn Zalo" và card "Phụ huynh"
- [ ] `settings.tsx:168-171`: bỏ "· Báo cáo phụ huynh" khi flag tắt; `:288-297`: ẩn Card "Mẫu báo cáo tuần"; payload save giữ nguyên `tplReport`
- [ ] `settings.test.tsx:58-68`: `toBe(3)` → `toBe(2)` + assert không còn "Mẫu báo cáo tuần"

## Implementation Steps

1. Tạo file mới `apps/web/src/lib/features.ts` (nguyên vẹn):

```ts
/**
 * Static feature flags for deferred feature clusters.
 * Flip a constant to re-enable a hidden cluster; no runtime toggle needed.
 */
export const PARENT_REPORTS_ENABLED = false;
```

2. `apps/web/src/components/layout/sidebar.tsx` — thêm import flag sau `cn` (giữ thứ tự import hiện tại dòng 1-12), rồi bọc section "Phụ huynh" (dòng 145-167) bằng conditional spread. Vẫn giữ nguyên object bên trong:

```ts
import { PARENT_REPORTS_ENABLED } from "@/lib/features";
```

```ts
	...(PARENT_REPORTS_ENABLED
		? [
				{
					label: "Phụ huynh",
					items: [
						{
							to: "/reports",
							label: "Báo cáo",
							icon: (
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
									{/* ...giữ nguyên 3 path + 3 rect như dòng 159-162 hiện tại... */}
								</svg>
							),
						},
					],
				},
			]
		: []),
```

	Đặt spread này tại đúng vị trí cũ (giữa section "Lớp học" kết thúc dòng 144 và section "Hệ thống" bắt đầu dòng 168) để thứ tự khôi phục sau này không đổi.

3. `apps/web/src/components/layout/app-shell.tsx` — thêm import flag (sau `sidebar-prefs`, theo thứ tự `@/lib/*` hiện có), rồi gate entry dòng 24:

```ts
import { PARENT_REPORTS_ENABLED } from "@/lib/features";
```

```ts
	"/_auth/syllabus/$syllabusId": "Giáo trình",
	...(PARENT_REPORTS_ENABLED
		? { "/_auth/reports": "Báo cáo phụ huynh" }
		: {}),
	"/_auth/profile": "Hồ sơ",
```

4. `apps/web/src/routes/_auth/students/$studentId.tsx` — thêm import flag vào nhóm `@/lib/*` (sau `format-invoice` dòng 14). Gate nút "Tạo báo cáo" (giữ nguyên nút "Nhắn Zalo" dòng 107-115):

```tsx
					<Button
						variant="secondary"
						size="sm"
						onClick={() =>
							window.open(`https://zalo.me/${student.zalo}`, "_blank")
						}
					>
						Nhắn Zalo
					</Button>
					{PARENT_REPORTS_ENABLED && (
						<Button size="sm" onClick={() => setReportOpen(true)}>
							Tạo báo cáo
						</Button>
					)}
```

	Rồi gate modal ở cuối component (dòng 272-278):

```tsx
			{PARENT_REPORTS_ENABLED && (
				<CreateReportModal
					key={student.id}
					open={reportOpen}
					onClose={() => setReportOpen(false)}
					defaultStudentId={student.id}
				/>
			)}
```

	KHÔNG đụng state `reportOpen` (dòng 69) và card "Phụ huynh" (dòng 168-190). Giữ nguyên import `CreateReportModal` (dòng 3) — khi flag tắt vẫn được tham chiếu trong JSX nên không lỗi unused import.

5. `apps/web/src/routes/_auth/settings.tsx` — thêm import flag vào nhóm `@/lib/*` (sau `repos/settings` dòng 21-26). Sửa copy marketing dòng 168-171:

```tsx
							<p className="text-muted-fg text-sm">
								{[
									"Không giới hạn học viên",
									"Zalo OA",
									...(PARENT_REPORTS_ENABLED ? ["Báo cáo phụ huynh"] : []),
									"Xuất hóa đơn điện tử.",
								].join(" · ")}
							</p>
```

	Trong `TemplatesTab` (export dòng 252+), gate Card "Mẫu báo cáo tuần" dòng 288-297:

```tsx
				{PARENT_REPORTS_ENABLED && (
					<Card variant="white">
						<SectionLabel>Mẫu báo cáo tuần</SectionLabel>
						<Textarea
							value={current.tplReport}
							onChange={(e) =>
								onChange?.((prev) => ({ ...prev, tplReport: e.target.value }))
							}
							className="min-h-25"
						/>
					</Card>
				)}
```

	KHÔNG đổi payload save có `tplReport` ở dòng 220-224.

6. `apps/web/src/routes/_auth/settings.test.tsx` — cập nhật test "enables every Zalo template textarea..." (dòng 58-68) cho trạng thái flag tắt:

```tsx
	it("enables every Zalo template textarea without the not-open note", () => {
		const html = renderToStaticMarkup(<TemplatesTab onSave={() => {}} />);
		const areas = html.match(/<textarea[^>]*>/g) ?? [];
		expect(areas.length).toBe(2);
		for (const area of areas) {
			expect(area).not.toMatch(/\sdisabled=/);
		}
		expect(html).not.toContain("Chưa mở — sẽ lưu khi tính năng ra mắt.");
		expect(html).not.toContain("Mẫu báo cáo tuần");
		expect(html).toContain("{{student_name}}");
		expect(html).toContain("Lưu mẫu tin");
	});
```

## Todo

- [ ] Tạo `apps/web/src/lib/features.ts`
- [ ] Gate section sidebar "Phụ huynh" (sidebar.tsx:145-167)
- [ ] Gate title `"/_auth/reports"` (app-shell.tsx:24)
- [ ] Gate nút "Tạo báo cáo" + modal ($studentId.tsx:116-118, 272-278)
- [ ] Gate copy + Card "Mẫu báo cáo tuần" (settings.tsx:168-171, 288-297)
- [ ] Cập nhật settings.test.tsx (dòng 58-68)

## Success Criteria

- Sidebar không render section "Phụ huynh"; tab Mẫu tin chỉ còn 2 textarea khi flag tắt.
- `pnpm -C apps/web test` pass (settings.test đã cập nhật, các test khác không đổi).
- `pnpm -C apps/web check-types` pass; `pnpm check` (biome) không diff formatting.

## Risk Notes

- Quên update `settings.test.tsx` sang `toBe(2)` → vitest đỏ ngay (test assert số lượng textarea).
- Dùng JSX whitespace thay vì join cho copy marketing → chuỗi render có khoảng trắng thừa/dư "·"; dùng `.join(" · ")` như snippet.
- Đừng "dọn" import `CreateReportModal` hay state `reportOpen` — vẫn được dùng trong JSX gate, xóa sẽ vỡ khi bật lại.
- Chỉ gate đúng các dòng đã liệt kê; comment bank (grade-modal.tsx:116) và chuông notif KHÔNG thuộc cụm này, ẩn sẽ vỡ tính năng đang dùng.
