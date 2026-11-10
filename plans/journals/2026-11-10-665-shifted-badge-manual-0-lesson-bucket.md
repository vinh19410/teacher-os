---
title: 665-shifted-badge-manual-0-lesson-bucket
date: 2026-11-10
---

# 665-shifted-badge-manual-0-lesson-bucket

Badge «Nghỉ lễ — Đã dời lịch» cho bucket manual 0 lesson có shift row (#665) — phần UI minh bạch tách từ #662. Server không đụng: kernel snapshot đã có `holidayShifts` org-wide từ TOS-11 và web đã parse sẵn (`repos/kernel.ts:383`); fix thuần plumbing — route `$classId.tsx` thread `data.holidayShifts` vào `ClassSessionsSection` qua prop optional mới, derive riêng `shiftedAway = rows.length === 0 && makeupDateForShift({holidayShifts}, cls.id, dateISO) !== null` (không mở `sessionStatus` — 11 call sites / 6 files), chèn 1 nhánh ternary sau nhánh `holiday` tái dùng đúng badge warn có sẵn. TDD: Test A đỏ đúng 1 fail trước khi viết code; B/C/D/E pin regression (badge cũ qua status holiday + chống double-badge bằng `getAllByText`, precedence «Dự kiến» của projection, filter `classId` chống badge chéo, deploy-skew thiếu `holidayShifts`). Bẫy fixture: `days` trong schedule lưu là **0-6 Mon-first** (`parseStoredSchedule`) — viết `days:[1]` thành ra thứ Ba khiến projection lệch 1 ngày; Test C bắt được ngay ở bước đỏ. Red-team plan bắt 10 findings (2 High: sai nguồn import `KernelHolidayShiftRow` — phải từ `@teacher-os/api/contracts`, và `$classId` không nháy trong Verify command bị shell expand rỗng), 7 áp vào plan trước khi code. Kongming plan-gate GO + điều kiện rebase (ff lên 7b749c3f gồm #666 attach-guard); checkpoint kongming sau implement miss do host hết usage — ghi nhận, tiếp theo authoritative gates. Follow-up ghi issue: nút «Tài liệu» vẫn hiện trên bucket flagged (pre-existing, server #662 đã chặn attach) và ghost bucket vẫn tiêu thụ index/syllabus mapping (pre-existing, đối xứng I4 cần quyết riêng).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
