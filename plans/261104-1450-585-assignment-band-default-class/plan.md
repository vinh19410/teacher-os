---
title: "feat(assignments): band của bài mặc định theo lớp thay vì 7.0"
description: "Mở rộng danh sách band trong contract từ 5.0 đến 8.0 (step 0.5), truyền classId từ tab bài tập của lớp vào form /assignments/new và trích xuất band của lớp làm mặc định, fallback 7.0 khi không có lớp."
status: pending
priority: P3
effort: 1h30m
issue: 585
branch: feat/585-assignment-band-default-class
tags: [assignments, contracts, web, admin, classes]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Plan: Band của bài tập mặc định theo lớp thay vì 7.0

## Outcome
Khi giáo viên bấm "Thêm đề mới" từ tab Bài tập của một lớp (ví dụ lớp trình độ "Band 5.5"), form tạo bài `/assignments/new` tự động nhận ngữ cảnh lớp qua query param `classId` và đặt band mặc định là `5.5` thay vì đặt cứng `7.0`. Đồng thời, contract và giao diện composer được mở rộng để hỗ trợ các mức band từ `5.0` đến `8.0` (bước 0.5), cho phép chọn và lưu hợp lệ các mức band phổ biến trong chương trình học. Khi vào form trực tiếp từ Ngân hàng đề (không gắn lớp), form fallback an toàn về `7.0`.

## Architecture & Data Flow

```mermaid
flowchart TD
    A[Giáo viên ở /classes/:classId?tab=assignments] -->|Click Thêm đề mới| B[/assignments/new?classId=cls-1]
    C[Giáo viên ở /assignments Ngân hàng đề] -->|Click + Tạo bài tập| D[/assignments/new]
    B --> E{validateSearch classId?}
    D --> E
    E -->|Có classId| F[Tra cứu class trong data.classes]
    F --> G[bandFromClassLevel class.level, class.type]
    G -->|Parse được ví dụ 5.5| H[freshComposer band=5.5]
    G -->|Không parse được hoặc ngoài dải/TOEIC| I[freshComposer band=7.0 fallback]
    E -->|Không có classId| I
    H --> J[Draft store restore check: Draft thắng default]
    I --> J
    J --> K[PromptComposer hiển thị chip ASSIGNMENT_BANDS 5.0..8.0]
    K --> L[Lưu bài tập: API Validate z.enum ASSIGNMENT_BANDS]
```

## Decisions & Scope Lock (Advisor Supervised)
1. **Dải band mục tiêu:** Mở rộng thành `ASSIGNMENT_BANDS = ["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0"] as const`, `DEFAULT_ASSIGNMENT_BAND = "7.0"`.
   - Bao phủ toàn bộ các mức trình độ lớp hiện tại (5.5, 6.0, 6.5, 7.0, 7.5+).
   - Không dùng nhãn `"8.0+"` vì đây là band số thực của đề bài tập; `"Band 7.5+"` của lớp được parse chuẩn hóa về `"7.5"`.
   - Dải 5.0–8.0 gồm 7 chip vừa vặn trên 1 dòng chip filter, tránh làm loãng UI với 11 mức (4.0–9.0). Mở rộng thêm sau này là backward-compatible.
2. **Truyền context qua URL:** Dùng TanStack Router `validateSearch` nhận `{ classId?: string }` tại `apps/web/src/routes/_auth/assignments/new.tsx`.
   - Nút "Thêm đề mới" tại `apps/web/src/components/classes/class-assignments-tab.tsx` truyền `<Link to="/assignments/new" search={{ classId: classGroup.id }}>`.
   - Không lưu `classId` vào prompt vì đề trong ngân hàng đề là độc lập lớp học (prompt-bank model).
3. **Trích xuất band từ trình độ lớp:** Thêm pure helper `bandFromClassLevel(level: string, classType?: string): AssignmentBand | null` có khả năng:
   - Loại bỏ các lớp TOEIC hoặc điểm 3 chữ số (`/\b\d{3,}\b/`).
   - Xử lý dải điểm `"IELTS 5.0–6.0"` bằng cách lấy mốc mục tiêu `"6.0"`.
   - Bỏ qua các tiền tố năm/khoá/lớp (`"Lớp 12 - Band 7.0"` -> `"7.0"`).
   - Chuẩn hóa 1 chữ số thập phân (`"6"` -> `"6.0"`).
