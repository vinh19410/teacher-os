---
phase: 2
title: "Server endpoints"
status: done
priority: P1
effort: 2h
dependencies: [1]
---

# Phase 2: Server endpoints

## Goal

Server ghi + trả về `tuitionFee`: `POST /classes` persist field mới; endpoint mới `POST /classes/:id/tuition-fee` (org-scoped) cho sửa/xóa; snapshot trả cột mới; kernel tests phủ.

## Context Links

- `apps/server/src/routes/kernel.ts:781-841` — `POST /classes` hiện tại (insert tại 817-835)
- `apps/server/src/routes/kernel.ts:981` — `POST /classes/:id/notes`: pattern mẫu cho subresource update (org-scoped, response shape, readBody)
- `apps/server/src/routes/snapshot.ts:114` — `loadSnapshot` chọn cột `class`
- `apps/server/src/kernel.test.ts` — harness: `t.call("/api/classes", {session, method, body})`, migration thật

## Files to Create / Modify

- Modify: `apps/server/src/routes/kernel.ts` — insert field mới + route subresource mới
- Modify: `apps/server/src/routes/snapshot.ts` — select `tuitionFee`
- Modify: `apps/server/src/kernel.test.ts` — test cases mới

## Implementation Steps

1. `POST /classes` (kernel.ts:817-835): thêm vào object insert `tuitionFee: input.tuitionFee ?? null` (contract `.nullish()` → normalize về `null`).

2. Route mới `POST /classes/:id/tuition-fee` — đặt ngay cạnh route notes (:981), chép nguyên khung authz/response của notes:
	- Parse `classTuitionFeeUpdateSchema` qua `readBody`.
	- Lookup class **org-scoped** (id + `orgId` từ session, cùng điều kiện như notes) → không thấy trả 404 đúng shape notes trả.
	- `db.update(classTable).set({ tuitionFee: body.tuitionFee })` where id+orgId (null = xóa học phí).
	- Response shape **giống notes** để command bus refetch snapshot như hiện trạng.

3. `snapshot.ts` `loadSnapshot`: thêm `tuitionFee` vào select + mapping row → `KernelClassRow` (null passthrough).

4. Tests trong `kernel.test.ts` (theo group test tạo lớp hiện có, dùng `t.call` + fixture session/org sẵn có):
	- Tạo lớp gửi `tuitionFee: 5_000_000` → `GET /api/kernel` snapshot classes trả đúng giá trị.
	- Tạo lớp KHÔNG gửi field → snapshot `tuitionFee === null`.
	- `POST /classes/:id/tuition-fee` set giá trị mới → snapshot cập nhật.
	- Gửi `{ tuitionFee: null }` → snapshot về `null` (đã xóa).
	- Gửi `{ tuitionFee: 0 }` / `{ tuitionFee: 1.5 }` → 400.
	- Gọi trên classId của org khác → 404.

## Todo

- [x] `POST /classes` insert `tuitionFee ?? null`
- [x] Route `POST /classes/:id/tuition-fee` org-scoped, response shape = notes
- [x] `loadSnapshot` trả `tuitionFee`
- [x] 6 test cases ở trên xanh

## Verification

- `pnpm --filter server test` — exit 0 (chú ý `skeleton-parity.test.ts` có thể assert shape row: nếu fail, cập nhật fixture theo contract mới — đó là drift có chủ đích)

## Risk Assessment

- `skeleton-parity.test.ts` hoặc fixture test khác liệt kê key `KernelClassRow` → cập nhật fixture (pass qua validation lần đầu).
- Response shape khác notes → bus không refetch → UI stale; bắt buộc mirror notes.

## Security Considerations

- Route mới PHẢI org-scoped (id + orgId) như mọi POST writes — test 404 cross-org là gate.
- Không log amount/fee; JSON-only body qua `readBody`.

## Next Steps

- Phase 3 gọi 2 endpoint này từ web qua `kernelCommand`.
