# Session Report: 2026-10-02 UAT kickoff

## Outcome

UAT round đã mở. Quantity Engineer được giao thực thi. BA và Tech Lead chưa nhận việc cho đến khi có CONCERN/BUG.

## Work completed

- [x] Đọc README, runbook, roadmap, CHANGELOG v0.0.12, evidence UAT r2
- [x] Probe môi trường: staging API/web/landing 200; staging student DNS NXDOMAIN; prod API/web/student 200
- [x] Tạo plan `plans/261002-0406-uat-squad-round/`

## In progress

- [ ] Phase 1 QE execute UAT — assigned, chờ evidence

## Scope

Không lệch so với yêu cầu user: QE test, BA Q&A concern, Tech Lead chỉ tạo GitHub issue.

## Risks

| Risk | Mitigation |
|------|------------|
| Staging auto-deploy off, có thể thiếu #292/#297 | QE verify UI trước khi pass; fallback prod throwaway |
| Student staging DNS missing | Ghi BLOCKED staging; prod student chỉ throwaway |
| Google UAT account không có trong session | Email/password throwaway như UAT r2 |

## Blockers

Student portal staging không resolve. Owner: PM/operator. Unblock: provision DNS `student.staging.teacheros.io.vn` hoặc chấp nhận UAT student trên prod throwaway.

## Next actions

| Action | Owner | Done when |
|--------|-------|-----------|
| Chạy matrix A–E, viết `reports/uat-qe-2026-10-02.md` | QE | File có GO/NO-GO + bảng case |
| Q&A từng CONCERN | BA | File BA QA, 0 unanswered trừ operator |
| Tạo GitHub issue cho từng BUG, không implement | Tech Lead | Bảng bug → URL |

**Hoàn thành plan UAT này là bắt buộc.** Phase 1 không xong thì không có GO/NO-GO, không có issue, vòng UAT trượt.

## Unresolved questions

1. Operator có Google UAT account cho vòng này, hay QE dùng email/password throwaway?
2. Có chấp nhận UAT student trên production throwaway khi staging student DNS chưa có?
