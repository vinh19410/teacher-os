---
title: "Pilot log + triage SLA + weekly self check-in"
status: todo
---

# Phase 1: Pilot log + triage SLA + weekly self check-in

## Overview

Tạo 3 file vận hành pilot trong thư viện plan M4 umbrella, đúng design decision đã chốt tại đó: `pilot-log.md` (append-only), `triage-convention.md`, `weekly-check-in.md`. Toàn bộ bảng ghi rỗng — đây là kit chờ pilot, không phải evidence.

## Requirements

- Pilot log entry format: mỗi entry bắt buộc 3 trường **severity** (blocker / defect / feature-request) — **frequency** (mỗi buổi / hằng ngày / thỉnh thoảng / một lần) — **workflow impact** (chặn lớp học / phiền nhưng lách được / mong muốn); header ghi rõ pilot là **self-pilot** (operator = tác giả, đổi phạm vi 2026-09-17) và evidence tự ghi mang author-bias.
- Tally hằng ngày: cột ngày làm việc / có dùng app không / lớp đã vận hành; có section **Lịch tuần** để ghi lịch làm việc thật của người self-pilot ngay khi pilot bắt đầu — "ngày làm việc" đối chiếu lịch này, không đếm cảm tính (giữ yêu cầu umbrella phase-01).
- Bảng blocker SLA: cột mở (timestamp) / đóng (timestamp) / số ngày làm việc trôi qua / pass-fail; rỗng. Blocker đóng quá 1 ngày làm việc = vi phạm DOD-5: ghi rõ trong bảng, milestone NO-GO cho tới khi có review nguyên nhân (không giấu, không tự xóa).
- Bảng xác nhận reload (DOD-4): cột ngày / thao tác tạo-sửa / kết quả hard reload / xác nhận; rỗng.
- Quy tắc ghi an toàn viết thẳng vào template (không chỉ nằm trong plan): không ghi tên/email/số điện thoại học viên (dùng mã ẩn danh), không dán raw Worker log hay query chứa token — chỉ trích dẫn đã làm sạch; secret không bao giờ vào log (ràng buộc umbrella "không secret vào artifact").
- Triage convention: Blocker = chặn lớp học thật (không điểm danh được, mất dữ liệu, không đăng nhập được) → SLA fix ≤ 1 ngày làm việc; công thức đếm ngày làm việc tường minh (không tính thứ 7/Chủ nhật; mở và đóng cùng ngày = 0 ngày); Defect = phiền nhưng lách được → tổng hợp tuần; Feature request = chỉ ghi log (scope khóa). Mất dữ liệu xác nhận sau reload = NO-GO milestone cho tới khi điều tra xong + xác nhận đã xử lý; blocker quá SLA = vi phạm DOD-5 như trên.
- Weekly self check-in: mẫu tự tổng kết tuần **từ pilot log** (số ngày dùng / tổng số ngày làm việc, entry theo severity/frequency, blocker mở/đóng + SLA, reload confirmation, pain-point xếp hạng, focus tuần sau); kết quả tuần lưu tại chỗ trong `weekly-check-in.md` (mỗi tuần 1 section) và `pilot-log.md` chốt tuần bằng 1 dòng link tới section đó — deviation có ghi chú so với umbrella phase-04 ("ghi kết quả vào log"): nội dung tổng hợp nằm ở weekly-check-in, log giữ con trỏ; ghi chú provisional/author-bias cho M5 decision record.
- Không tạo file recruitment (bỏ theo rescope self-pilot); không sửa plan umbrella hay roadmap trong phase này.

## Files to Create / Modify

- Create: `plans/260917-1215-m4-pilot-operations/pilot-log.md`
- Create: `plans/260917-1215-m4-pilot-operations/triage-convention.md`
- Create: `plans/260917-1215-m4-pilot-operations/weekly-check-in.md`

## Implementation Steps

1. Đọc `docs/production-release-runbook.md` mục Support triage + phase-01/04 umbrella để chốt chữ nghĩa phân loại khớp SLA "≤1 ngày làm việc".
2. Viết `triage-convention.md`: phân loại 3 mức + công thức SLA + xử lý blocker quá SLA (DOD-5) + đường fix (branch → PR → merge `main` → deploy tự động → post-deploy smoke → đóng blocker) + quy tắc mất dữ liệu reload + quy tắc trích dẫn log đã làm sạch.
3. Viết `pilot-log.md`: header self-pilot + quy ước entry (3 trường bắt buộc, append-only) + section Lịch tuần + bảng tally + bảng blocker SLA + bảng reload confirmation + section quy tắc ghi an toàn + section weekly check-in link; mọi bảng rỗng.
4. Viết `weekly-check-in.md`: mẫu tuần rỗng dẫn xuất từ pilot log, mỗi tuần 1 section.
5. Rà: không entry có ngày giả, không secret, không data học viên.

## Todo

- [x] `triage-convention.md` hoàn chỉnh
- [x] `pilot-log.md` hoàn chỉnh (3 trường + lịch tuần + tally + blocker + reload)
- [x] `weekly-check-in.md` hoàn chỉnh

## Success Criteria

- Ba file tồn tại đúng path umbrella; đọc một lượt là hiểu cách ghi mà không cần hỏi thêm.
- Mọi bảng evidence rỗng; file tự mô tả là template self-pilot, chưa có hoạt động nào được ghi nhận.
