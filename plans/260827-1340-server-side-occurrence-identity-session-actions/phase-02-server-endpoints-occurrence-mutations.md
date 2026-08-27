---
phase: 2
title: "Server endpoint occurrence mutations + {reason} transport"
status: completed
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 2: Server endpoint occurrence mutations + {reason} transport

## Overview

Ba route mutation theo identity `(classId, date)` — edit / check-in / cancel — mỗi action là MỘT statement atomic `UPDATE … WHERE class_id=? AND date=?` thay thế mô hình N×(POST+GET) fan-out từng row (edit áp TOÀN BỘ rows của occurrence kể cả đã settled — kongming GO-D4; check-in/cancel giữ filter `status='upcoming'`, không bao giờ sửa history). Đồng thời nâng `/lessons/:id/edit` thành occurrence-aware cho row đã có date (K3), mở rộng `HttpError` đọc `{reason}` từ body, và mở kênh payload 2xx `{updated, skipped}` xuyên transport tới UI (red-team round-2 N2).

## Requirements

- Functional:
  - `POST /api/classes/:id/sessions/:date/edit` — body zod ≥1 trong {topic?, time?, dur?, zoom?, moveDate?}; **`day` KHÔNG nhận từ client** (server suy từ moveDate, Mon=1). Apply WHERE `(class_id=? AND org_id=? AND date=?)` **KHÔNG lọc status — dời/sửa occurrence là thao tác trên IDENTITY của cả buổi vật lý: rows completed/cancelled trong bucket cũng chuyển theo moveDate (tránh tách một buổi thành hai mốc chronology "ma", red-team round-2 N6/D4)** — chỉ check-in/cancel giữ `AND status='upcoming'`. Org predicate bắt buộc như mọi write hiện hữu (lessonStatusAction kernel.ts:660, invoice ~:765+).
  - Policy khai báo (Behavior Changes plan.md mục 6): edit-move-wholly là chủ ý; test mixed-state bucket (1 completed + 2 upcoming) assert CẢ ba row cùng dời ngày.
  - `POST /api/classes/:id/sessions/:date/check-in` | `/cancel` — body PHẢI chính xác `{}` (precedent `z.object({}).strict()` contracts.ts:198); WHERE `(class_id,org_id,date,status='upcoming')`; matrix kế thừa upcoming→completed|cancelled (~:690-700).
  - Response `{updated:number, skipped:number}`: `updated` từ `.run().changes`; `skipped = preCount − updated` với pre-read COUNT là **advisory pre-read** (red-team High #4: hai statement, có race window — con số skipped chỉ thông tin, KHÔNG cam kết transactional; ngôn ngữ trong code+docblock ghi rõ "atomic UPDATE + advisory pre-read").
  - Phân biệt bucket-trống vs settled: trống (preCount=0) → **404** `{reason:"not-found"}`; có row nhưng updated=0 → **200** `{updated:0, skipped:N}`.
  - Lỗi khác: collision moveDate khi đích đã tồn tại bucket khác → pre-check **409** `{reason:"date-occupied"}`; class↔org mismatch → 404 đồng dạng; body sai schema → 400. **Race sau unique-index (red-team round-2 N9): UPDATE moveDate thắng constraint vi phạm ở tab thua — catch lỗi driver KHÔNG-TYPED → recheck đích → vẫn occupied ⇒ 409 `{reason:"date-occupied"}`, ngược lại rethrow (mirror pattern "never parse SQLite error strings" kernel.ts:507-509,:535-546); test đẩy dup-data + constraint active chứng minh mapped-409 thay vì 500/outcome-unknown.**
  - Pairing invariant pre-check y hệt lessonStatusAction (kernel.ts:660): join enrollment xác nhận các row thuộc đúng class yêu cầu trước UPDATE.
  - Validate `:date` param và `moveDate` bằng **roundtrip-guard lịch thật** (`parseStartDateStrict` từ packages/api — regex-only chấp nhận `2026-02-30`, red-team Medium #6), KHÔNG regex-pattern-only.
  - Legacy `/lessons/:id/edit` K3 — policy per-field CHỐT CỨNG, ALIGN cùng chính sách all-rows với occurrence edit (kongming GO-D4: không để hai đường edit một bucket mà một đường sửa được settled, một đường không):
    - Row KHÔNG date → hành vi cũ byte-for-byte (full-replace 5 trường + conditional-write 409, handler :718+).
    - Row CÓ date + body chứa `day` khác weekday-of-bucket → **409 `{reason:"use-occurrence-endpoint"}`** (đổi day sẽ phá bất biến date↔weekday — red-team High #2).
    - Row CÓ date, đổi time/dur/topic/zoom → **bucket-wide full-replace LWW trên TOÀN BỘ rows `(class_id,org_id,date)` không lọc status**, không giữ conditional-guard per-row (guard cũ pin ĐÚNG giá trị pre-read của MỘT row — áp lên bucket nhiều giá trị là mâu thuẫn; last-write-wins giữa 2 tab được plan.md Non-goals declare chủ ý). (Bucket bất đồng `(time,dur)` sau apply không thể tồn tại dưới LWW bucket-wide — warning field bị thu gọn tại review F7.)
    - Contract-test pin bucket-wide effect qua đường legacy này (red-team round-2 N7): assert zoom/topic của sid khác trong bucket cũng bị replace — bảo vệ hành vi đã declare khỏi regression vô tình.
- Non-functional:
  - Idempotent-safe: cancel/check-in trên bucket settled-toàn-bộ → 200 `{updated:0, skipped:N}` (KHÔNG 404).
  - CSRF/JSON-only/org-scope tự phủ nhờ `kernel.use("*")` (kernel.ts:117) + **contract test source-text assert middleware xuất hiện TRƯỚC mọi `kernel.post(`** (coverage phụ thuộc trật tự đăng ký — red-team Medium #9).
  - **Schema caps inheritance (red-team round-2 N15): `occurrenceEditSchema` tái sử dụng/đối đẳng TỪNG constraint của `lessonEditSchema` (contracts.ts:209-224) cho field dùng chung — `.strict()`, `zoom` max(2048) + refine `""|https://` (scheme injection dừng ở boundary, docblock schema), `topic` max(500), `dur` cap 1440**; sketch dưới chỉ là shape, không phải spec đầy đủ. Test case: zoom non-https → 400 trên CẢ occurrence edit lẫn legacy /lessons/:id/edit dated.

## Architecture

Điểm móc nối với client không thuộc phase này (P4 mới gọi). Transport mở rộng liền đây vì là shared-layer:

```ts
// packages-side hợp đồng mới (contracts.ts) — SHAPE ONLY; implementation PHẢI
// kế thừa đầy đủ .strict()/zoom-refine-https/max-caps từ lessonEditSchema (:209-224):
occurrenceEditSchema = z.object({ topic?…, time?: /^\d{2}:\d{2}$/, dur?: int>0,
                                  zoom?…, moveDate?: ISO_DATE }).refine(≥1 field)
```

```ts
// apps/web/src/lib/kernel-load-state.ts — ADDITIVE:
export class HttpError extends Error { status; reason?: string } 
// postKernelCommand (repos/kernel.ts:221, json.id tại :237-238):
//   (1) error path: parse body {reason} TRƯỚC throw — body-rác/không-JSON bỏ qua
//       im lặng (test bắt buộc);
//   (2) 2xx path (red-team round-2 N2): KHÔNG còn trả bare id — trả envelope
//       additive `{ id?: string, updated?: number, skipped?: number }` parsed từ
//       body; endpoint cũ trả {id} thì envelope chỉ có id — caller cũ không vỡ.
```

```ts
// repos/kernel.ts thread-through (vẫn cùng change-set N2 — bus deps + runOne):
deps.postCommand: (action) => Promise<KernelWriteEnvelope>   // thay string|undefined :332
KernelCommandResult thêm optional `payload?: { updated?, skipped? }`
// classifyWriteFailure (:208) GIỮ NGUYÊN bucket-kind logic;
// test roundtrip: body 2xx kiểu cũ {id} → envelope.id có giá trị, payload undefined.
```

## Related Code Files

- Modify: `apps/server/src/routes/kernel.ts` (3 route mới + K3 tại :718+)
- Modify: `packages/api/src/contracts.ts` (`occurrenceEditSchema`, response/envelope type)
- Modify: `apps/web/src/lib/repos/kernel.ts` (postKernelCommand envelope 2xx + thread payload qua bus deps/runOne/dispatch — N2), `apps/web/src/lib/kernel-load-state.ts` (HttpError.reason?)
- Create: `apps/server/src/routes/kernel.occurrence.test.ts` (matrix đầy đủ)

## Implementation Steps

1. Tests-first kernel.occurrence.test.ts: bảng case matrix (Success Criteria) red; incl. co-tenant class protection (ngày trùng giữa 2 class của cùng org phải độc lập), scoped-org giữa 2 orgs, bucket trống vs settled, **mixed-state bucket edit dời trọn bộ**, invalid-calendar-date `:date`/`moveDate` (2026-02-30) → 400, zoom non-https → 400.
2. Route `sessions/:date/edit`: roundtrip-validate `:date`, refine ≥1-field, pre-check moveDate occupied → 409 (+ catch-recheck cho constraint-race N9), pre-read COUNT advisory, single guarded UPDATE **toàn-bucket không lọc status**, response `{updated(=changes), skipped=preCount−updated}`; server-side derive `day` từ moveDate.
3. Routes check-in/cancel `{}`-exact + counts + org predicate + status='upcoming' filter (history bất biến).
4. K3 policy per-field theo bảng Requirements (409 use-occurrence-endpoint cho day-change trên dated row; LWW bucket-wide all-rows cho các trường còn lại); (bucket bất đồng (time,dur) sau apply không thể tồn tại dưới LWW bucket-wide nên không cần warning field — thu gọn tại review F7); contract-test pin bucket-wide effect.
5. HttpError.reason parse + test body rác (`"oops"` text / JSON lạ / empty).
6. Transport envelope N2: postKernelCommand 2xx-trả-envelope {id,updated?,skipped?}; bus deps.postCommand type widen; runOne giữ payload vào result; dispatch trả payload; test roundtrip envelope legacy-{id} không vỡ.
7. Contract test CSRF ordering (`kernel.use("*"` trước mọi `kernel.post(` trong kernelRoutes source).
8. Gates xanh.

## Success Criteria

- [x] Matrix: 200 updated=N · 200 updated=0 skipped=M · 404 not-found(bucket trống/class lạ/org lạ) · 409 date-occupied(move, cả path catch-recheck post-constraint) · 409 use-occurrence-endpoint(day-change dated) · 400 schema/invalid-date/non-https-zoom · authenticated-correct-org only.
- [x] Edit moveDate cũng ghi `day` mới (weekday đúng Mon=1 — dùng chung helper packages/api với P3 read-path, test chéo fixture) VÀ mixed-state bucket: rows completed/cancelled cùng dời theo (assert count per-status sau move).
- [x] K3: non-dated row giữ conditional-409 cũ; dated-row topic edit đổi cả bucket (all-rows incl. settled); day-change bị chặn 409; pin bucket-wide-effect contract test xanh.
- [x] Reason xuyên: HttpError mang reason từ các 409/404 mới; HTTP-status classification cũ không đổi.
- [x] Envelope N2: dispatch() trả payload `{updated, skipped}` cho endpoint mới; endpoint legacy `{id}`-only vẫn parse sạch; bus refetch đúng 1 lần/call; CSRF ordering pin xanh.

## Risk Assessment

**R8 (HIGH) moveDate trùng khớp hành vi skeleton-đang-hiển-thị:** ngày mới trên lịch client tính theo chronology walk chứ không theo raw weekday-bag — signal: move một buổi rồi client v2 render lệch vị trí kỳ vọng; response: weekday-derivation DÙNG chung helper packages/api với P3 read-path (single source), test chéo fixture.
**R9 (MEDIUM) Settled-bucket ambiguity:** caller khó phân biệt "không tồn tại" vs "đã settled hết" — response: hai status 404/200-skipped tách bạch + tên field rõ ràng; P4 modal dùng đúng cặp này.
**R10 (LOW) Định dạng ngày lệch chuẩn 2 đầu:** web giữ `ISO_DATE_PATTERN` + roundtrip (:68-76), server import `parseStartDateStrict` từ packages/api — response: một single source ở shared pkg; web kept-là-alias giữ nguyên behavior file cũ.
