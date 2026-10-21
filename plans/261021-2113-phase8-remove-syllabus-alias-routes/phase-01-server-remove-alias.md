---
phase: 1
title: "Server — gỡ alias route + chuyển test (TDD)"
status: pending
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: Server — gỡ alias route + chuyển test (TDD)

## Goal

`apps/server` không còn đăng ký bất kỳ alias path nào; test đảo (id thật, 7 legacy path) chứng minh alias đã chết; mọi test đọc dữ liệu syllabi đi qua snapshot `/api/kernel`.

## Files to Create / Modify

- Modify: `apps/server/src/kernel.test.ts`
- Modify: `apps/server/src/routes/syllabus.ts`

> Số dòng dưới đây chỉ tham khảo ±3 dòng tại thời điểm viết plan. Anchor cắt/sửa bằng **chuỗi code**, không cắt theo range mù.

## Tasks & Steps

### Task 1.1 — Chuyển test đọc qua `GET /api/syllabi` sang `t.kernel()` + đổi path/title các test guard

- Goal: không test nào còn gọi alias path; assertion giữ nguyên hoặc tương đương.
- Target files: `apps/server/src/kernel.test.ts` — anchor: các chuỗi `t.call("/api/syllabi", { session })` (4 chỗ: ~630, ~677, ~716, ~736), `"matrix 12: POST /api/syllabi creates a template` (~2831), `"alias không mở lỗ hổng: replace-content` (~3622), `` `/api/syllabi/${copyId}/remove` `` trong matrix 16 (~3782).
- Steps:
  1. Tại 4 vị trí `t.call("/api/syllabi", { session })`: thay bằng `t.kernel(session)` và lấy `.syllabi`. **Lưu ý (red-team S5):** tại site so sánh before/after (~716 khai báo `before` và ~736 so `toEqual(before)`) phải đổi **CẢ HAI phía** sang `(await t.kernel(session)).syllabi` cùng lúc — không được so snapshot với raw list của route cũ. Phần assertion phía dưới giữ nguyên (field `name`/`modules`/`lessons` có đầy đủ trong `KernelSnapshot.syllabi`).
  2. Dòng ~2831: đổi tiêu đề test `"matrix 12: POST /api/syllabi creates a template (classId null)"` → `"matrix 12: template tạo qua đường mới có classId null"` (thân test không đổi — đã dùng helper path mới).
  3. Test `"alias không mở lỗ hổng: replace-content và remove không đụng được bản copy"` (~3622): đổi 2 path gọi từ `/api/syllabi/${copyId}/replace-content` → `/api/syllabus-templates/${copyId}/replace-content` và `/api/syllabi/${copyId}/remove` → `/api/syllabus-templates/${copyId}/remove`; giữ expect 404; đổi tiêu đề thành `"replace-content và remove qua đường template không đụng được bản copy"`.
  4. Matrix 16 (~3782, anchor `` t.call(`/api/syllabi/${copyId}/remove` `` ): đổi path → `` `/api/syllabus-templates/${copyId}/remove` ``, giữ expect 404.
- Success criteria: `git diff` không đổi semantics assertion nào (chỉ đổi nguồn dữ liệu + path); `grep -n 't.call("/api/syllabi"' apps/server/src/kernel.test.ts` exit 1.
- Verify: `pnpm --filter server test -- kernel` exit 0, toàn bộ xanh. Pass condition: exit code 0 và không có dòng `FAIL` trong output. (Red-team S5: kiểm chứng bằng chạy test, không đếm assertion trong diff.)

### Task 1.2 — Thay test bảo vệ alias bằng test đảo "alias phase 8 đã gỡ" với id thật (RED)

- Goal: test mới assert 7 legacy method-path trả 404, dùng **id thật** (template + copy tạo qua đường mới) để mọi assertion có giá trị 2 chiều — hiện đang đỏ vì alias còn sống.
- Target files: `apps/server/src/kernel.test.ts` — thay thế nguyên khối test `"test bảo vệ alias: import-syllabus cũ + module qua /syllabi/:copyId vẫn sống đến phase 8"` (~3680; test cũ có 2 assertion) trong cùng describe.
- Steps:
  1. Xoá test bảo vệ alias cũ (anchor: `test("test bảo vệ alias: import-syllabus cũ + module qua /syllabi/:copyId vẫn sống đến phase 8"`).
  2. Thay bằng test mới (cùng describe; copy tạo qua **đường mới** `/classes/:id/curriculum/import` nên setup đứng vững cả 2 thế giới):
     ```ts
     test("phase 8: alias cũ đã gỡ — legacy path trả 404", async () => {
         const templateId = await t.createSyllabus(session, "Template kiểm tra alias đã gỡ");
         const classId = await t.createClass(session, "Lớp có giáo trình (đường mới)");
         const importRes = await t.call(
             `/api/classes/${classId}/curriculum/import`,
             { session, method: "POST", body: { templateId } },
         );
         expect(importRes.status).toBe(201);
         const copyId = ((await importRes.json()) as { id: string }).id;
         const freshClass = await t.createClass(session, "Lớp chưa import");

         for (const [method, path, body] of [
             ["GET", "/api/syllabi", undefined],
             ["POST", "/api/syllabi", { name: "x", type: "ielts", skills: [], totalLessons: 0 }],
             ["POST", `/api/syllabi/${copyId}/replace-content`, { modules: [] }],
             ["POST", `/api/syllabi/${copyId}/remove`, {}],
             ["POST", `/api/syllabi/${copyId}/modules`, { title: "x", description: "" }],
             ["POST", `/api/classes/${freshClass}/import-syllabus`, { templateId }],
             ["POST", `/api/classes/${freshClass}/remove-curriculum`, {}],
         ] as const) {
             const res = await t.call(path, { session, method, ...(body !== undefined ? { body } : {}) });
             expect(res.status).toBe(404);
         }
         await expectPointerInvariant();
     });
     ```
     (Red-team A1/S1: id thật — `copyId` thật khiến các assert `/syllabi/${copyId}/*` trả 200/201 khi alias còn sống; `templateId` thật khiến alias import trả 201; `freshClass` chưa import khiến alias remove trả 200. 7 assertion >= 2 assertion của test cũ — không bớt.)
- Success criteria: test mới tồn tại, chạy ra FAILED ở assert đầu tiên (`GET /api/syllabi` expected 404, received 200); các test khác không bị lỗi mới.
- Verify: `pnpm --filter server test -- kernel` exit non-zero, FAIL duy nhất liên quan test `"phase 8: alias cũ đã gỡ"`. Đây là red phase có chủ đích — test đỏ tại đây là ĐÚNG, không phải verify failure.

### Task 1.3 — Gỡ alias khỏi `apps/server/src/routes/syllabus.ts` (GREEN)

- Goal: mỗi operation đăng ký đúng 1 path mới; không còn chuỗi `/syllabi` nào trong đăng ký route; import sạch.
- Target files: `apps/server/src/routes/syllabus.ts` — anchor: `routes.get("/syllabi"`, `for (const path of ["/syllabus-templates", "/syllabi"])`, 4 khối `for (const path of [...])` chứa phần tử có comment `// Alias tạm cho web cũ, xoá ở phase 8.`, khối `mountContentRoutes` với `basePath: "/syllabi/:id"`.
- Steps:
  1. Xoá block `routes.get("/syllabi", ...)`. Nếu `loadSnapshot` không còn usage khác trong file → xoá luôn import `./snapshot` (TypeScript noUnusedLocals sẽ báo nếu quên).
  2. Khối POST tạo template: bỏ loop `for (const path of ["/syllabus-templates", "/syllabi"])` → đăng ký thẳng 1 path `"/syllabus-templates"` với nguyên bộ middleware (auth guard + `bodyLimit` 2 MiB) và handler `createTemplateHandler`.
  3. 4 khối `for` còn lại (replace-content, remove, import, remove-curriculum): bỏ loop, đăng ký thẳng path mới tương ứng (`/syllabus-templates/:id/replace-content`, `/syllabus-templates/:id/remove`, `/classes/:id/curriculum/import`, `/classes/:id/curriculum/remove`).
  4. Xoá nguyên khối `mountContentRoutes` thứ ba với `basePath: "/syllabi/:id"` kèm comment "Alias tạm cho web cũ...".
  5. Gỡ `findSyllabus` khỏi import từ `../lib/syllabus-curriculum`; cập nhật comment khối registration — bỏ chữ "legacy aliases right behind them".
  6. KHÔNG đụng: 2 `mountContentRoutes` còn lại (`/syllabus-templates/:id`, `/classes/:id/curriculum`), handler bodies, chuỗi `"import-syllabus batch failed"` (~348) và comment "remove-curriculum phía lớp" (~241) — đó là error string/comment, không phải route, `findSyllabus` trong `lib/syllabus-curriculum.ts` và `kernel.ts`.
- Success criteria: gate route-registration `grep -rnE '"/(syllabi|classes/[^"]*/(import-syllabus|remove-curriculum))' apps/server/src/routes/` exit 1; `grep -n "findSyllabus" apps/server/src/routes/syllabus.ts` exit 1.
- Verify: `pnpm --filter server test -- kernel` exit 0 (test đảo Task 1.2 chuyển xanh). Pass condition: exit code 0, không FAIL.

## Failure Protocol

Nếu bất kỳ Verify step nào không đạt pass condition, STOP phase này. Không tự sửa mù, không retry bừa, không lý luận quanh lỗi. Spawn subagent `kongming` với: phase + task id, các bước đã chạy, lệnh + output đầy đủ, pass condition chưa đạt. Áp dụng counsel rồi chạy lại Verify. Nếu không spawn được `kongming`: STOP và báo user cùng bằng chứng. Không tiếp tục bằng tự suy đoán.
