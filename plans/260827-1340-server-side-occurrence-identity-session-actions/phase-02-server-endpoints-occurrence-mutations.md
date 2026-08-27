---
phase: 2
title: "Server endpoint occurrence mutations + {reason} transport"
status: pending
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 2: Server endpoint occurrence mutations + {reason} transport

## Overview

Ba route mutation theo identity `(classId, date)` — edit / check-in / cancel — mỗi action là MỘT statement atomic `UPDATE … WHERE class_id=? AND date=? AND status='upcoming'` thay thế mô hình N×(POST+GET) fan-out từng row. Đồng thời nâng `/lessons/:id/edit` thành occurrence-aware cho row đã có date (K3), và mở rộng `HttpError` đọc `{reason}` từ body (K7) để client phân biệt nguyên nhân lỗi lần đầu tiên (thay cho phân loại theo status-code mù).

## Requirements

- Functional:
  - `POST /api/classes/:id/sessions/:date/edit` — body zod ≥1 trong {topic?, time?, dur?, zoom?, moveDate?}; **`day` KHÔNG nhận từ client** (server suy từ moveDate, Mon=1). Apply WHERE `(class_id=? AND org_id=? AND date=? AND status='upcoming')` — **org predicate bắt buộc** như mọi write hiện hữu (lessonStatusAction :671-681, invoice :763-764).
  - `POST /api/classes/:id/sessions/:date/check-in` | `/cancel` — body PHẢI chính xác `{}` (precedent chống giả mạo kernel.ts:640-645); cùng WHERE shape; matrix kế thừa upcoming→completed|cancelled (:664-666).
  - Response `{updated:number, skipped:number}`: `updated` từ `.run().changes`; `skipped = preCount − updated` với pre-read COUNT là **advisory pre-read** (red-team High #4: hai statement, có race window — con số skipped chỉ thông tin, KHÔNG cam kết transactional; ngôn ngữ trong code+docblock ghi rõ "atomic UPDATE + advisory pre-read").
  - Phân biệt bucket-trống vs settled: trống (preCount=0) → **404** `{reason:"not-found"}`; có row nhưng updated=0 → **200** `{updated:0, skipped:N}`.
  - Lỗi khác: collision moveDate khi đích đã tồn tại bucket khác → pre-check **409** `{reason:"date-occupied"}`; class↔org mismatch → 404 đồng dạng; body sai schema → 400.
  - Pairing invariant pre-check y hệt lessonStatusAction (:661-663): join enrollment xác nhận các row thuộc đúng class yêu cầu trước UPDATE.
  - Validate `:date` param và `moveDate` bằng **roundtrip-guard lịch thật** (`parseStartDateStrict` từ packages/api — regex-only chấp nhận `2026-02-30`, red-team Medium #6), KHÔNG regex-pattern-only.
  - Legacy `/lessons/:id/edit` K3 — policy per-field CHỐT CỨNG (không để "chứng minh trong step"):
    - Row KHÔNG date → hành vi cũ byte-for-byte (full-replace 5 trường + conditional-write 409 :732-742).
    - Row CÓ date + body chứa `day` khác weekday-of-bucket → **409 `{reason:"use-occurrence-endpoint"}`** (đổi day sẽ phá bất biến date↔weekday — red-team High #2).
    - Row CÓ date, đổi time/dur/topic/zoom → **bucket-wide full-replace LWW**, WHERE `(class_id,org_id,date,status='upcoming')`, không giữ conditional-guard per-row (guard cũ pin ĐÚNG giá trị pre-read của MỘT row — áp lên bucket nhiều giá trị là mâu thuẫn; last-write-wins giữa 2 tab được plan.md Non-goals declare chủ ý). Bucket bất đồng `(time,dur)` phát hiện sau apply → 200 kèm warning field.
- Non-functional:
  - Idempotent-safe: cancel/check-in trên bucket settled-toàn-bộ → 200 `{updated:0, skipped:N}` (KHÔNG 404).
  - CSRF/JSON-only/org-scope tự phủ nhờ `kernel.use("*")` (:113-124) + **contract test source-text assert middleware xuất hiện TRƯỚC mọi `kernel.post(`** (coverage phụ thuộc trật tự đăng ký — red-team Medium #9).

## Architecture

Điểm móc nối với client không thuộc phase này (P4 mới gọi). Transport mở rộng liền đây vì là shared-layer:

```ts
// packages-side hợp đồng mới (contracts.ts):
occurrenceEditSchema = z.object({ topic?…, time?: /^\d{2}:\d{2}$/, dur?: int>0,
                                  zoom?…, moveDate?: ISO_DATE }).refine(≥1 field)
```

```ts
// apps/web/src/lib/kernel-load-state.ts — ADDITIVE:
export class HttpError extends Error { status; reason?: string } 
// postKernelCommand (repos/kernel.ts:201-219): try parse JSON body {reason}
//   ngay TRƯỚC throw — body-rác/không-JSON phải bỏ qua im lặng (test bắt buộc)
```

Classify `classifyWriteFailure` (:188-198) GIỮ NGUYÊN — reason là metadata bổ sung đi kèm HttpError, không thay bucket-kind logic của bus (mọi call mới vẫn qua command bus dispatch ⇒ refetch-after-write đúng MỘT lần/call).

## Related Code Files

- Modify: `apps/server/src/routes/kernel.ts` (3 route mới + K3 tại :704-749)
- Modify: `packages/api/src/contracts.ts` (`occurrenceEditSchema`, response type)
- Modify: `apps/web/src/lib/repos/kernel.ts` (parse reason tại postKernelCommand), `apps/web/src/lib/kernel-load-state.ts` (HttpError.reason?)
- Create: `apps/server/src/routes/kernel.occurrence.test.ts` (matrix đầy đủ)

## Implementation Steps

1. Tests-first kernel.occurrence.test.ts: bảng case matrix (Success Criteria) red; incl. co-tenant class protection (ngày trùng giữa 2 class của cùng org phải độc lập), scoped-org giữa 2 orgs, bucket trống vs settled, invalid-calendar-date `:date`/`moveDate` (2026-02-30) → 400.
2. Route `sessions/:date/edit`: roundtrip-validate `:date`, refine ≥1-field, pre-check moveDate occupied → 409, pre-read COUNT advisory, single guarded UPDATE, response `{updated(=changes), skipped=preCount−updated}`; server-side derive `day` từ moveDate.
3. Routes check-in/cancel `{}`-exact + counts + org predicate.
4. K3 policy per-field theo bảng Requirements (409 use-occurrence-endpoint cho day-change trên dated row; LWW bucket-wide cho các trường còn lại); divergent-bucket edge trả warning field.
5. HttpError.reason parse + test body rác (`"oops"` text / JSON lạ / empty).
6. Contract test CSRF ordering (`kernel.use("*"` trước mọi `kernel.post(` trong kernelRoutes source).
7. Gates xanh.

## Success Criteria

- [ ] Matrix: 200 updated=N · 200 updated=0 skipped=M · 404 not-found(bucket trống/class lạ/org lạ) · 409 date-occupied(move) · 409 use-occurrence-endpoint(day-change dated) · 400 schema/invalid-date · authenticated-correct-org only.
- [ ] Edit moveDate cũng ghi `day` mới (weekday đúng Mon=1 — dùng chung helper packages/api với P3 read-path, test chéo fixture).
- [ ] K3: non-dated row giữ conditional-409 cũ; dated-row topic edit đổi cả bucket; day-change bị chặn 409.
- [ ] Reason xuyên: HttpError mang reason từ các 409/404 mới; HTTP-status classification cũ không đổi.
- [ ] Bus vẫn refetch đúng 1 lần/call; CSRF ordering pin xanh.

## Risk Assessment

**R8 (HIGH) moveDate trùng khớp hành vi skeleton-đang-hiển-thị:** ngày mới trên lịch client tính theo chronology walk chứ không theo raw weekday-bag — signal: move một buổi rồi client v2 render lệch vị trí kỳ vọng; response: weekday-derivation DÙNG chung helper packages/api với P3 read-path (single source), test chéo fixture.
**R9 (MEDIUM) Settled-bucket ambiguity:** caller khó phân biệt "không tồn tại" vs "đã settled hết" — response: hai status 404/200-skipped tách bạch + tên field rõ ràng; P4 modal dùng đúng cặp này.
**R10 (LOW) Định dạng ngày lệch chuẩn 2 đầu:** web giữ `ISO_DATE_PATTERN` + roundtrip (:68-76), server import `parseStartDateStrict` từ packages/api — response: một single source ở shared pkg; web kept-là-alias giữ nguyên behavior file cũ.
