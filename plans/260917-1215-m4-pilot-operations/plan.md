---
title: "M4 — Pilot vận hành"
description: "Đưa Teacher OS qua pilot thật: pilot kit (log/severity/SLA), tài liệu tuyển + onboard 1 giáo viên lên production, vận hành ≥2 lớp thật ≥2 tuần liên tục với triage blocker ≤1 ngày làm việc, và đóng milestone 4 theo evidence."
status: in-progress
priority: P1
effort: "2-4 ngày chuẩn bị + ≥2 tuần vận hành thời gian thực"
issue: 53
branch: develop
tags: [pilot, operations, production, evidence]
blockedBy: []
blocks: []
created: 2026-09-17
---

# M4 — Pilot vận hành

## Overview

Milestone 4 của [roadmap](../../docs/project-roadmap.md): giáo viên thật dùng M1–M3 hằng ngày trên production. Đây là milestone **vận hành**, không phải milestone tính năng: giá trị nằm ở bằng chứng sử dụng thật (pilot log, hoạt động ≥8/10 ngày làm việc liên tục ≥2 tuần, 0 mất dữ liệu, 0 blocker quá SLA), không ở dòng code mới.

Phân vai đã chốt với user (warmup 2026-09-17):

- **AI đảm nhận**: pilot kit, tài liệu tuyển giáo viên, onboarding runbook, tooling kiểm chứng reload, triage + fix blocker trong SLA, ghi log, thu thập evidence, tổng hợp báo cáo.
- **User đảm nhận**: tìm/chốt/quan hệ giáo viên pilot, weekly check-in với giáo viên, mọi quyết định thay đổi phạm vi.

## Outcome contract (LOCKED — user approved 2026-09-17)

- **Intended result**: GitHub milestone 4 đóng với đầy đủ evidence DOD; issues #67, #68, #53 đóng; `docs/project-roadmap.md` cập nhật M4 → Hoàn thành.
- **In scope**: pilot kit; tài liệu tuyển giáo viên; onboarding runbook + verify Google OAuth round-trip thật; tooling "0 mất dữ liệu sau reload"; triage/fix trong suốt pilot; đóng milestone theo evidence.
- **Out of scope**: tạo assignment, tạo/gửi report, settings persist (trừ khi pilot evidence chứng minh blocker → Decision required); parent login, Zalo/GCal, multi-teacher, dark mode; tự tìm giáo viên thay user; M5+ và refactor không phục vụ pilot. Branch #106 (KPI counters) đang chạy riêng, ngoài milestone M4.
- **Acceptance signals**: 5 dòng DOD của #53, mỗi dòng có evidence link; milestone 4 đóng khi cả 3 issues đóng.
- **Constraints**: production là môi trường pilot duy nhất; data thật — không seed/fake, không xóa data giáo viên; fix production theo runbook chuẩn; SLA triage ≤1 ngày làm việc; không deadline lịch cứng (DOD-driven); không secret vào artifact.
- **Allowed substitutions**: không có — mọi thay đổi outcome/scope → Decision required với user.
- **Decision owner**: user.

## Scope Challenge

- Existing (verified): M1–M3 Hoàn thành; production deploy tự động từ `main` (Deploy Production workflow xanh 2026-09-17); runbook có sẵn Support triage + post-deploy smoke + rollback; E2E suite ~23 specs bao gồm reload paths (`apps/e2e/specs/class-operations.spec.ts`, `create-invoice.spec.ts`); deviation Google OAuth round-trip thật chờ verify tại onboard đầu tiên (ghi trong roadmap M3).
- Requested: hoàn tất milestone M4 theo DOD 5 dòng của issue #53.
- Complexity: 5 phase; phần kỹ thuật nhẹ (docs + checklist + triage), phần khó là điều phối vận hành ≥2 tuần thời gian thực và phụ thuộc bên ngoài (giáo viên).
- Selected mode: HOLD SCOPE — phạm vi tính năng đóng băng theo roadmap M4.

## Outcome and GO/NO-GO

GO (đóng milestone) chỉ khi cả 5 DOD có evidence thật, không phải deadline hay merge:

1. 1 giáo viên onboard, vận hành ≥2 lớp thật trên production — evidence: bản ghi onboard (ngày, số lớp, ai xác nhận) + pilot log.
2. Hoạt động ≥8/10 ngày làm việc, liên tục ≥2 tuần — evidence: tally hằng ngày trong pilot log + weekly check-in.
3. Pilot log có severity/frequency/workflow impact — evidence: `pilot-log.md` đủ 3 trường cho mọi entry.
4. 0 mất dữ liệu xác nhận sau reload — evidence: checklist reload định kỳ + smoke sau mỗi deploy + xác nhận của giáo viên trong log; mọi case mất dữ liệu là NO-GO cho tới khi điều tra xong.
5. 0 pilot blocker mở quá 1 ngày làm việc — evidence: pilot log timestamp mở/đóng blocker so với SLA.

NO-GO nếu: mất dữ liệu thật chưa rõ nguyên nhân; blocker tồn dư quá SLA; giáo viên không đạt ≥8/10 ngày làm việc; hoặc pilot chứng minh M1–M3 có lỗ hổng nghiêm trọng chưa vá.

## Non-goals

