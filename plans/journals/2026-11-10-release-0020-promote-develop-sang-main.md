---
title: "Release 0.0.20: promote develop sang main"
date: 2026-11-10
summary: "Promote 91 commit develop→main (0.0.20): material bank, buổi manual class_session, chọn tài liệu khi tạo buổi, chuỗi fix lesson_material mồ côi #658/#645/#659/#662 + audit #663; 4 migration D1 0065–0068 và R2 MATERIALS bắt buộc trên prod."
---

# Release 0.0.20: promote develop sang main

# Release 0.0.20: promote `develop` → `main`

**Date**: 2026-11-10 (Europe/London)
**Severity**: High (4 migration D1 + resource R2 mới lên prod)
**Component**: materials, classes/sessions, holidays, db tooling, CI deploy
**Status**: Đang ship — chờ deploy prod + quyết định cleanup

## What Happened

`git log origin/main..origin/develop` = 91 commit, CHANGELOG 2026-11-08 → 2026-11-10:

- **Material bank** (#644/#648): thư mục lồng nhau, file/link/audio-video, gắn tài liệu theo buổi. Migration `0066_class_materials`, R2 private `materials` binding `MATERIALS`.
- **Buổi manual qua `class_session`** (#649/#650): lớp chưa có giáo trình không còn hiện 12 buổi chiếu trước rỗng; thêm buổi tay. Migration `0067`.
- **Chọn tài liệu khi tạo buổi / bài giáo trình** (#655/#657): bảng `syllabus_lesson_material` (`0068`), tối đa 20 tài liệu/buổi.
- **Điểm đầu vào** học viên (#641, `0065_student_entry_score`).
- **Badge «Đã dời»** cho bucket manual 0 lesson có holiday shift (#665).
- **Staging deploy từ `develop`** (#643) thay vì nhánh `staging`.
- Chuỗi fix `lesson_material` mồ côi: #658 → #645 → #659 → #662, rồi tooling audit/cleanup #663.

## The Brutal Truth

Ba feature ra trong hai ngày (material, `class_session`, picker) đều đúng khi đứng riêng, nhưng không ai vẽ ma trận giao nhau với holiday shift và activation. Kết quả: #655 làm tài liệu gắn vào buổi manual trở thành luồng chính, và lộ ra cả chuỗi — tài liệu 404 trên buổi chỉ có `class_session` (#658), không đi theo holiday shift (#645), bị bỏ lại ở ngày gốc khi activation I6 (#659) và non-I6/attach-sau-shift (#662). Bốn PR fix liền nhau cho cùng một lớp lỗi là dấu hiệu rõ: thiết kế dữ liệu bị vá theo từng triệu chứng thay vì định nghĩa một lần "buổi thật là gì". Tệ hơn, data mồ côi có thể đã nằm trên staging/prod trước khi fix, nên phải viết thêm cả một tool audit (#663) — tool đó lại cần 4 commit sửa tiếp chỉ để resolve đúng D1 prod và phân biệt lỗi probe với bảng rỗng. Mệt, và đáng lẽ tránh được.

Thêm một vết: CI chuyển sang self-hosted runner rồi revert ngay (`2575b98c` → `93560669`) — thử nghiệm không có plan, để lại noise trong lịch sử.

## Decisions

- **`class_session` là nguồn buổi cấp lớp**; buổi chỉ có `class_session` được coi là buổi thật cho materials/move (#658). Loại bỏ phương án "chỉ tin `lesson` row" vì lớp manual chưa có học viên sẽ không có buổi nào.
- **Material đi theo shift trong cùng batch nguyên tử** (helper `materialMoveStatements` dùng chung I6/non-I6); attach vào bucket đã shift/all-holiday trả 409 `SESSION_HOLIDAY`. Detach vẫn 200 để gỡ được data legacy.
- **Cleanup prod là quyết định owner**, không tự chạy: `audit-663.yml` read-only; `--apply` cần confirm + dump.
- Thiếu binding `MATERIALS` thì route file trả 503 `MATERIALS_DISABLED` thay vì crash — degrade có chủ đích.

## Root Cause Analysis

Không có invariant chung cho "buổi" (lesson vs `class_session` vs holiday shift row). Mỗi feature tự suy luận buổi từ nguồn khác nhau, và test của từng PR chỉ phủ đường của chính nó, không phủ tổ hợp manual + holiday + activation lại.

## Lessons Learned

- Feature thêm bảng con của "buổi" (`lesson_material`, `syllabus_lesson_material`) phải liệt kê mọi đường làm buổi di chuyển/tái tạo (shift, unshift, move, activation, xóa enrollment) và có test cho từng đường **trước khi merge**.
- Fix data-shape luôn kèm câu hỏi: "data hỏng đã có trên môi trường thật chưa?" — tool audit nên ra cùng fix đầu tiên, không phải sau fix thứ tư.
- Thử nghiệm hạ tầng CI đi branch riêng, không đẩy thẳng `develop`.

## Next Steps

1. Trước deploy prod: xác nhận R2 bucket `materials` + binding `MATERIALS` tồn tại (`docs/production-release-runbook.md`), dry-run và áp 4 migration `0065`–`0068` theo pre-flight runbook. Owner: người ship, trong lượt release này.
2. Sau deploy: chạy `audit-663.yml` read-only trên prod, owner quyết định có `--apply` cleanup hay không.
3. Smoke: upload tài liệu vào buổi manual, dời lịch lễ, kiểm tra tài liệu theo ngày bù và badge «Đã dời».

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
