---
phase: 3
title: "Web views — flag hasPackage, trạng thái \"Chưa có gói\", hiển thị email"
status: todo
priority: P2
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: Web views — trạng thái "Chưa có gói" + hiển thị email

## Goal (Overview)

Học viên tạo không lớp giờ KHÔNG có package row (D2) — mapper web đã fallback `ZERO_PKG` (`repos/students.ts:13-21,67-77`) nên không crash, nhưng mọi view đang render "0 buổi · Online" / "0 / 0" / "0đ" và progress `NaN`. Phase này thêm flag `hasPackage` phân biệt "chưa có gói" với gói thật, render "Chưa có gói" ở students list / student detail / tuition, và hiển thị email ở detail contact block.

## Context Links

- `apps/web/src/lib/mock-data.ts:8-30` — interface `Student` (chưa có `email`/`hasPackage`)
- `apps/web/src/lib/repos/students.ts:33-84` — `mapStudents`: `ZERO_PKG` fallback (`:13-21`, dùng tại `:77`), trả Student từ `KernelStudentRow`
- `apps/web/src/routes/_auth/students/index.tsx:38-44` — `attentionCount` (dùng `s.pkg.total > 0 && s.pkg.remaining <= 4`); `:99-114` — cells: phone (`:99`), `{s.pkg.total} buổi · {s.pkg.mode}` (`:103`), remaining (`:106`), `fmtVND(s.pkg.price)` (`:114`)
- `apps/web/src/routes/_auth/students/$studentId.tsx:90` — contact line `{student.phone} · Zalo: {student.zalo}` (chỗ thêm email); `:140-170` — package card "Gói học" (6 hàng + `Progress value={(done/total)*100}` tại `:164-166` — total 0 → NaN)
- `apps/web/src/routes/_auth/tuition.tsx:43` — KPI `packagesEndingSoon(data.students)`; `:97-140` — bảng packages: `done/total` (`:100`), remaining (`:105-110`), `Progress` (`:112-118`), badge Sắp hết danger ≤2 / warn ≤4, else "Đang học" (`:126-136`)
- `apps/web/src/lib/tuition-from-kernel.ts:75-80` — `packagesEndingSoon`: filter `s.pkg.remaining <= 4` — ZERO_PKG remaining 0 ⇒ học viên chưa có gói bị đếm là "Sắp hết" (sai)
- `apps/web/src/lib/data-store-reducer.ts:87-122` — case add-student (phase 2 đã sửa payload; phase này bổ sung 2 field mới của Student)

## Key Insights

- `hasPackage` là flag BẮT BUỘC trên `Student` (không optional-undefined): mapper luôn set, mọi fixture phải khai báo tường minh — ẩn giấu bug tốt hơn là tiện fixture.
- `ZERO_PKG.remaining = 0` khiến `packagesEndingSoon` (`tuition-from-kernel.ts:79`) đếm học viên chưa có gói vào KPI "Gói sắp hết" và bảng tuition gắn badge đỏ "Sắp hết" — chính là trạng thái "trông như hỏng" mà issue #104 từng fix; guard `hasPackage` là bắt buộc chức năng, không phải cosmetic.
- `Progress value={(0/0)*100}` = `NaN` ở `$studentId.tsx:155` và `tuition.tsx:114` — render nhánh "Chưa có gói" thay vì guard từng giá trị (KISS).
- Email legacy = `""` — hiển thị email ở detail chỉ khi `student.email` không rỗng (row cũ không hiện chữ rỗng).
- Overlay file với phase 2: CHỈ `data-store-reducer.ts` (bổ sung 2 dòng `email`/`hasPackage` cho literal add-student) — type `Student` có field bắt buộc mới bắt buộc sửa; các file còn lại phase 3 sở hữu toàn bộ.

## Requirements

