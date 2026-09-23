---
title: "Phase 1: API & server — enroll derive gói từ lớp (D1)"
status: todo
---

# Phase 1: API & server — enroll derive gói từ lớp (D1)

## Overview

- **Priority**: P1
- **Status**: pending
- `POST /api/classes/:id/enroll` hiện nhận `total/price/mode` từ input (`apps/server/src/routes/kernel.ts:644-657`) — nhánh duy nhất còn làm vậy sau khi nhánh tạo-học-viên-có-lớp chuyển sang derive từ lớp (comment `D1`, `kernel.ts:550-561`). Phase này đưa enroll về cùng pattern: schema chỉ còn `studentId`, gói derive từ `cls`.

**Key insights** (từ scout + verify trực tiếp):

- `enrollStudentSchema` (`packages/api/src/contracts.ts:25-31`) có default `total=10, price=400000, mode="Online"` — comment "mirror studentCreateSchema defaults" đã lỗi thời từ D1.
- Zod object (non-strict) **strip key lạ** → client cũ còn gửi `total/price/mode` vẫn hợp lệ trong thời gian chuyển tiếp; chỉ cần server không đọc nữa.
- Server test hiện pin đúng hành vi CŨ cần viết lại: `apps/server/src/kernel.test.ts:3503` ("divergence pin": gói 10 ≠ lớp 12), `:3878` (happy path nhận 24/600000/Offline từ body), `:3980` (chặn total=0 — validation này biến mất cùng schema).

## Requirements

- [ ] `enrollStudentSchema` chỉ còn `studentId: z.string().min(1)`; comment khối cập nhật theo D1.
- [ ] Handler enroll tạo `sessionPackage` với `total: cls.sessionsTotal`, `price: cls.tuitionFee ?? 0`, `mode: cls.mode`.
- [ ] Server tests phản ánh hành vi mới (không còn test pin hành vi cũ).

## Implementation Steps

1. `packages/api/src/contracts.ts` (dòng 20–31): thay `enrollStudentSchema` thành `z.object({ studentId: z.string().min(1) })`. Cập nhật comment khối: enroll học viên có sẵn; **gói derive từ lớp theo D1** — client không gửi package fields.
2. `apps/server/src/routes/kernel.ts` (dòng 646–657): trong `db.insert(sessionPackage).values({...})` đổi `total: input.total` → `cls.sessionsTotal`, `price: input.price` → `cls.tuitionFee ?? 0`, `mode: input.mode` → `cls.mode`. Cập nhật comment dòng 644–645 (nó đang nói "enroll nhận package fields từ input" — giờ sai).
3. `apps/server/src/kernel.test.ts` — cập nhật 4 điểm gọi `/enroll`:
   - `:3503` "divergence pin": viết lại thành pin hành vi MỚI — body chỉ `{studentId}`, kỳ vọng `package.total === 12` (bằng `sessionsTotal` của lớp) và 12 lessons; đổi tên test (vd. "enroll mirrors the class package: total = class sessionsTotal").
   - `:3878` happy path: body chỉ `{studentId}`; các assert `pkg.total/price/mode` đổi sang giá trị của lớp tạo bởi `t.createClass` (đọc helper `createClass` trong chính file test để lấy default `sessionsTotal/tuitionFee/mode` rồi assert khớp).
   - `:3980` "total 0 rejected 400": validation `total` không còn tồn tại — thay bằng test "unknown fields are ignored" (gửi kèm `total: 0` kỳ vọng vẫn 201 và gói theo lớp) hoặc xoá hẳn; nối diễn giải QC #115 chỉ còn áp dụng cho nhánh create (đã có test riêng).
   - `:4892` cap-200 test: dọn body còn `{studentId}` cho nhất quán (vẫn pass vì zod strip, nhưng đừng để lại hạt giống nhầm lẫn).

## Todo

- [ ] `contracts.ts`: `enrollStudentSchema` = `{studentId}` + comment D1
- [ ] `kernel.ts`: sessionPackage derive từ `cls`
- [ ] `kernel.test.ts`: viết lại 4 điểm test enroll
- [ ] `pnpm --filter server test` xanh

## Success Criteria

- `pnpm --filter server test` xanh; `pnpm check-types` sạch.
- Enroll bằng body `{studentId}` tạo enrollment + package (theo lớp) + lessons trong 1 batch như trước.

## Risk

- Quên 1 điểm assert giá trị cũ trong `kernel.test.ts` → test đỏ lộ ra ngay khi chạy (an toàn, dễ sửa).
- Client chưa đổi (Phase 2) vẫn gửi `total/price/mode` → zod strip, không vỡ. Phase 1 đứng trước Phase 2 là an toàn.
