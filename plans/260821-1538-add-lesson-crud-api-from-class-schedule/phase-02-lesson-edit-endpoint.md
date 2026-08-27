---
phase: 2
title: "Lesson edit endpoint with conditional-write guard"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 02: Lesson edit endpoint with conditional-write guard

## Overview

`POST /lessons/:id/edit` trong kernel.ts — sửa buổi upcoming (day/time/dur/topic/zoom, full-replace), copy nguyên mẫu guard của `lessonStatusAction` (apps/server/src/routes/kernel.ts:312-352): pre-read qua `findLessonAction` cho lỗi thân thiện (404/409), UPDATE điều kiện với `id + orgId + status='upcoming'` trong WHERE + RETURNING là guard authoritative — 0 rows → 409. Lesson completed/cancelled là history bất biến.

## Requirements

- [x] Route `POST /lessons/:id/edit` đăng ký trong kernel.ts (kế thừa middleware Origin + JSON content-type, kernel.ts:42-53).
- [x] Body qua `lessonEditSchema` (phase 1): invalid → 400; strict — key lạ (`status`, `type`) → 400.
- [x] Full-replace: field không gửi lấy default zod (`topic`/`zoom` → `""`).
- [x] 404 unknown id hoặc id thuộc org khác (tenant predicate khiến 2 case không phân biệt được).
- [x] 409 `"lesson enrollment mismatch"` khi `enrollmentClassId !== classId` (mirror kernel.ts:327-329).
- [x] 409 `"lesson is not upcoming"` khi status ≠ upcoming (sau check-in, sau cancel) — cả pre-read lẫn UPDATE 0 rows.
- [x] Chỉ đúng 1 row bị UPDATE; lesson khác của cùng enrollment/class không đổi (M1 DOD roadmap:42).
- [x] Idempotent replay: cùng body gọi 2 lần → đều 200 (vẫn upcoming), state như nhau.
- [x] Optimistic concurrency (red-team F2): old values pre-read nằm trong WHERE của UPDATE — edit/check-in concurrent commit giữa pre-read và UPDATE → 0 rows → 409 `"lesson changed or is not upcoming"` (không có lost update im lặng giữa hai edit khác body).

## Architecture

**Flow (copy `lessonStatusAction` kernel.ts:312-352 + optimistic-concurrency mở rộng — red-team F2):**

1. `ctx` check → 401; `readBody(c, lessonEditSchema)` → 400.
2. Pre-read org-scoped **mở rộng select thêm `day, time, dur, topic, zoom`** (dùng inline select hoặc helper riêng bên cạnh `findLessonAction` kernel.ts:129-141 — innerJoin enrollment, org-scoped): missing → 404; `enrollmentClassId !== classId` → 409 mismatch; `status !== "upcoming"` → 409.
3. Authoritative conditional write — guard lặp trong WHERE. **Quan trọng (F2): guard `status='upcoming'` một mình KHÔNG chống được edit-vs-edit lost update** (edit không đổi cột guard, hai edit concurrent khác body đều match → last-writer-wins im lặng, khác hẳn check-in nơi statement ghi chính cột guard). Fix: đưa GIÁ TRỊ PRE-READ vào WHERE — optimistic concurrency không cần schema/etag:

```ts
// pre là row pre-read (day/time/dur/topic/zoom/status từ bước 2).
// Old values trong WHERE = optimistic concurrency: nếu một edit/check-in khác
// commit giữa pre-read và UPDATE, WHERE không match → 409 thay vì lost update
// im lặng (giữ parity guard semantics với check-in — red-team F2).
const updated = await db
	.update(lesson)
	.set({ day: body.day, time: body.time, dur: body.dur, topic: body.topic, zoom: body.zoom })
	.where(
		and(
			eq(lesson.id, lessonId),
			eq(lesson.orgId, ctx.orgId),
			eq(lesson.status, "upcoming"),
			eq(lesson.day, pre.day),
			eq(lesson.time, pre.time),
			eq(lesson.dur, pre.dur),
			eq(lesson.topic, pre.topic),
			eq(lesson.zoom, pre.zoom),
		),
	)
	.returning({ id: lesson.id });
if (updated.length === 0) {
	return c.json({ error: "lesson changed or is not upcoming" }, 409);
}
return c.json({ ok: true });
```

**Test limitation ghi nhận (F2):** cửa sổ race pre-read→UPDATE không ép được qua HTTP tuần tự trong test — guard là defense-in-depth, xác nhận bằng code review + property: replay cùng body vẫn idempotent 200 (sau edit đầu, pre-read trả giá trị MỚI khớp chính body replay → WHERE match); hai edit khác body tuần tự = 200 rồi 200 (last-writer-wins tuần tự — chủ đích).

Không đặt trong `lessonStatusAction` (signature khác: body schema + set fields khác) — viết handler riêng, đặt cạnh `/lessons/:id/check-in`/`cancel` (kernel.ts:354-360). Chỉ lesson row được viết — counter derive ở web (invariant 6/7), đúng convention "chỉ ghi 1 row" của Wave 4 (kernel.ts:306-311).

