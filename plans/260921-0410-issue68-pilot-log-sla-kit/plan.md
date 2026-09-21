---
title: "Issue #68 — Pilot log + weekly self check-in + triage SLA (self-pilot kit)"
description: "Bộ tài liệu vận hành pilot cho #68: pilot log (severity/frequency/workflow impact), mẫu weekly self check-in, quy ước triage SLA — chỉ cấu trúc seed, không tạo evidence."
status: completed
priority: P1
effort: "0.5d"
issue: 68
branch: vinh19410/issue-68-pilot-log-sla
tags: [docs, pilot]
blockedBy: []
blocks: []
created: 2026-09-21
---

# Issue #68 — Pilot log + weekly self check-in + triage SLA (self-pilot kit)

## Overview

Issue [#68](https://github.com/vinh19410/teacher-os/issues/68) đòi hỏi ba sản phẩm vận hành cho milestone M4 sau khi đổi phạm vi sang **self-pilot** (2026-09-17, xem [roadmap](../../docs/project-roadmap.md) mục M4): (1) pilot log ghi severity / frequency / workflow impact với evidence rõ ràng là self-pilot; (2) mẫu weekly self check-in — tự tổng kết tuần theo pilot log; (3) quy ước triage SLA: pilot blocker mở tối đa 1 ngày làm việc, 0 mất dữ liệu xác nhận sau reload.

Plan này chỉ giao **cấu trúc và template rỗng/seed** — không tự bịa pilot evidence. Evidence thật (≥2 lớp, ≥8/10 ngày làm việc, blocker đóng trong SLA, reload giữ dữ liệu) chỉ hình thành khi pilot chạy thật theo phase 04 của plan M4; các DOD đó không được tick bởi run này.

Vị trí file vận hành theo design decision đã chốt của plan M4 umbrella ([260917-1215-m4-pilot-operations](../260917-1215-m4-pilot-operations/plan.md)): pilot log và bộ quy ước nằm trong thư viện plan M4, không đưa vào `docs/` thường trực. Ghi chú supersede: mục "tài liệu tuyển giáo viên" (recruitment-onepager) của phase-01 umbrella bị bỏ theo rescope self-pilot — solo dev tự vận hành, không tuyển.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Pilot log template sẵn sàng ghi ngay: đủ 3 trường bắt buộc + Lịch tuần + tally hằng ngày + bảng blocker SLA + bảng xác nhận reload + quy tắc ghi an toàn, toàn bộ rỗng | P1 |
| 2 | Quy ước triage kiểm tra được: định nghĩa blocker/defect/feature-request + SLA "mở ≤ 1 ngày làm việc" (có công thức + xử lý quá SLA) + xử lý mất dữ liệu reload | P1 |
| 3 | Mẫu weekly self check-in (self-pilot) tổng hợp tuần từ pilot log | P1 |
| 4 | 0 evidence bịa, 0 secret/data nhạy cảm, link tương đối hợp lệ | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Pilot log + triage SLA + weekly self check-in](./phase-01-start.md) | Pending |
| 2 | [Validation và integration](./phase-02-validation-va-integration.md) | Pending |

## Success Criteria

- [ ] `plans/260917-1215-m4-pilot-operations/pilot-log.md` tồn tại: entry format đủ 3 trường severity/frequency/workflow impact, section Lịch tuần, tally hằng ngày, bảng blocker có cột mở/đóng/SLA pass-fail, bảng xác nhận reload, section quy tắc ghi an toàn — tất cả bảng rỗng (0 dòng evidence).
- [ ] `plans/260917-1215-m4-pilot-operations/triage-convention.md` định nghĩa checkable được Blocker (chặn lớp học → SLA ≤1 ngày làm việc, có công thức đếm ngày làm việc + xử lý blocker quá SLA), Defect, Feature request; quy trình mất dữ liệu reload là NO-GO milestone cho tới khi có kết luận.
- [ ] `plans/260917-1215-m4-pilot-operations/weekly-check-in.md` là mẫu self check-in tuần (self-pilot): các mục tổng hợp dẫn xuất trực tiếp từ pilot log, kết quả tuần lưu tại chỗ và pilot-log giữ con trỏ, kèm ghi chú author-bias cho M5.
- [ ] Cả 3 file đánh dấu rõ "evidence là self-pilot"; không có dòng nào giả lập hoạt động đã diễn ra.
- [ ] Link tương đối trong/đến 3 file đều trỏ tới file tồn tại; `pnpm check` xanh; không secret.

## Dependencies

- Phụ thuộc (đọc, không sửa): plan M4 umbrella `260917-1215-m4-pilot-operations` (design decision vị trí file, yêu cầu phase-01/04), `docs/project-roadmap.md` (M4 DOD + rescope self-pilot), `docs/production-release-runbook.md` (mục Support triage).
- Không phụ thuộc chạy: #67 (onboard evidence) không chặn việc tạo template; template phải sẵn sàng trước khi pilot bắt đầu.

## Red Team Review

### Session — 2026-09-21

**Note:** subagent reviewers không khả dụng trong environment này (agent runtime: "No model selected") — controller chạy 2 lens đối kháng (Security Adversary + Assumption Destroyer) inline với bằng chứng repo; 2 lens cho plan 2 phase theo quy tắc scale của ak-plan.

**Findings:** 6 (5 accepted, 1 rejected)
**Severity breakdown:** 1 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Tally thiếu "Lịch tuần" ghi sẵn — đếm ≥8/10 ngày làm việc sẽ thành cảm tính, mất cơ chế chống đếm-đoán của umbrella phase-01 (phase-01-pilot-kit:19) | High | Accept | Phase 1 Requirements |
| 2 | Guard "không secret/data học viên" chỉ là checkbox của plan, không nằm trong artifact — quy tắc ẩn danh phải viết thẳng vào pilot-log template (umbrella plan.md:32, phase-05:20) | Medium | Accept | Phase 1 Requirements |
| 3 | Không có quy tắc xử lý blocker đóng quá SLA (DOD-5) — phải ghi rõ violation + NO-GO review, không tự xóa (umbrella plan.md:53) | Medium | Accept | Phase 1 Requirements |
| 4 | Nơi lưu kết quả weekly check-in mâu thuẫn với umbrella phase-04 (phase-04:34 "ghi kết quả vào log") — chốt: nội dung ở weekly-check-in.md, pilot-log giữ con trỏ, ghi deviation note | Medium | Accept | Phase 1 Requirements |
| 5 | Trích dẫn debug (Worker log/wrangler tail) có thể kéo token vào file commit — thêm quy tắc chỉ dán trích dẫn đã làm sạch | Medium | Accept | Phase 1 Requirements |
| 6 | `pnpm check` chạy `biome check --write .` có thể mutate file ngoài phạm vi | Medium | Reject | — (convention của repo, package.json scripts; guard bằng git status sau khi chạy tại Phase 2) |

### Whole-Plan Consistency Sweep

- Đối chiếu plan.md ↔ phase-01 ↔ phase-02 sau khi áp: từ vựng "Lịch tuần", "quy tắc ghi an toàn", "NO-GO DOD-5", "weekly-check-in giữ nội dung / log giữ con trỏ" đồng nhất giữa Goals/Success Criteria và phase-01 Requirements; phase-02 giữ seed-audit và thêm guard git-status cho `pnpm check`. Không còn mâu thuẫn chưa giải quyết.

<!-- slug: issue68-pilot-log-sla-kit -->
