---
phase: 8
title: "Wave 7 Reports notifs comment bank"
status: pending
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
report: id, orgId, studentId, period, sessions, status, sent, read
notif:  id, orgId, text, time, channel, dot
comment_bank: id, orgId, tag, text
```

POST `/api/comment-bank` từ grade modal khi feedback trim ≠ "". GET 3 list. Không POST create/send report. Không PATCH notif.

## Related Code Files

- Create: `packages/db/src/schema/report.ts`, `notif.ts`, `comment-bank.ts`
- Create/Modify: routes + `repos/reports.ts`, `repos/notifs.ts`
- Modify: `reports.tsx`, `grade-modal.tsx` (append nếu feedback trim ≠ ""), `assignments/$assignmentId.tsx` (đọc `data.commentBank`), `topbar.tsx` (truyền `data.notifs` — **không** đổi copy banner)
- Do not modify: `settings.tsx`, banner text (`topbar.tsx:66`)

## Implementation Steps

1. 3 bảng + migrate.
2. GET lists org-scoped.
3. Grade modal: nếu feedback có text → POST comment_bank (tag mặc định hợp lý, ví dụ "chung").
4. CreateReportModal giữ onClose no-op.
5. Org mới: 3 list rỗng.

## Todo

- [ ] 3 bảng persist
- [ ] Lists từ D1
- [ ] Append comment bank
- [ ] Create/send report no-op
- [ ] Notif không mark-read

## Success Criteria

- [ ] Reload giữ report/notif/commentBank đã có
- [ ] Org mới: 3 list rỗng
- [ ] Tạo/gửi report không insert
- [ ] Quality gate xanh

## Risk Assessment

Hiện không có reducer write cho commentBank. Append từ grade modal là write path **mới** do advise lock, không phải vá stub report. Signal: implementer thêm create-report API. Response: reject — chỉ append comment bank.

Notif seed biến mất với org trống — banner "Dữ liệu demo" còn đến wave 8.

## Security Considerations

3 bảng filter `orgId`. Comment bank không chứa PII HV nếu chỉ là template — vẫn org-scoped.
