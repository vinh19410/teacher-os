---
phase: 1
title: "Pilot kit + tài liệu tuyển giáo viên"
status: pending
priority: P1
effort: "0.5-1d"
dependencies: []
---

# Phase 1: Pilot kit + tài liệu tuyển giáo viên

## Overview

Tạo toàn bộ công cụ vận hành pilot trước khi có giáo viên: pilot log template (severity/frequency/workflow impact), quy ước triage SLA, bộ câu hỏi weekly check-in, và tài liệu giới thiệu để user đi tuyển giáo viên. Phase này do AI tự chạy được ngay, không phụ thuộc bên ngoài.

## Requirements

- Pilot log template tại `plans/260917-1215-m4-pilot-operations/pilot-log.md` (append-only): mỗi entry bắt buộc đủ 3 trường **severity** (blocker/defect/feature-request) / **frequency** (mỗi buổi/hằng ngày/thỉnh thoảng/một lần) / **workflow impact** (chặn lớp học / phiền nhưng lách được / mong muốn). Blocker phải có timestamp mở và timestamp đóng để đo SLA 1 ngày làm việc.
- Tally hằng ngày trong pilot log: ngày làm việc, giáo viên có dùng app không, lớp nào — nền tảng đo DOD "≥8/10 ngày làm việc, liên tục ≥2 tuần". Template phải định nghĩa rõ kiểm tra được: "ngày làm việc" = ngày giáo viên thực tế làm việc/dạy theo lịch của chính giáo viên (ghi lịch tuần của GV vào template ngay buổi onboard để tally đối chiếu, tránh đếm cảm tính).
- Quy ước triage trong kit: **Blocker** = chặn lớp học thật (không điểm danh được, mất dữ liệu, không đăng nhập) → SLA fix ≤1 ngày làm việc; **Defect** = phiền nhưng lách được → ghi log, tổng hợp tuần; **Feature request** = chỉ ghi log, không làm (scope khóa).
- Bộ câu hỏi weekly check-in: 5–8 câu định lượng (dùng mấy ngày, lỗi gì, lách thế nào) + định tính (thứ tự đau nhất). AI soạn trước mỗi buổi từ pilot log; user gặp giáo viên và ghi câu trả lời vào log.
- Tài liệu tuyển giáo viên (một trang): Teacher OS giải quyết gì, giáo viên phải làm gì (dùng thật 2 tuần, ~10–15 phút/ngày sau buổi onboard 30–45 phút), phản hồi đóng góp thế nào, dữ liệu của ai. Không hứa tính năng chưa có.

## Related Code Files

- Create: `plans/260917-1215-m4-pilot-operations/pilot-log.md`, `plans/260917-1215-m4-pilot-operations/triage-convention.md`, `plans/260917-1215-m4-pilot-operations/weekly-check-in.md`, `plans/260917-1215-m4-pilot-operations/recruitment-onepager.md`.
- Read only: `docs/production-release-runbook.md` (mục Support triage — căn chỉnh quy ước blocker cho khớp), `docs/project-roadmap.md` (CHƯA DÙNG ĐƯỢC tại M4).

## Implementation Steps

1. Đọc mục Support triage của runbook + DOD #53 → chốt quy ước blocker/defect/feature-request khớp SLA "≤1 ngày làm việc" của milestone.
2. Viết `pilot-log.md` template với entry format + tally + bảng blocker (mở/đóng/SLA pass-fail).
3. Viết `triage-convention.md` và `weekly-check-in.md`.
4. Viết `recruitment-onepager.md` — giọng văn dành cho giáo viên, không jargon kỹ thuật.
5. Giao tài liệu tuyển cho user; user bắt đầu tìm giáo viên (song song Phase 2).

## Success Criteria

- [ ] `pilot-log.md` template sẵn sàng ghi ngay ngày onboard, đủ 3 trường + tally + blocker SLA tracking.
- [ ] `triage-convention.md` định nghĩa được blocker một cách kiểm tra được (không cảm tính).
- [ ] `weekly-check-in.md` có bộ câu hỏi dùng được cho cả 2 tuần+.
- [ ] `recruitment-onepager.md` hoàn thành, user xác nhận dùng được để tiếp cận giáo viên.
- [ ] 0 secret, 0 data nhạy cảm trong mọi file.
