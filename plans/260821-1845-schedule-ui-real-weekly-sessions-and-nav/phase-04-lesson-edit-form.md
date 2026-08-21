---
phase: 4
title: "Form sửa buổi trong LessonModal: echo đủ 5 field, action lesson-edit qua command bus"
status: pending
priority: P1
effort: "2h30"
dependencies: [2]
---

# Phase 4: Form sửa buổi (echo đủ 5 field) + action `lesson-edit`

## Overview

DOD M1 dòng 42 ("Sửa/hủy buổi không làm hỏng buổi khác") + hand-off #55 mục (d): `POST
/api/lessons/:id/edit` là upcoming-only, **full-replace 5 field** với optimistic concurrency
(`apps/server/src/routes/kernel.ts:471-516`; contracts.ts:157-164 WARNING "omitted optional
fields reset to \"\""). Form sửa trong LessonModal phải echo ĐỦ 5 field (day/time/dur/topic/zoom)
init từ lesson hiện tại, validate client bằng chính `lessonEditSchema` từ `@teacher-os/api/contracts`
(web đã có dep zod), submit qua command bus với action type MỚI `lesson-edit` (tránh collision
`"add-lesson"/"edit-lesson"` syllabus — `data-actions.ts:59-81`, hand-off mục (c)).

## Requirements

- Functional:
  - `data-actions.ts`: thêm variant vào `KernelAction` union:
    `{ type: "lesson-edit"; lessonId: string; payload: { day: number; time: string; dur: number; topic: string; zoom: string } }`.
    KHÔNG đổi/sửa bất kỳ variant nào đang có.
  - `repos/kernel.ts kernelCommand()` (switch dòng 37-127): thêm case `"lesson-edit"` →
    `{ path: \`/api/lessons/${action.lessonId}/edit\`, body: { ...action.payload } }` — body
    luôn đủ 5 key (day/time/dur/topic/zoom), mirror comment của check-in về body shape.
  - Component mới `apps/web/src/components/schedule/lesson-edit-form.tsx`:
    props `{ lesson: Lesson; dateIso: string; busy: boolean; disabled: boolean; onSubmit(
    values: LessonEditValues): void; onCancel(): void }` — form 5 field:
    day (select 7 option dùng `dayNames` từ mock-data, value 1-7), time (input type="time" hoặc
    text pattern HH:MM), dur (input number, phút), topic (input text), zoom (input text,
    placeholder "https://… hoặc để trống"). Init state = 5 giá trị của `lesson` (echo đủ —
    chống full-replace wipe).
  - Validation client: trước khi gọi onSubmit, `lessonEditSchema.safeParse(values)`; invalid →
    disable nút Lưu + hiện message lỗi field đầu tiên (không submit). Import schema từ
    `@teacher-os/api/contracts` (DRY — không tự viết regex thứ hai; TIME_REGEX/day bounds đã pin ở đó).
  - `lesson-modal.tsx`: với lesson `status === "upcoming"`, thêm nút "Sửa buổi" (cùng hàng,
    trước "Hủy buổi"; `disabled={busy || isPending(lesson.id)}` — mirror pattern dòng 68-92).
    Click → state `editing = true` → render `LessonEditForm` thay phần nội dung (giữ title);
    "Hủy" trong form → `editing = false` (không submit). **Reset `editing` (red-team #3):**
    modal always-mounted (hooks trước early-return `lesson-modal.tsx:14-20`) → PHẢI
    `useEffect(() => { setEditing(false) }, [lessonId])` + reset khi onClose — mirror doctrine
    grade-modal `kernel-runtime.contract.test.ts:319-326` ("stays mounted across lessons; without
    this reset, editing B would silently show A's form"); render form CHỈ khi
    `editing && lesson.status === "upcoming"`.
  - **Submit architecture (red-team #2 — KHÔNG dùng `act()` fire-and-close cho form):**
    `act()` hiện tại (`lesson-modal.tsx:24-27`: `void run(...); onClose()`) đóng modal VÔ ĐIỀU
    KIỆN trước khi POST resolve — chấp nhận được cho check-in/cancel (idempotent, không input),
    KHÔNG chấp nhận cho form có input người dùng. Form sửa phải: `const outcome = await
    dispatch({ type: "lesson-edit", ... })` (hoặc await `run(...)` nếu run trả outcome — kiểm
    `use-direct-kernel-action.ts` khi implement; ưu tiên pattern của write-modals
    `components/modals/add-syllabus-modal.tsx` / grade-modal) → **chỉ `onClose()` khi outcome
    `refreshed`**; `definite-failure`/`outcome-unknown` → GIỮ form + input nguyên vẹn, hiện
    thông báo lỗi (tái dùng `KernelSubmitNotice` nếu fit, hoặc inline message); block nút đóng
    khi đang submit (`onClose={saving ? () => undefined : onClose}` — mirror
    `kernel-runtime.contract.test.ts:105-115` "No unconditional close after the await — failure
    keeps the modal"). Check-in/cancel giữ nguyên act() (không đổi).
  - **Concurrency semantics (red-team #1 — sửa claim sai):** endpoint edit pre-read values
    trong cùng request (`kernel.ts:479-508`), client KHÔNG gửi expected-old → 2 tab sửa tuần tự
    = **last-writer-wins im lặng** (KHÔNG 409 cho edit-vs-edit). 409 chỉ xảy ra khi status
    không còn upcoming (check-in/cancel ở nơi khác) — khi đó giữ form, toast giải thích buổi
    đã đổi trạng thái, snapshot refresh làm nút sửa biến mất. Hạn chế last-writer-wins được
    post lên issue #56 cùng evidence (fix thật đòi server gửi old-values — ngoài scope, issue riêng).
  - Sau thành công: bus refetch `['kernel']` (built-in trong `createKernelCommandBus`) →
    grid/modal re-render từ snapshot mới — lesson hiện đúng cột/giờ mới không cần code thêm.
  - **Coercion (red-team #15):** state form giữ STRING (giá trị DOM: `<option>`/`<input
    type="number">` onChange đều trả string); tại submit map `day: Number(day), dur: Number(dur)`
    (time/topic/zoom giữ string) RỒI `lessonEditSchema.safeParse` — không đổi contracts
    (`z.number().int()` tại `contracts.ts:167,169` đòi number).
- Non-functional:
  - KHÔNG đổi server/API/contracts; KHÔNG đổi query keys; mọi write qua 1 command bus.
  - Form state là local `useState` (per-modal lifetime — mở modal khác reset; không thêm state
    module-scope).
  - Nút Lưu disable khi `busy || disabled || !valid` (double-submit guard = bus inFlight +
    pendingKey hiện có).

## Architecture

Data flow: LessonModal (upcoming) → nút "Sửa buổi" → LessonEditForm echo 5 field (state string)
→ user sửa → submit map `Number(day)/Number(dur)` → client `lessonEditSchema.safeParse` →
await `dispatch({ type: "lesson-edit", lessonId, payload })` → `kernelCommand` map → POST
`/api/lessons/:id/edit` (đủ 5 field, full-replace) → server pre-read + upcoming-guard + WHERE →
2xx → bus refetch `['kernel']` → `refreshed` → **chỉ lúc này** `onClose()` + toast success;
failure/unknown → form giữ nguyên + thông báo lỗi, KHÔNG đóng. UI read sau refetch qua
`useData()` — lesson chuyển cột/day mới do grid filter theo `l.day` (phase 2 wiring `dateIso`
không đổi).

## Related Code Files

- Create: `apps/web/src/components/schedule/lesson-edit-form.tsx`
- Modify: `apps/web/src/lib/data-actions.ts` (thêm 1 variant vào union — KHÔNG đụng variant cũ),
  `apps/web/src/lib/repos/kernel.ts` (thêm 1 case vào `kernelCommand`), `apps/web/src/components/schedule/lesson-modal.tsx`
  (nút "Sửa buổi" + mount form), `apps/web/src/lib/repos/kernel.test.ts` (test mapping mới trong
  describe `kernelCommand` dòng 295), `apps/web/src/lib/kernel-runtime.contract.test.ts` (thêm
  positive assertions cho form wiring — KHÔNG sửa vùng phase 2 đã cập nhật)
- Delete: (không)

## Implementation Steps (TDD)

1. **Tests Before**:
   a. `repos/kernel.test.ts` — thêm test trong describe `kernelCommand`: `kernelCommand({
      type: "lesson-edit", lessonId: "l1", payload: { day: 3, time: "19:00", dur: 90, topic: "T", zoom: "" } })`
      → `{ path: "/api/lessons/l1/edit", body: { day: 3, time: "19:00", dur: 90, topic: "T", zoom: "" } }`
      (đủ 5 key — mirror style test "check-in and cancel-lesson…" dòng 413). Đỏ: type chưa có → TS
      không lối vì test viết sau khi… KHÔNG — viết test trước sẽ fail compile; chấp nhận đỏ
      compile-counts-as-red, hoặc viết test + variant union cùng bước 1 (union là type-only,
      chưa có runtime mapping) — chọn cách 2: thêm variant union NGAY bước 1 để test chạy và đỏ
      ở runtime assert (kernelCommand trả undefined → toEqual fail).
   b. `kernel-runtime.contract.test.ts` — thêm assertions: lesson-modal `toMatch(/Sửa buổi/)` ,
      `toMatch(/lesson-edit-form/)`, `toMatch(/disabled=\{busy \|\| isPending\(lesson\.id\)\}/)`
      (đã có — giữ); **`toMatch(/useEffect\(/)` cho reset editing** (mirror khối grade-modal
      319-326); **không khớp `void run` fire-and-close cho edit** — cụ thể: source lesson-modal
      phải có await-then-close-on-refreshed (khóa dạng `.not.toMatch(/onClose\(\);[\s\S]{0,80}await/)`
      hoặc assertion tương đương pin "no unconditional close for the edit submit" — chọn dạng
      testable nhất khi viết); `lesson-edit-form.tsx` (readSrc) `toMatch(/lessonEditSchema/)` ,
      `toMatch(/dayNames/)` , `toMatch(/Number\(/)` (coercion), **`.not.toMatch(/\/08\//)`**
      (red-team #12 — chống fake-date concat, mirror lesson-modal lock `:201-202`);
      `data-actions.ts` `.toMatch(/"lesson-edit"/)` pin tên mới. Đỏ: form chưa tồn tại.
2. **Refactor/Implement**:
   a. `data-actions.ts` variant mới + `kernelCommand` case mới (đúng Requirements).
   b. `lesson-edit-form.tsx`: component per Requirements; style input/select theo pattern các
      form modal sẵn có (xem `apps/web/src/components/modals/add-syllabus-modal.tsx` cho input
      classes/label conventions).
   c. `lesson-modal.tsx`: state `editing` + **useEffect reset theo lessonId/onClose**, nút
      "Sửa buổi" (chỉ khi upcoming), mount form, wire submit qua await-dispatch, close chỉ khi
      `refreshed`, giữ form khi fail; truyền `dateIso` xuống form nếu cần hiển thị ngữ cảnh
      (optional).
3. **Tests After** — `pnpm -F web test` xanh: mapping test + contract assertions mới pass;
   toàn bộ test cũ pass (describe "direct actions…" dòng 211+ không đổi). Verify thủ công
   (dev): sửa time 19:00 → 20:00 → grid block đổi thứ tự trong cột; sửa day 3 → 5 → block
   sang cột T5 (sau refetch); sửa buổi completed → nút không hiện; để trống zoom → lưu OK
   (zoom = "").
4. **Regression Gate** — `pnpm test` && `pnpm check-types` && `pnpm exec biome check .` &&
   `pnpm build`.

## Success Criteria

- [x] Test mapping `kernelCommand("lesson-edit")` pass — path đúng, body đủ 5 key, day/dur là number.
- [x] Form echo đủ 5 field từ lesson; nút Lưu disable khi schema invalid (day 0/8, time "9:5",
  dur 0/âm, zoom "http://") hoặc busy; coercion `Number()` cho day/dur trước safeParse.
- [x] Submit thành công (refreshed) → toast "Đã sửa buổi học." + modal đóng + grid/modal phản ánh
  day/time/dur/topic/zoom mới.
- [x] Submit THẤT BẠI (definite-failure/unknown) → form + input GIỮ NGUYÊN + thông báo lỗi
  (doctrine "close only on refreshed"); không mất dữ liệu người dùng đã gõ.
- [x] State `editing` reset khi đóng modal/đổi lesson — mở buổi completed sau buổi upcoming không
  hiện form sửa (useEffect reset, mirror grade-modal doctrine).
- [x] Buổi không-upcoming: không có nút "Sửa buổi" (server cũng chặn — defense in depth).
- [x] Edit-vs-edit 2 tab = last-writer-wins (đã ghi nhận issue); 409 status-race (buổi đã
    check-in nơi khác) → form giữ + thông báo + snapshot refresh.
- [x] Action names `"add-lesson"`/`"edit-lesson"` (syllabus) nguyên vẹn; tên mới là `"lesson-edit"`.
- [x] `lesson-edit-form.tsx` có negative lock `/08` (không fake-date).
- [x] 4 gate commands xanh.

## Risk Assessment

- **Full-replace wipe nếu form thiếu field** (contracts WARNING) — mitigation cấu trúc: TS type
  `LessonEditValues` = chính `z.infer<typeof lessonEditSchema>`; form init đủ 5; mapping test
  assert đủ 5 key. Signal: topic/zoom bị rỗng sau edit → grep body mapping thiếu key.
- **Nhầm tên action với syllabus** — tên `lesson-edit` + contract assertion pin; TS union là
  discriminated nên nhầm tên là compile error.
- **Input type="time" browser behavior** (giá trị "19:00" ok nhưng seconds "19:00:00" trên một
  số browser) → nếu gặp, dùng text input pattern + TIME_REGEX validate (pre-decided; signal:
  test thủ công value có ":00:00").
- **Form state sống sót qua lesson khác** (red-team #3: `editing` boolean ở modal luôn-mounted
  sống sót qua close/reopen — `key` trên form con KHÔNG reset được boolean này) → bắt buộc
  useEffect reset theo lessonId + khi onClose (mirror grade-modal `kernel-runtime.contract.test.ts:319-326`);
  form internals tự reset theo React lifetime khi form unmount. Signal: mở form buổi A, đóng,
  mở buổi completed B → nếu form hiện ra là bug này.
- **Fire-and-close mất input** (red-team #2) — đã đổi architecture sang await + close-on-refreshed;
  check-in/cancel giữ act() vì idempotent không input. Signal: submit fail mà modal đóng →
  regress doctrine, contract assertion phải đỏ.
- **Assumption "bus refetch đủ để UI cập nhật"** — pattern đã được check-in/cancel chứng minh
  (dashboard/schedule hiện tại); KHÔNG thêm optimistic update thủ công (KISS, tránh state lệch).
