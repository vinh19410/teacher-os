---
phase: 2
title: "Phase 2: Server — enroll tạo invited + accept/cancel + guards"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Server — enroll tạo invited + accept/cancel + guards

## Context Links

- [plan.md](./plan.md) · [Phase 1](./phase-01-db-contract.md) · [Scout enrollment](./reports/scout-report-enrollment.md)
- Code hiện trạng: `apps/server/src/routes/kernel.ts:601-672` (enroll), `:512-597` (POST /api/students), `:714-725` (assignments roster check), `:1433-1484` (POST /invoices), `:564-566` (invariant comment), `apps/server/src/routes/snapshot.ts:146-148, 295-300`

## Overview

Đổi behavior server theo D1+D2: enroll (cả 2 đường vào) chỉ tạo enrollment `invited`, KHÔNG sinh package/lessons. Thêm: `POST /api/enrollments/:enrollmentId/accept` (seam portal + nút Kích hoạt của teacher dùng chung — D4), `DELETE /api/enrollments/:enrollmentId` chỉ cho invited (D5). Guard: chặn tạo hóa đơn và gán bài tập cho enrollment invited. Snapshot trả kèm `status`.

## Key Insights

- Enroll hiện tạo enrollment + `sessionPackage` (status `"active"`) + `generateScheduleLessons(...)` trong MỘT `db.batch` (kernel.ts:645-669). Logic sinh package/lessons được dời sang accept, không viết lại.
- Idempotency của accept KHÔNG thể dùng check-then-batch (red-team #5): hai request song song cùng đọc `invited` → batch sau đâm unique index `session_package_enrollment_uq` (`packages/db/src/schema/session-package.ts:45`) → 500. Phải dùng CAS: UPDATE có điều kiện đứng đầu batch, hoặc bắt unique-violation → 200. Chuẩn TOCTOU của repo xem `kernel.ts:1044-1047` (predicate trong WHERE).
- `POST /invoices` (kernel.ts:1433-1484) hiện chỉ validate enrollment theo `(id, orgId)`, KHÔNG đọc status — nếu không guard sẽ tạo được hóa đơn cho học viên chưa đồng ý (red-team #3).
- Assignments route (kernel.ts:714-725) validate `studentIds ⊆ enrollment` không lọc status — nếu không guard, bài tập gán được cho học viên invited (red-team #8).
- Schedule lớp là IMMUTABLE (không có class-edit endpoint, `contracts.ts:66`); đầu vào có thật có thể đổi giữa mời và accept là `tuitionFee` (`POST /classes/:id/tuition-fee`, kernel.ts:999) → package price derive theo fee TẠI THỜI ĐIỂM accept là hành vi chủ đích, pin bằng test (red-team #11).
- Red-team #6: `packages/api/src/skeleton.ts` là module date-math/backfill thuần, chỉ nhìn thấy lesson rows — enrollment invited (0 lesson) vô hình với nó, KHÔNG có gì để sửa. Việc thật là: cập nhật invariant comment `kernel.ts:564-566` ("an enrollment can never exist without its generated lesson series" — không còn đúng với invited) và các test parity/assert liên quan.
- `lesson-date-integration.test.ts:2-3,108-115` có premise "dates stamped at enrollment time" — bị đảo thành "at accept time"; ~34 chỗ `addStudent({classId})` trong `kernel.test.ts` cần helper chung `addActiveStudent` (red-team #13).

## Requirements

- [ ] `POST /api/classes/:id/enroll` tạo enrollment `status = "invited"`, batch KHÔNG còn tạo package/lessons; 409 trùng giữ nguyên
- [ ] `POST /api/students` (nhánh có `classId`) tạo enrollment `invited`, không sinh package/lessons
- [ ] `POST /api/enrollments/:enrollmentId/accept`: `invited`→`active` + sinh đúng 1 package + chuỗi buổi học trong 1 batch; idempotent — kể cả khi 2 request SONG SONG (CAS, không 500); 404 khi sai org hoặc không tồn tại
- [ ] `DELETE /api/enrollments/:enrollmentId`: xóa được khi `invited`; 409 khi `active`; 404 sai org/không tồn tại
- [ ] `POST /invoices` trả 409 khi enrollment `invited`
- [ ] Assignments route chặn `studentIds` chứa học viên invited (400)
- [ ] Snapshot (`GET /api/kernel`) trả `enrollments[].status`
- [ ] Invariant comment kernel.ts:564-566 cập nhật theo vòng đời mới; invited (0 lesson) không làm gãy skeleton conforms/backfill (verify, không sửa skeleton.ts)

## Architecture

Vòng đời enrollment sau phase này:

```
teacher thêm học viên          teacher bấm "Kích hoạt" (web)   học viên đồng ý (portal, sau này)
      │                                │                                │
      ▼                                ▼                                ▼
 enrollment{status:"invited"} ──▶ POST /api/enrollments/:id/accept ◀──
 (không package/lessons)                 │  = status → active
                                         ▼
                          + sessionPackage{status:"active"} + lesson series (1 batch)
 enrollment{invited} ── DELETE (chỉ invited) ──▶ xóa
```

Sketch accept handler (CAS idempotency — đặt trong `kernel.ts`, cạnh enroll):

```ts
// POST /api/enrollments/:enrollmentId/accept — body: {}
// 1. UPDATE enrollment SET status='active' WHERE id=? AND org_id=? AND status='invited'
//    (chạy ĐẦU TIÊN trong batch, đếm rows affected)
// 2. rows = 0 → re-read enrollment theo (id, orgId):
//      không tồn tại → 404; đã 'active' → 200 (idempotent, không side-effect)
// 3. rows = 1 → tiếp tục trong CÙNG batch: insert sessionPackage (derive từ class,
//    price = cls.tuitionFee tại thời điểm accept — chủ đích) + generateScheduleLessons
// 4. Phòng vệ: bắt unique-violation của session_package_enrollment_uq → re-read,
//    đã active → 200 (chống race còn sót nếu D1 không serialize 2 bước)
// 5. Trả response theo pattern command kề bên
```

DELETE handler: select theo (id, orgId) → không thấy: 404; `status !== 'invited'`: 409; else `db.delete(enrollment)`.

Accept và DELETE đều 404 (không 403) khi sai org — tránh enumeration, nhất quán pattern enroll.

## Related Code Files

- Modify: `apps/server/src/routes/kernel.ts` — enroll (601-672), POST /api/students (512-597), thêm accept + delete route, guard invoices (1433-1484) + assignments (714-725), invariant comment (564-566)
- Modify: `apps/server/src/routes/snapshot.ts` — query + map `status` (146-148, 295-300)
- Modify: `apps/server/src/kernel.test.ts`, `apps/server/src/kernel-occurrence.test.ts`, `apps/server/src/lesson-date-integration.test.ts`, `apps/server/src/skeleton-parity.test.ts` — theo vòng đời mới + helper `addActiveStudent`
- Verify-only (KHÔNG sửa): `packages/api/src/skeleton.ts`, `apps/server/scripts/backfill-date.ts`, `apps/web/src/lib/class-sessions.ts`

## Implementation Steps

1. Enroll: bỏ phần tạo package/lessons khỏi batch; insert enrollment với `status: "invited"`. Giữ nguyên check trùng 409 và 404 sai org.
2. `POST /api/students`: nhánh có `classId` dùng cùng insert `invited`, bỏ phần package/lessons (nhánh không lớp giữ nguyên — không tạo gì).
3. Thêm route accept theo sketch CAS ở trên; dời khối derive package + `generateScheduleLessons` từ enroll cũ vào đây; một `db.batch` cho update+insert.
4. Thêm route DELETE invited-only theo sketch.
5. Guard invoices: trong validate của `POST /invoices`, thêm điều kiện enrollment phải `active`, ngược lại 409 kèm message tiếng Việt ("Học viên chưa đồng ý tham gia lớp").
6. Guard assignments: roster query ở kernel.ts:714-725 thêm `eq(enrollment.status, "active")`.
7. Snapshot: thêm `status` vào SELECT và map ở snapshot.ts:295-300 (pass-through).
8. Cập nhật invariant comment kernel.ts:564-566: "enrollment active luôn có lesson series; invited chưa có — sinh khi accept". Verify bằng đọc code: skeleton conforms/backfill chỉ tiêu thụ lesson rows nên invited vô hình (ghi kết quả verify vào PR description).
9. Viết/cập nhật vitest:
   - helper `addActiveStudent({classId})` = addStudent + gọi accept; thay hàng loạt setup cũ trong `kernel.test.ts` (34 chỗ `addStudent` với classId) — giữ `addStudent` thuần cho các test riêng về invited
   - enroll → `invited`, KHÔNG có package/lesson; cả 2 đường enroll
   - accept → `active`, đúng 1 package + chuỗi buổi; **test song song** (2 promise accept cùng lúc) → cả hai 200/1 return, số package/lesson không tăng
   - accept lần 2 tuần tự → 200 idempotent; sai org → 404; id lạ → 404
   - DELETE invited → xóa thành công, mời lại được (không 409); DELETE active → 409; DELETE sai org → 404
   - invoice trên invited → 409; trên active → như cũ
   - assignments với studentId invited → 400
   - accept sau khi đổi tuitionFee → package price = fee mới (pin behavior)
   - `lesson-date-integration.test.ts`: đổi premise "at enrollment time" → "at accept time"

## Todo

- [x] Enroll tạo `invited`, bỏ sinh package/lessons (cả 2 đường)
- [x] Route accept CAS + batch atomic + idempotent + 404 org-scoped
- [x] Route DELETE invited-only + 409 active
- [x] Guard invoice 409 invited + guard assignments active-only
- [x] Snapshot trả `status`
- [x] Invariant comment + verify skeleton vô hình với invited
- [x] Helper `addActiveStudent` + toàn bộ vitest trên xanh

## Success Criteria

- `cd apps/server && pnpm vitest run` xanh.
- Bằng test: enroll không sinh lesson; accept sinh cùng số lesson/package như cơ chế cũ; accept song song không 500, không sinh trùng; invoice/assignments chặn invited.
- Snapshot trả `status` cho mọi enrollment.

## Risk Assessment

- Quên 1 trong 2 đường enroll → bất nhất. Mitigation: test cho cả 2 đường.
- Race accept: CAS WHERE + unique index + test song song (không chỉ test tuần tự).
- Sót validate "enrollment tồn tại" khác chưa lọc status. Mitigation: grep `from(enrollment)` trong kernel.ts, rà từng chỗ.

## Security Considerations

- Org-scoping 404; accept idempotent an toàn retry.
- Interim: mọi teacher trong org gọi được accept/DELETE-invited (chưa có role check) — chấp nhận có chủ đích, ghi comment tại route.
- Ràng buộc portal tương lai (org-isolation blocker + ownership) — xem plan.md "Portal integration constraints", ghi comment tại route accept.
- DELETE chỉ invited: chưa có package/invoice tham chiếu (được guard #5 bảo đảm) nên không mồ côi dữ liệu.

## Next Steps

- Phase 3 tiêu thụ `status` từ snapshot để dựng UI + nút Kích hoạt/Hủy lời mời.
