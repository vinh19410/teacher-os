---
phase: 8
title: "Wave 7 Reports notifs comment bank"
status: completed
priority: P2
effort: "1-2d"
dependencies: [4, 7]
# After wave 6 because both touch grade-modal.tsx.
---

# Phase 8: Wave 7 Reports + notifs + comment bank

## Overview

Persist 3 bảng org-level: `report`, `notif`, `comment_bank`. List sống sau reload. Tạo/gửi report vẫn stub. Append comment bank persist. Notif không mark-read.

## Context Links

- `apps/web/src/routes/_auth/reports.tsx`
- Stub: `create-report-modal.tsx:33-37`
- Notif: `apps/web/src/components/layout/notif-panel.tsx` — read-only
- Comment bank read: `assignments/$assignmentId.tsx:132`
- Grade feedback local discarded: `grade-modal.tsx:22,97-103`
- User lock: wave 7 **phải** persist (không cắt)

## Requirements

- Functional: 3 list persist. Org mới = 3 collection trống. Append comment bank từ grade modal feedback non-empty → D1. Create/send report no-op.
- Non-functional: không mark-read (không có write path). Settings vẫn local.

## Architecture

```
report: id, orgId, studentId, period, sessions, status, sent, read, createdAt
notif:  id, orgId, text, time, channel, dot, createdAt
comment_bank: id, orgId, tag, text, createdAt
```

- D1: `orgId` NOT NULL FK cascade + org/order indexes trên cả 3 bảng. `report.studentId` NOT NULL FK cascade; loader join đồng thời `student.id` + `student.orgId = report.orgId` để row malformed cross-org không lên wire.
- Read canonical qua `GET /api/kernel`: thêm 3 collection vào `KernelSnapshot`, `loadSnapshot`, adapter `KernelSlice`, reducer payload. Ba GET list riêng dùng chung loader để giữ contract list, không tạo cache/fetch path thứ hai trên web.
- DTO map `report.studentId → Report.sid`; giữ display-string `sent`/`read`, status `read|sent|draft`; notif `dot` = `accent|danger|warn`. Sort deterministic `createdAt,id`.
- `CommentBankItem` giữ `id` đến UI; append cho phép trùng text (mỗi successful POST là một item mới), React key theo `id`.
- POST `/api/comment-bank` đi qua serialized command bus, body strict `{text, operationId}`; server trim, min 1, max 2000, gán tag `chung` và id. `operationId` ổn định theo một lần mở grade modal, unique `(orgId,operationId)`; retry cùng payload sau timeout/mất ACK trả id đã commit thay vì append lại, payload khác trả 409. Không direct fetch từ modal.
- Grade flow: grade trước. Chỉ sau grade success mới append feedback đã trim. POST comment trả `{id}` là commit ACK; riêng action này, refresh fail vẫn trả id sau global "đã lưu nhưng chưa tải lại" toast để modal không replay write. POST fail thì giữ modal mở, báo rõ "điểm đã lưu / nhận xét chưa lưu", retry chỉ append với cùng `operationId`. Không rollback grade; các action hiện hữu vẫn require refresh success như cũ.
- Không POST create/send report. Không PATCH notif. Không API delete/retention trong wave này.

## Related Code Files

- Create: `packages/db/src/schema/report.ts`, `notif.ts`, `comment-bank.ts`
- Create: reporting route/loader module; `repos/reports.ts`, `repos/notifs.ts`, `repos/comment-bank.ts`
- Modify: `packages/db/src/schema/index.ts`, generated migration/meta, `packages/api/src/contracts.ts`, snapshot/router wiring, `data-store-reducer.ts`, `repos/kernel.ts`, `mock-data.ts`, `grade-modal.tsx`
- Verify without no-op edits: `reports.tsx` already reads `data.reports`; `assignments/$assignmentId.tsx` already reads `data.commentBank`; `topbar.tsx` already passes `data.notifs`; both report entry points share `create-report-modal.tsx`.
- Do not modify: `settings.tsx`, banner text (`topbar.tsx:66`)