**Tại sao guard WHERE đủ cho "không làm hỏng buổi khác":** UPDATE single-row theo `id` + orgId; không có statement nào chạm lesson khác trong cùng request. Sibling-untouched được chứng minh bằng test so sánh snapshot before/after.

**Cancel:** không đụng code — `POST /lessons/:id/cancel` đã có (kernel.ts:358-360); phase này chỉ thêm test sibling cho cancel.

## Related Code Files

| File | Change |
|---|---|
| apps/server/src/routes/kernel.ts | THÊM handler `POST /lessons/:id/edit` (sau :360) |
| apps/server/src/kernel.test.ts | THÊM describe "lesson edit" (happy path, 404/409 matrix, guards, siblings, replay) |

Không đổi: contracts.ts (phase 1 đã thêm `lessonEditSchema`), packages/db, apps/web (wiring edit UI thuộc #56).

## Implementation Steps

**(A) Characterization tests — pin check-in/cancel guard hiện có (XANH trước khi thêm route):**

1. Describe "lesson edit" trong kernel.test.ts, setup: `createClass` + `addStudent({classId})` (phase 1 giờ sinh sẵn lessons) hoặc `insertLesson` cho adversarial rows. Characterization: POST `/api/lessons/:id/check-in` trên lesson upcoming → 200; lần 2 → 409 (shape có sẵn :1456-1484). Chạy `pnpm test` — xanh.

**(B) New-behavior tests fail-first:**

2. Happy path: edit lesson (sinh từ generation hoặc `insertLesson`) với `{day: 4, time: "18:30", dur: 120, topic: "Speaking", zoom: "https://zoom.us/j/x"}` → 200; snapshot row mới đúng 5 field; **mọi lesson KHÁC byte-đối xứng before/after** (so sảng toàn mảng lessons lọc trừ id này — bằng chứng DOD "sửa không làm hỏng buổi khác").
3. 404: id không tồn tại (`/api/lessons/nope/edit`); org B edit lesson org A → 404 và snapshot org A unchanged (mirror cross-org :1582-1629).
4. 409: sau check-in (completed) → edit 409; sau cancel (cancelled) → edit 409; enrollment mismatch (insertLesson với enrollment của lớp khác — mirror :1520-1540) → 409.
5. Guards: no Origin → 403; form content-type → 415; extra key `{status:"completed"}` → 400; thiếu field bắt buộc (thiếu `day`) → 400; body `{}` → 400 (day/time/dur required); **boundary contract (red-team S1/S3): `topic` 501 ký tự → 400; `zoom: "javascript:alert(1)"` → 400; `zoom: "not-a-url"` → 400; `zoom: "https://zoom.us/j/x"` → 200; `zoom: ""` (omit) → 200 + wipe về ""**.
6. Full-replace defaults: edit chỉ `{day, time, dur}` → topic/zoom thành `""` (dù trước có giá trị).
7. Replay: cùng body edit 2 lần → 200/200, state giống hệt.
8. Cancel sibling: cancel 1 lesson trong N → các lesson khác unchanged (DOD "hủy không làm hỏng buổi khác").
9. Chạy `pnpm test` — các test edit fail (route chưa tồn tại → 404 thay vì 200).

**(C) Implement:**

10. kernel.ts: handler mới theo Architecture (đặt sau `/lessons/:id/cancel` :360, import `lessonEditSchema` thêm vào import block :2-12).
11. Chạy `pnpm test` — toàn bộ xanh.

**(D) Regression gate:**

12. `pnpm test` && `pnpm exec biome check .` && `pnpm check-types` && `pnpm build`.

## Success Criteria

- [x] Toàn bộ test matrix (B) xanh: 200 happy + row updated, 404 unknown/foreign-org, 409 not-upcoming (sau check-in VÀ sau cancel), 409 enrollment mismatch, 403/415/400 guards, 400 thiếu field.
- [x] Test siblings: sau edit và sau cancel, mọi lesson khác unchanged (DOD evidence).
- [x] Replay idempotent: 2 lần 200, state trùng.
- [x] Gate (D) 4 lệnh xanh.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Quên guard trong WHERE, chỉ dựa pre-read (check-then-act race) | Trung bình | Cao — 2 tab concurrent cùng sửa/check-in | Copy nguyên snippet có RETURNING + 0 rows → 409; comment như kernel.ts:334-336 |
| Edit vô tình cho status/type (làm hỏng invariant 6/7) | Thấp | Cao | `.strict()` trên lessonEditSchema — test extra key → 400 |
| Sửa nhiều row hơn 1 (WHERE thiếu id/org) | Thấp | Cao | Code review snippet + sibling test byte-đối-xứng |
| Route đứng ngoài middleware CSRF | Thấp | Cao | Đăng ký trực tiếp trên `kernel` (không sub-router riêng) — test no-Origin 403 xác nhận |
