---
title: "Fix #173: Gửi báo cáo tuần persist thật qua kernel"
description: "CreateReportModal submit chỉ onClose. Kernel đã có bảng report + loader + snapshot map nhưng chưa expose creation. Thêm POST /api/reports (zod schema + verify student cùng org) + 2 cột content/channel (migration) + wire modal: Gửi báo cáo → status 'sent' + sent=now; Lưu nháp → status 'draft'."
status: completed
priority: P1
effort: 5h
issue: 173
branch: fix/173-report-modal-persist
tags: [fullstack, bugfix, reports]
blockedBy: []
blocks: []
created: 2026-09-17
---

# Fix #173: Gửi báo cáo tuần persist thật

## Overview

`CreateReportModal.submit` chỉ `onClose()` — không mutation nào. Khảo sát cho thấy hạ tầng persist **đã có sẵn**: bảng `report` (drizzle, org-scoped), loader `loadReports` (GET `/api/reports` qua snapshot), web đọc `data.reports` cho list + nhật ký gửi. Thiếu đúng 2 thứ: (1) endpoint POST tạo report, (2) cột `content`/`channel` để giữ dữ liệu modal nhập. Route chọn: **persist thật** (Expected option 1 của issue) — không che CTA.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | POST `/api/reports`: auth per-org, zod validate, verify student cùng org, insert; `status=sent` đặt `sent=now`, `draft` để trống `sent` | P1 |
| 2 | Migration thêm 2 cột `content`/`channel` (NOT NULL DEFAULT '') vào bảng `report` | P1 |
| 3 | Modal wire thật: "Gửi báo cáo" → sent; "Lưu nháp" → draft (cả hai persist); lỗi hiện inline; chỉ đóng khi `refreshed`/`committed` | P1 |
| 4 | List + nhật ký gửi hiển thị report mới ngay sau submit (snapshot refresh) | P1 |

## Non-Goals

- Không gửi Zalo/email thật (channel chỉ lưu metadata; #13 CTA Zalo là issue riêng).
- Không mở rộng snapshot contract với content/channel (list không hiển thị nội dung — khi cần sẽ là plan khác).
- Không đụng `sessions` (giữ 0; tự đếm buổi theo period là tính năng khác).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema+migration → contract → POST route → web action+modal → tests](./phase-01-report-persist.md) | Completed |

## Success Criteria

- [x] Server test: POST sent → 201 + snapshot có row `status="sent"`, `sent!=""`; POST draft → `status="draft"`, `sent=""`; unknown student → 400; invalid body → 400; no session → 401
- [x] Web unit: `kernelCommand({type:"create-report"})` → `/api/reports` + body đủ 5 field; reducer case inert (fixture pattern)
- [x] Modal: submit gọi dispatch; `definite-failure` → inline error không đóng; `refreshed/committed` → toast + đóng
- [x] vitest cả workspace xanh; tsc + biome sạch (biome chạy không qua pipe)

## Verification Commands

```bash
pnpm --filter db db:generate
cd apps/server && npx vitest run src/kernel.test.ts
cd apps/web && npx vitest run
```

## Red-Team Record (4 personas, 2026-09-17)

**Assumptions** — table/loader/pattern đã đọc trực tiếp (schema/report.ts, reporting/index.ts, repos/kernel.ts kernelCommand); id=uuid server-side như comment-bank; `sessions` default 0 trung thực vì modal không thu dữ liệu buổi. Không blocker.

**Failure** — (F1) student của org khác: route phải select student theo `(id, orgId)` — 400 khi không thấy, không leak. (F2) double-submit: command bus serialize + modal disable khi pending (copy grade-modal pattern). (F3) content/channel thêm cột NOT NULL DEFAULT '' — backward-safe, không phá row cũ. Không blocker.

**Scope** — gửi thật qua Zalo/email ngoài scope (#13, tích hợp kênh riêng); snapshot contract giữ nguyên; sessions giữ 0. Không scope creep.

**Security** — auth kernelCtx bắt buộc; student phải thuộc org; content là text tự do — render phía list không dùng nên không có injection surface mới; không log PII. Không blocker.

**Verdict: GO** — 0 blocker.