## Implementation Steps

1. Viết failing schema/handler/adapter/command-bus contract tests trước.
2. Tạo 3 bảng + exports + generated migration/meta trên journal mới nhất.
3. Thêm DTO + shared loaders + 3 GET list org-scoped và hydrate cả 3 list trong kernel snapshot.
4. Thêm command `add-comment-bank`; strict POST body, stable operation id qua retry, server-owned tag `chung`, deterministic order và identity giữ tới UI.
5. Grade modal: grade success → feedback trim có text thì append; pin partial-success/retry UX và seam `POST 2xx → refresh fail` không replay comment. Feedback trống thì không POST.
6. Pin CreateReportModal: Save Draft và Send ở cả `/reports` và student detail đều không POST/insert. Không mark-read notif.
7. Test org mới rỗng, reload, cross-org malformed report bị ẩn, invalid/oversize comment bị reject, no-op report/notif contracts.

## Todo

- [x] 3 bảng persist
- [x] Lists từ D1
- [x] Append comment bank
- [x] Create/send report no-op
- [x] Notif không mark-read

## Success Criteria

- [x] Reload giữ report/notif/commentBank đã có
- [x] Org mới: 3 list rỗng
- [x] Tạo/gửi report không insert
- [x] Quality gate xanh

## Risk Assessment

Hiện không có reducer write cho commentBank. Append từ grade modal là write path **mới** do advise lock, không phải vá stub report. Signal: implementer thêm create-report API. Response: reject — chỉ append comment bank.

Notif seed biến mất với org trống — banner "Dữ liệu demo" còn đến wave 8.

Grade + comment là two-step có chủ ý vì issue khóa endpoint comment riêng. Grade đã lưu không rollback khi comment POST fail; UI giữ modal để retry riêng append và khóa payload sau lần grade commit. Comment POST đã ACK nhưng refresh fail là committed, không retry. Nếu DB commit nhưng ACK bị mất, cùng operation id + payload trả lại row đã commit; payload khác bị conflict, không báo thành công giả. Duplicate text vẫn hợp lệ giữa các lần grade độc lập vì mỗi lần mở có operation id mới; identity bằng server id. Static report `sendLog`/topbar chrome không phải 3 persisted collection và không bị mở rộng scope trong wave này.

## Security Considerations

3 bảng filter `orgId`; report loader additionally same-org joins student. `comment_bank.text`, `notif.text` và report linkage là dữ liệu giáo dục có thể chứa PII: không log/echo raw text, React escaping giữ nguyên, input comment strict + max 2000. Current bootstrap only creates `teacher` memberships and exposes no role-management/import surface; changing global role authorization is outside Wave 7, but every Wave 7 response/write remains session + org scoped.

## Red Team Dispositions — 2026-08-19

- Accepted: kernel hydration path; grade→comment ordered two-step + partial-success UX; server identity/duplicate semantics + operation idempotency; report DTO + same-org join; full migration invariants; both report no-op actions/callers; PII threat correction; notif enum/order; strict bounded comment input.
- Rejected as scope expansion: global role-model enforcement (no non-teacher creation/import surface in current product), pagination/rate limiting, and rewriting static report send-log/topbar chrome. Revisit when those public surfaces exist.
- Verification: source citations in `reports/red-team-wave7-assumption-destroyer.md` and `reports/red-team-wave7-security-adversary.md`.
- Kongming checkpoint: GO_WITH_CONCERN; resolved commit-vs-refresh ambiguity by preserving existing bus semantics for old actions and treating comment POST `{id}` as commit ACK.
- Local review fix: stable per-open operation id + unique org constraint resolves commit-but-response-lost replay without deduping valid equal text across independent grading flows; retry payload is immutable in UI and mismatch fails 409 server-side.
- Unresolved contradictions: 0.