4. **Fallback và tính tương thích:**
   - Không có `classId` hoặc không parse được level: fallback về `"7.0"`.
   - Giữ nguyên cột `band: text("band").notNull().default("7.0")` trong DB, không cần DB migration.
   - Nháp cục bộ (preview draft / autosave draft) nếu có nội dung sẽ ghi đè lên default của composer (giữ nguyên trải nghiệm an toàn dữ liệu). Khi bỏ qua nháp (`discardDraftBanner`) hoặc tạo bài khác, form reset về đúng band của lớp.
5. **Đồng bộ toàn diện:** Cập nhật cả `packages/api` (contract, schema), `apps/server` (cập nhật test `kernel.test.ts:5119` từ band 8.0 sang 8.5), `apps/web` (new route, prompt-composer, class-assignments-tab), và `apps/admin` (part-form `BAND_OPTIONS`).

## Phases

| # | Phase | Trạng thái | Ước lượng |
|---|---|---|---|
| 1 | [API Contracts và Admin Library Alignment](phase-01-contracts-and-admin-alignment.md) | pending | 25m |
| 2 | [Class Context, Level Parsing và Form Default](phase-02-class-context-and-composer-default.md) | pending | 35m |
| 3 | [Integration, Regression Verification và Quality Gates](phase-03-integration-and-verification.md) | pending | 30m |

## Acceptance Criteria
- [ ] `packages/api/src/contracts.ts` xuất `ASSIGNMENT_BANDS`, `AssignmentBand`, `DEFAULT_ASSIGNMENT_BAND`.
- [ ] Schema `assignmentPromptBaseSchema`, `libraryExerciseBaseSchema`, và `libraryPartUpsertSchema` validate theo `ASSIGNMENT_BANDS`.
- [ ] `apps/server/src/kernel.test.ts` cập nhật test rejection từ band "8.0" sang "8.5".
- [ ] `apps/admin/src/components/library/part-form.tsx` dùng `ASSIGNMENT_BANDS` cho `BAND_OPTIONS`.
- [ ] Helper `bandFromClassLevel` trích xuất chính xác band từ các chuỗi: `"Band 5.5"` -> `"5.5"`, `"IELTS 5.5"` -> `"5.5"`, `"5.5"` -> `"5.5"`, `"Band 7.5+"` -> `"7.5"`, `"Band 5.0"` -> `"5.0"`, `"IELTS 5.0–6.0"` -> `"6.0"`, `"TOEIC 550"` -> `null`, `"Unknown"` -> `null`, `""` -> `null`.
- [ ] Route `/_auth/assignments/new` khai báo `validateSearch` nhận `{ classId?: string }`.
- [ ] Link "Thêm đề mới" trên tab bài tập lớp học truyền search param `classId`.
- [ ] Khi vào `/assignments/new?classId=<id-lớp-5.5>`, form khởi tạo với chip band 5.5 được chọn.
- [ ] Khi reset form hoặc chọn "Tạo bài khác", band giữ nguyên theo lớp ban đầu (nếu có context lớp).
- [ ] Khi vào `/assignments/new` không có classId hoặc classId không hợp lệ, form fallback về band 7.0 không lỗi.
- [ ] Đề nháp đã lưu trước đó vẫn khôi phục chính xác, không bị đè bởi class default. Khi dismiss draft, form reset về band lớp.
- [ ] Toàn bộ unit tests tại `packages/api`, `apps/server`, `apps/admin`, `apps/web` đều pass; `pnpm check`, `pnpm check-types` pass sạch sẽ.

## Red Team Review
Reviewers: Assumption Destroyer, Failure Mode Analyst, Security Adversary.
Findings adjudicated:
1. **Server test failure on 8.0 (Failure Mode Analyst):** `apps/server/src/kernel.test.ts:5119` asserts HTTP 400 on `band: "8.0"`. Accepted; added to Phase 1 Task 1.2 to update to `"8.5"`.
2. **Regex parser vulnerability (All 3 Reviewers):** Simple regex `/(\d(?:\.\d)?)/` matches prefixes like `"TOEIC 550"` -> `"5.0"`, prefixes in `"Lớp 12 - Band 7.0"` -> `"1.0"`, and misses target band in ranges (`"5.0-6.0"`). Accepted; updated `bandFromClassLevel` with multi-step range, keyword, and boundary checks.
3. **Draft lifecycle and reset consistency (Assumption Destroyer & Security Adversary):** Handled `discardDraftBanner` and safe type narrowing for boundary payloads.

### Whole-Plan Consistency Sweep
- All phase files match the updated `bandFromClassLevel` signature and edge cases.
- `apps/server/src/kernel.test.ts` is explicitly listed in Phase 1 and acceptance criteria.
- No dangling references to the old 4-value band enum remain.
