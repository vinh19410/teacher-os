---
phase: 4
title: "Vận hành pilot — log, check-in, triage"
status: pending
priority: P1
effort: "≥2 tuần thời gian thực"
dependencies: [3]
---

# Phase 4: Vận hành pilot — log, check-in, triage

## Overview

Vòng lặp vận hành ≥2 tuần liên tục: giáo viên dùng thật hằng ngày; AI ghi log, triage blocker trong SLA 1 ngày làm việc, tổng hợp tuần; user giữ quan hệ và gặp giáo viên check-in. Phase này sản sinh trực tiếp evidence cho DOD 2–5.

## Requirements

- Mọi phản hồi của giáo viên vào `pilot-log.md` với đủ severity/frequency/workflow impact — không entry nào thiếu trường.
- Blocker: timestamp mở → AI xử lý trong 1 ngày làm việc (ngày làm việc, không tính cuối tuần) → PR → merge `main` → deploy tự động → post-deploy smoke → timestamp đóng. Quá SLA = vi phạm DOD-5 → điều tra nguyên nhân, không giấu. Kỳ vọng với user: phản hồi của giáo viên được chuyển tiếp **trong ngày làm việc đó** (tối chậm cuối ngày) — SLA chỉ đo được nếu đầu vào không bị trễ; nếu user vắng (đi công tác/nghỉ), blocker vẫn ghi timestamp mở ngay khi biết và báo user là SLA đang trượt.
- Mất dữ liệu sau reload (báo cáo từ checklist hoặc giáo viên): xử lý ưu tiên cao nhất — dừng, điều tra, khắc phục; từng case là NO-GO cho milestone cho tới khi có kết luận + xác nhận đã xử lý.
- Weekly check-in: AI tổng hợp log + soạn câu hỏi trước buổi; user gặp giáo viên; câu trả lời ghi vào log.
- **Scope guard:** feature request của giáo viên chỉ ghi log. Nếu pilot evidence chứng minh một mục out-of-scope (assignment/report/settings persist) là blocker vận hành → dừng, trình user **Decision required** — không tự làm.
- Tally hằng ngày; nếu giáo viên bỏ ≥3 ngày làm việc liên tục, user chủ động liên hệ tìm hiểu (risk: không đủ ≥8/10).

## Related Code Files

- Modify: blocker fixes theo đường PR → `main` chuẩn của repo (tests + `pnpm check-types` + biome xanh trước merge); pilot log.
- Read only: `docs/production-release-runbook.md` (post-deploy smoke, rollback nếu deploy lỗi), `reload-checklist.md`.

## Implementation Steps

1. **Hằng ngày:** tổng hợp phản hồi giáo viên (user chuyển tiếp) vào pilot log; cập nhật tally.
2. **Khi có blocker:** tái hiện → fix (branch + PR + tests) → merge → xác nhận deploy CI → post-deploy smoke → xác nhận với giáo viên qua user → đóng blocker với timestamp.
3. **Hằng tuần:** chạy `reload-checklist.md`; tổng hợp log + soạn câu hỏi check-in; sau buổi check-in, ghi kết quả vào log; cập nhật tiến độ DOD 2–5 (đo sống, chưa tick).
4. **Liên tục:** giám sát Deploy Production workflow sau mỗi merge; deploy đỏ → rollback/fix ngay theo runbook.
5. Không tạo CTA/tính năng mới trong thời gian pilot ngoài fix blocker đã được xác nhận là blocker.

## Success Criteria

- [ ] Pilot log ≥2 tuần liên tục, đủ 3 trường cho mọi entry, tally khớp DOD-2.
- [ ] 100% blocker có timestamp mở/đóng; không blocker nào quá 1 ngày làm việc (DOD-5).
- [ ] 0 case mất dữ liệu chưa kết luận (DOD-4); mỗi deploy trong pilot có smoke evidence.
- [ ] ≥2 buổi weekly check-in có kết quả ghi trong log.
- [ ] 0 thay đổi out-of-scope lọt vào `main` không qua Decision required.
