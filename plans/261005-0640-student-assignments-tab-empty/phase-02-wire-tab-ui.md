---
phase: 2
title: "Nối tab Bài tập vào selector + verify UI"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Nối tab Bài tập vào selector + verify UI

## Goal

Tab "Bài tập" ở `students/$studentId` render `studentAssignmentRows` (phase 1) thay vì `data.assignments`, tái dùng `StatusTag`/`fmtDue`/`studentSubmissionStatus` cùng ngôn ngữ UI với tab Bài tập của lớp, và pass toàn bộ gate local.

## Context Links

- Tab hiện tại: `apps/web/src/routes/_auth/students/$studentId.tsx:78` (điểm chết) và `:247–283` (render tab assign)
- UI mẫu: `apps/web/src/components/classes/class-assignments-tab.tsx:719–746` (cách render status per-student)
- Token & quy tắc: `DESIGN.md`, checklist `REVIEW.md` (bắt buộc đọc trước khi sửa UI theo `AGENTS.md`)

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx`

## Key Insights

- `StatusTag` (`@/components/assignments/status-tag`) + `studentSubmissionStatus(target, due, todayISO)` cho label/tone chuẩn: Đã nộp (ok) / Đã nộp · trễ hạn (warn) / Chưa nộp · quá hạn (danger) / Chưa nộp (neutral).
- `fmtDue(iso)` chuyển `yyyy-mm-dd` → `dd/mm/yyyy`; tab hiện đang hiển thị raw ISO ở cột Hạn — nâng cấp luôn cho cả grading row (display-only).
- `averageBand` đã được import sẵn trong file; giữ nguyên logic Band cho grading row.

## Requirements

- Giữ nguyên 5 cột: Bài tập · Loại · Hạn · Band · Trạng thái.
- Class row: title **plain text** (không link — `/assignments/$assignmentId` không resolve được class row), tên lớp là dòng phụ muted dưới title (chỉ khi `className !== ""`); Loại = `typeLabel ?? "—"`; Hạn = `fmtDue(row.due)` (class row luôn ISO); Band = "—"; Trạng thái = `StatusTag` từ `studentSubmissionStatus({ submittedAt }, due, todayVN)`.
- Grading row: giữ nguyên hành vi cũ **trừ thứ tự (sort theo `due` chung list — selector đã xếp `due` rỗng/không-ISO xuống cuối) và format cột Hạn (`fmtDue`, display-only)** — Link tới `/assignments/$assignmentId`, Band từ `averageBand(scores)`, text trạng thái "Đã chấm"/"Trễ"/"Chưa nộp"; Loại = `typeLabel ?? "—"` (selector đã normalize `""` → null); Hạn = `row.due === "" ? "—" : fmtDue(row.due)`.
- Empty state mặc định của `DataTable` ("Chưa có dữ liệu.") giữ nguyên cho học viên chưa có bài.

## Implementation Steps

1. Đọc `DESIGN.md` + `REVIEW.md` (quy ước token màu/tag/focus).
2. Trong `$studentId.tsx`: thay dòng 78 bằng `const assignments = studentAssignmentRows(data, studentId);` và tính `const todayVN = vietnamTodayISO();`; import `StatusTag`, `studentSubmissionStatus`, `fmtDue`, `vietnamTodayISO`, `studentAssignmentRows`. Kiểm tra `assignments` không còn bị dùng ở chỗ khác trong file (hiện chỉ tab assign dùng).
3. Render tab assign theo nhánh `row.kind` như Requirements; `key` cell dùng `row.key`.
4. Chạy gate local (Verification bên dưới).
5. Verify thủ công kèm screenshot 3 viewport. Fixture **tái lập được**: tạo student + class + enrollment qua UI seed flow, giao 1 đề từ trang lớp (email `vinh1021308@gmail.com` trong bản nháp đầu chỉ tồn tại ở local DB của tác giả — không dùng làm fixture). Kịch bản: (a) học viên đã được giao bài → row hiện đúng title/skill/hạn/trạng thái "Chưa nộp"; (b) submit bài từ phía student portal → **reload trang teacher** rồi mới assert "Đã nộp" — snapshot `['kernel']` có `staleTime: Infinity` + `refetchOnWindowFocus/Reconnect: false` (`query-client.ts:11–25`), KHÔNG tự refresh khi student submit ở app/session khác; (c) học viên chưa có bài → empty state.

## Todo

- [x] Thay nguồn dữ liệu tab + imports.
- [x] Render 2 nhánh kind đúng requirement (plain text vs link, StatusTag vs text cũ).
- [x] `pnpm check` pass.
- [x] `pnpm check-types` pass.
- [x] `pnpm --filter web test` pass.
- [x] Verify 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; screenshot đính PR.

## Verification

```bash
pnpm check
pnpm check-types
pnpm --filter web test
```

- Scenario thủ công: giao bài từ trang lớp cho học viên test → mở chi tiết học viên → tab Bài tập thấy row "Chưa nộp"; submit từ student portal → **reload trang teacher** (snapshot chỉ refresh qua command bus write phía giáo viên hoặc explicit retry) → trạng thái "Đã nộp".

## Success Criteria

- Tab Bài tập hiện đủ bài đã giao qua flow #208 kèm trạng thái nộp; grading row (nếu có) giữ hành vi hiển thị cũ trừ thứ tự sort và format cột Hạn.
- Toàn bộ gate local xanh; UI đạt checklist `REVIEW.md` ở 3 viewport.

## Risk Assessment

- Snapshot stale: nếu giáo viên giao bài ở tab khác rồi quay lại, dữ liệu mới chỉ hiện sau refresh snapshot — cùng hành vi với tab lớp hiện tại, không phải regression của fix này.
- Trạng thái nộp chỉ tươi sau refresh tường minh: student submit ở app khác không tự reflect trên teacher tab (`staleTime: Infinity`, không polling — `query-client.ts:11–25`) — giới hạn đã biết của kiến trúc snapshot, không phải regression của fix này; kịch bản verify ở step 5 đã tính đến điều này.
- Regress tab khác: `assignments` biến cục bộ chỉ dùng trong tab assign; các tab khác đọc `lessons`/`invoices` riêng.

## Security Considerations

- Không thêm route/endpoint; dữ liệu đã server-scope theo org. Góp phần thu hẹp khoảng trống "giáo viên không nhìn thấy trạng thái học viên" được ghi nhận trong báo cáo scenario (plans/261002-1409-scenario-test-cases/report.md).

## Next Steps

- Tạo PR vào `develop` với screenshot; CI không chạy cho target `develop` nên gate local là chốt cuối (theo `AGENTS.md`).
