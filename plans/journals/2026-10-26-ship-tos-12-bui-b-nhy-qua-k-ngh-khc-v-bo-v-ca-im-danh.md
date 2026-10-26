---
title: Ship TOS-12 buổi bù nhảy qua kỳ nghỉ khác và bảo vệ ca đã điểm danh
date: 2026-10-26
summary: "Ship issue #446: preview trả skippedHolidays kèm tên kỳ nghỉ (null = kỳ đang tạo), ghi chú (*) dưới bảng xem trước, nhãn 'Giữ nguyên — Đã diễn ra' cho buổi đã điểm danh, test route + E2E AC-002 ngày động; PR vào develop (beta)"
---

# Ship TOS-12 buổi bù nhảy qua kỳ nghỉ khác và bảo vệ ca đã điểm danh

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #446 (Jira TOS-12) theo plan `plans/261026-2018-tos-12-holiday-skip-and-kept-completed/` trên nhánh `ai-handle-issue-446` (base `develop`), sau khi blocker #445 gỡ (PR #457 merge 16:04Z). 3 phase: contract `skippedHolidays: {date, holidayName | null}[]` (planner + zod + loader + `enrollment-activation.ts`), bảng xem trước (`*` sau ngày bù, khối ghi chú theo D3 kèm tên lớp, nhãn D4 "Giữ nguyên — Đã diễn ra", tiêu đề "N buổi sẽ được xử lý" chỉ đếm shift), E2E `holiday-skip-and-kept-completed.spec.ts` 4 test.

## Decision
- Red-team Kongming (GO có điều kiện) chặn 2 kịch bản E2E không chạy được và 1 file sót:
  - **C1:** server chặn điểm danh buổi tương lai + apply chặn khoảng quá khứ → scenario "buổi đã điểm danh" phải dùng buổi HÔM NAY.
  - **C2:** UI khóa xác nhận khi shifts rỗng → kỳ nghỉ phủ ngày bù tự nhiên phải trúng buổi thật của một lớp phụ mới tạo được qua UI.
  - **C2b:** `enrollment-activation.ts` là nơi gọi planner thứ hai — `loadClassHolidays` lấy thêm cột `name`, dựng Map date→tên.
  - **I2:** loader sắp `createdAt ASC, id`, kỳ khai báo trước thắng khi chồng ngày; tên kỳ đã lưu thắng tên draft trong planner.
  - **I3:** ghi chú D3 kèm tên lớp, gom ngày liền kề theo kỳ nghỉ.
  - **Hash/key:** `planHashOf` không gồm tên (tên không đổi dữ liệu ghi DB; previewKey cố ý bỏ `name` theo quyết định TOS-11) → `holidayName: null` cho ngày thuộc kỳ đang tạo, client điền tên từ form qua prop `draftName`.
- Local review fresh-context (reviewer): correct + đạt spec; 1 Minor F1 — fixture test AC-002 dùng Friday thay Saturday cho lịch T3&T7 → sửa `utcDay2=6`, assert giữ nguyên giá trị.
- Lỗi thật khi viết E2E: arithmetic buổi T3&T7 — lớp từ s0 có buổi s0, s0+4, s0+7, s0+11 (không phải s0+3/s0+10); ngày bù sau khi nhảy qua M (T3) là T7 = s0+18. Server đúng, spec sai — sửa spec, không đụng code.

## Verification
- `pnpm check` exit 0; `pnpm check-types` 8/8 package.
- Unit: api 304 pass (planner + contracts), server 884 pass (3 test route mới: skip DB-stored có tên + apply khớp preview, scope classes chỉ lớp A không làm lớp B nhảy, buổi trộn completed+upcoming apply giữ status + không sinh shift), web 1599 pass (8 case holiday-modal: `*`, ghi chú, nhãn D4, tiêu đề đếm 1 buổi, draftName).
- E2E Playwright: spec mới 4/4 (2 scenario 1440×900 + rerun scenario 2 ở 768×1024 và 375×812), regression TOS-11 `holiday-shift.spec.ts` 3/3.
- `pnpm design:compare`: 418 ảnh, 0 lỗi. Screenshots 3 viewport × 2 trạng thái trong `plans/261026-2018-tos-12-holiday-skip-and-kept-completed/screenshots/`.

## Open
- **TOS-13:** phương thức "Hủy buổi" + hoàn tác; nhãn "Giữ nguyên — Đã diễn ra" đã áp cho component dùng chung.
- **TOS-14:** xem Tháng/Ngày; cộng dồn buổi bù vào schedule-conflicts.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