- [ ] `Student` thêm `email: string` + `hasPackage: boolean`; `mapStudents` set từ `row.email` và `pkg != null`
- [ ] Students list: cell Gói hiển thị "Chưa có gói", cell Còn lại + Đơn giá hiển thị "—" khi `!hasPackage`
- [ ] Student detail: email trong contact block (khi khác rỗng); package card render "Chưa có gói" (không render 6 hàng số 0 + Progress NaN)
- [ ] Tuition: row học viên chưa có gói hiển thị "Chưa có gói" + badge muted, KHÔNG vào KPI `packagesEndingSoon`
- [ ] Mọi fixture `Student` trong web tests khai báo `email` + `hasPackage`; unit test mapper assert 2 field mới

## Architecture (data flow)

```
snapshot.students[email] + snapshot.packages
  → mapStudents: hasPackage = newest active package tồn tại (logic pick package giữ nguyên :34-41)
  → Student {email, hasPackage, pkg: thật | ZERO_PKG}
  → students list / student detail / tuition: hasPackage ? render số : render "Chưa có gói"
```

## Related Code Files

- Modify: `apps/web/src/lib/mock-data.ts` — interface `Student` (+2 field kèm docblock)
- Modify: `apps/web/src/lib/repos/students.ts` — mapper set `email`, `hasPackage`
- Modify: `apps/web/src/lib/data-store-reducer.ts` — literal add-student bổ sung `email: action.payload.email, hasPackage: false` (hoàn thiện phase 2)
- Modify: `apps/web/src/routes/_auth/students/index.tsx` — 3 cells + guard `attentionCount`
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx` — contact block + package card
- Modify: `apps/web/src/routes/_auth/tuition.tsx` — cells + badge nhánh chưa có gói
- Modify: `apps/web/src/lib/tuition-from-kernel.ts` — `packagesEndingSoon` guard `hasPackage`
- Modify (fixtures): `apps/web/src/lib/repos/students.test.ts` (assert mapper email/hasPackage: st-1 có package → true; st-2 không → false), `apps/web/src/lib/tuition-from-kernel.test.ts`, `apps/web/src/lib/dashboard-from-kernel.test.ts`, `apps/web/src/lib/global-search.test.ts`, `apps/web/src/components/classes/class-assignments-tab.test.tsx` (2 literal), `apps/web/src/routes/_auth/assignments/index.test.tsx`, `apps/web/src/routes/_auth/reports.test.tsx`, `apps/web/src/lib/data-store-reducer.test.ts` (nếu assertion Student shape)

## Implementation Steps

1. `apps/web/src/lib/mock-data.ts:8-30` — trong `Student`, sau `zalo` thêm:

   ```ts
   /** Email học viên — danh tính đăng nhập tương lai (cùng phone); "" với row legacy. */
   email: string;
   /** false = chưa có gói (tạo không lớp — D2): pkg là ZERO_PKG, view render "Chưa có gói". */
   hasPackage: boolean;
   ```

2. `apps/web/src/lib/repos/students.ts` — trong map return (`:58-82`): thêm `email: row.email,` (sau `zalo`) và `hasPackage: pkg != null,` (sau `email`). Cập nhật docblock mapper (`:23-32`) nêu semantics hasPackage.
3. `apps/web/src/lib/data-store-reducer.ts` — literal Student của case add-student thêm `email: action.payload.email,` + `hasPackage: false,` (kèm comment đã có từ phase 2).
4. `apps/web/src/routes/_auth/students/index.tsx`:
   - Cell Gói (`:103`): `s.hasPackage ? \`${s.pkg.total} buổi · ${s.pkg.mode}\` : "Chưa có gói"`.
   - Cell Còn lại (`:106`): `s.hasPackage ? \`${s.pkg.remaining} / ${s.pkg.total}\` : "—"`.
   - Cell Đơn giá (`:114`): `s.hasPackage ? fmtVND(s.pkg.price) : "—"`.
   - `attentionCount` (`:38-44`): thêm `s.hasPackage &&` trước `s.pkg.total > 0` (semantics hôm nay không đổi vì ZERO_PKG.total = 0 — viết tường minh để đọc đúng nghĩa).