- Tạo assignment, tạo/gửi report, settings persist — CHƯA DÙNG ĐƯỢC tại M4. Ghi nhận request vào pilot log; chỉ escalate thành Decision required nếu pilot evidence chứng minh blocker vận hành.
- Parent login, Zalo/GCal, mời/quản trị nhiều giáo viên, dark mode.
- Gộp branch #106 (KPI counters) vào plan này — nó chạy độc lập ngoài milestone M4.
- Load test, alerting/Sentry hoàn chỉnh, synthetic monitoring.

## Design decisions

| Decision | Chọn | Rationale |
|---|---|---|
| Vị trí pilot log | `plans/260917-1215-m4-pilot-operations/pilot-log.md` (append-only) | Operational log không làm ô nhiễm `docs/`; roadmap chỉ giữ trạng thái; báo cáo tổng nằm trong `reports/`. |
| Triage blocker | AI fix qua branch → PR → merge `main` → deploy tự động → post-deploy smoke theo runbook | Đường đã rehearse từ M3; không deploy thủ công ngoài CI. |
| Phân loại phản hồi | Blocker (chặn lớp học) / Defect (phiền nhưng lách được) / Feature request | Blocker mới kích hoạt SLA 1 ngày làm việc; còn lại ghi log chờ tổng hợp tuần. |
| Evidence "0 mất dữ liệu" | 3 lớp: smoke sau deploy (runbook) + checklist reload định kỳ + xác nhận giáo viên trong log | E2E CI chạy trên D1 local — không thay thế được quan sát production thật. |
| Verify OAuth round-trip | Trong Phase 3, đúng lúc giáo viên login Google lần đầu | Đúng kế hoạch deviation M3 ghi trong roadmap; là điều kiện của Phase 3 chứ không phải phase riêng. |
| Feature request trong pilot | Không làm; escalate Decision required nếu evidence chứng minh blocker | Contract khóa phạm vi; roadmap quy ước "chỉ đổi non-goal khi pilot chứng minh đang chặn". |

## Phases

| Phase | Name | Status |
|---|---|---|
| 01 | [Pilot kit + tài liệu tuyển giáo viên](./phase-01-pilot-kit-and-recruitment-materials.md) *(gate: —)* | Pending |
| 02 | [Chuẩn bị kỹ thuật trước onboard](./phase-02-pre-onboard-technical-prep.md) *(gate: —)* | Pending |
| 03 | [Onboard giáo viên pilot](./phase-03-onboard-pilot-teacher.md) *(gate: external — user chốt được giáo viên)* | Pending |
| 04 | [Vận hành pilot — log, check-in, triage](./phase-04-pilot-run-triage-and-evidence.md) *(gate: Phase 03 xong)* | Pending |
| 05 | [Đóng milestone M4 theo evidence](./phase-05-close-milestone-m4.md) *(gate: DOD 5/5 có evidence)* | Pending |

## Dependency graph

```text
P1 pilot kit ──────┐
P2 kỹ thuật prep ──┼─> P3 onboard (cần user chốt GV) ─> P4 vận hành ≥2 tuần ─> P5 đóng milestone
(user tuyển GV) ───┘
```

P1 và P2 chạy song song; việc user tuyển giáo viên chạy song song cả hai. P3 không thể bắt đầu trước khi có giáo viên — đó là điều kiện tiên quyết bên ngoài duy nhất của milestone.

## Traceability (contract → plan)

| Phase | Contract items | Acceptance signals | Facts / assumptions / prereqs / user decisions |
|---|---|---|---|
| 1 | In scope: pilot kit, tài liệu tuyển | DOD-3 khả dụng (template đủ 3 trường) | Fact: E2E + runbook đã có. Decision (user): AI làm kit, user tuyển GV. |
| 2 | In scope: runbook onboard, tooling reload | Nền tảng cho DOD-4; quy trình verify OAuth | Fact: deploy tự động từ `main`; smoke runbook đã có. Assumption: GV dùng desktop + Chrome/Safari. |
| 3 | In scope: onboard + verify OAuth round-trip | DOD-1 (≥2 lớp thật), đóng deviation M3 | **Prereq ngoài: giáo viên (user đang tuyển — chưa có, verified 2026-09-17).** Decision (user): bắt đầu ngay khi sẵn sàng. |
| 4 | In scope: triage SLA, log, check-in | DOD-2, DOD-3, DOD-4, DOD-5 đo sống ở đây | Fact: SLA ≤1 ngày làm việc (contract). Assumption: AI fix + deploy trong ngày làm việc được. |
| 5 | In scope: đóng milestone theo evidence | Cả 5 DOD có link; #67/#68/#53 + milestone 4 đóng | Fact: quy tắc roadmap — chỉ tick khi có evidence, không tick theo merge. |

## Success Criteria

- [ ] 5 dòng DOD của #53 tick với evidence link (pilot log / deploy record / bản ghi onboard).
- [ ] #67, #68 đóng kèm evidence comment; #53 đóng sau cùng; GitHub milestone 4 đóng.
- [ ] `docs/project-roadmap.md` M4 → **Hoàn thành** kèm evidence; deviation Google OAuth round-trip được verify hoặc ghi rõ kết quả.
- [ ] Không có thay đổi tính năng thuộc out-of-scope lọt vào main trong thời gian pilot.
- [ ] Không secret nào lọt vào pilot log, báo cáo, issue hay commit.

## Open questions

None blocking. Điều kiện tiên quyết bên ngoài duy nhất (giáo viên) đã được ghi nhận là prereq của user trong Preflight Matrix, không phải câu hỏi mở của plan.