5. `apps/web/src/routes/_auth/students/$studentId.tsx`:
   - Contact block (`:88-92`, span phone·Zalo tại `:90`): thêm span sau phone·Zalo — `{student.email && <span className="font-mono text-meta text-xs">Email: {student.email}</span>}`.
   - Package card (`:140-170`): bọc nội dung — `student.hasPackage ?` (6 hàng + Progress `:164-166` giữ nguyên) `: <p className="text-muted-fg text-sm">Chưa có gói — thêm học viên vào lớp để có gói học.</p>`.
6. `apps/web/src/routes/_auth/tuition.tsx` (`:97-140`): khi `!s.hasPackage` — cell "Đã học" và "Còn" hiển thị "—"/"—", `Progress value={0} variant="default"`, "Hết hạn" giữ `s.pkg.expiry` (rỗng), badge: `<Badge variant="muted">Chưa có gói</Badge>`. Cấu trúc gợi ý: build cells theo nhánh `hasPackage` thay vì lặp if từng cell.
7. `apps/web/src/lib/tuition-from-kernel.ts:75-80` — `packagesEndingSoon` thêm `s.hasPackage &&` vào filter + cập nhật docblock (học viên chưa có gói không thuộc "Sắp hết").
8. Fixtures + assertions (mọi literal `Student` thêm `email: ""` — hoặc giá trị meaningful — và `hasPackage: true/false` tùy fixture có package hay không):
   - `repos/students.test.ts`: fixture st-1/st-2 đã có package rows — thêm assertion mapped `email` (st-1 fixture phase 2 đã có email thật) và `hasPackage: true`/`false`; describe "parked package" fixture (`:260-300`) giữ hasPackage true (parked package vẫn là package).
   - `tuition-from-kernel.test.ts`: test `packagesEndingSoon` thêm case hasPackage false không được đếm.
   - 5 file còn lại: thêm 2 field cơ học theo literal hiện có.

## Todo

- [ ] `Student.email` + `Student.hasPackage` (required) + docblock
- [ ] Mapper set 2 field; assertion unit test mapper
- [ ] Reducer literal add-student bổ sung 2 field
- [ ] Students list 3 cells + guard attentionCount
- [ ] Student detail: email contact + package card "Chưa có gói"
- [ ] Tuition row + badge + `packagesEndingSoon` guard + test case mới
- [ ] Fixtures 8 file test

## Success Criteria (verify)

- `pnpm --filter web test && pnpm --filter web check-types` — exit 0
- `pnpm check` — exit 0
- Manual (dev server, org có dữ liệu cũ + tạo học viên mới không lớp): students list row học viên mới hiện "Chưa có gói · — · —"; click vào detail thấy Email + card "Chưa có gói"; trang Học phí row đó hiện "Chưa có gói" badge muted và KPI "Gói sắp hết" không tăng; học viên cũ có gói hiển thị số như trước.

## Risk Assessment

- **Thêm field bắt buộc lên `Student` làm 8 file test đỏ compile** — chủ đích (tường minh hơn optional); checklist bước 8 liệt kê đủ file (verify bằng `grep -rln "targetBand" apps/web/src --include="*.test.*"` = 6 file + reducer test + mapper test).
- Quên guard `packagesEndingSoon` → KPI tuition sai số với từng học viên chưa có gói — có unit test riêng (bước 8).
- Hiển thị "Chưa có gói" quá nhiều nơi gây layout lệch cột DataTable — dùng text ngắn + "—" cho các cột số, giữ nguyên chiều cao hàng.

## Security Considerations

- Email hiển thị ở internal org view (teacher-only) — không thêm vào global search hay export ở phase này.
- Không có flow mới ghi dữ liệu — chỉ render.

## Next Steps

- Phase 4: rewrite 2 e2e specs chủ đề + helper tạo học viên qua UI cho 13 specs + full verify sweep.
