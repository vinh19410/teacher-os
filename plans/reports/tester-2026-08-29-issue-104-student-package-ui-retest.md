# Test Report — 2026-08-29 — QC re-test #104 (student package lost without class)

**Scope:** UI re-test cho issue #104 «[QC][P0] Lưu học viên thì mất số buổi và đơn giá» sau khi PR #128 merge vào develop (commit 3d06c2f).
**Môi trường live:** staging `https://app.staging.teacheros.io.vn` (Deploy Staging run 33185980795 — success trên merge #128).
**Tài khoản test:** throwaway signup `qc104-retest-1787973975@test.local` (junk row được chấp nhận trên staging D1).
**Fixture:** học viên `QC-104-RETEST` — SĐT `0900000001`, không gắn lớp, Số buổi `10`, Đơn giá `400000`, Hình thức `Online` (đúng 1:1 steps trong issue).

## Test Results Overview
- **Unit tests (vitest, apps/web)**: **359/359 passed** (33 files) — develop @ 3d06c2f
- **Local e2e (Playwright, full suite)**: 26 tests — 25 passed + 1 skipped (spec Google OAuth, skip theo thiết kế). 1 test flaky (`no-service-worker.spec.ts` — SW registration polling race khi chạy full suite; **pass khi chạy riêng**) — không liên quan #104
- **Live UI retest (staging)**: 4/4 acceptance criteria **PASS** — 0 bug mới
- **Screenshots**: `plans/reports/screenshots-2026-08-29-issue-104/`

## Kết quả acceptance criteria

| AC | Mô tả | Kết quả | Bằng chứng |
|----|-------|---------|-----------|
| AC1 | POST /api/students không còn mất total/price/mode khi không có classId | ✅ PASS | Kernel snapshot sau save: package `{total: 10, price: 400000, mode: "Online", studentId: c62d852f-…, classId: null, enrollmentId: null, status: "active"}` — đúng model parked package (Option B) |
| AC2 | List /students hiện đúng «10 buổi · Online», còn lại «10 / 10», đơn giá 400.000đ | ✅ PASS | Row: `QC-104-RETEST · 0900000001 · 10 buổi · Online · 10 / 10 · 400.000đ` — `ac1-students-list.png` |
| AC3 | /tuition: gói «0/10», còn 10, trạng thái «Đang học» — hết badge đỏ «Sắp hết» trên gói 0/0 | ✅ PASS | Row gói đang hoạt động: `QC-104-RETEST · 0/10 · 10 · Đang học` — `ac2-tuition-package.png` |
| AC4 | Hàng học viên click được, mở trang chi tiết với đủ thông tin gói | ✅ PASS | Row click → `/students/c62d852f-…`; chi tiết: Tổng buổi 10 · Đã học 0 · Còn lại 10 · Đơn giá 400.000đ · Hình thức Online — `ac3-student-detail-package.png` |

## UI Test Results
- **Pages tested**: /students (form Thêm học viên + list), /students/{id} (detail), /tuition
- **Console errors**: không thu được qua IAB (không có console listener); không thấy blocking error nào trên UI — mọi route render đầy đủ
- **Data integrity**: lưu 2 lần (lần đầu do automation timeout không chắc đã bấm Lưu) — server chỉ tạo đúng **1** package, không duplicate
- **Bug mới phát hiện**: không có (bug liên quan #104)

## Build / Deploy Status
- **Local unit + e2e**: PASS trên develop @ 3d06c2f (có fix #128)
- **CI**: CI + E2E + Deploy Staging success trên merge #128 (run 33185980788 / 33185980880 / 33185980795, 15:36Z 28-08)
- **⚠️ Production CHƯA có fix**: `main` (prod, app.teacheros.io.vn) vẫn ở promote #103 (`119e100`) — **trước** cả cụm fix #121/#125/#126/#127/#128. QC reproducing steps trong issue trên prod sẽ vẫn thấy 0/0 cho đến lần promote kế tiếp.

## Critical Issues
1. **Không có** — bug gốc #104 đã xác nhận hết trên beta theo cả 4 AC.

## Observations (không chặn, đề xuất follow-up)
1. **[Low] Stats header là copy demo tĩnh**: tài khoản mới với 0 học viên vẫn hiện «5 học viên đang học · 2 cần chú ý» trên /students và «Doanh thu tháng 8 · 21.000.000đ / Còn nợ 1.9tr / Gói sắp hết 2» trên /tuition — trong khi kernel thật trả `students: []`. Đây là seeded demo copy, không phải bug của #104; nên mở follow-up issue nếu muốn ẩn/replace bằng dữ liệu thật cho account mới.
2. **[Low] e2e flaky**: `no-service-worker.spec.ts:60` (deployed /sw.js stub self-unregisters) fail 1/2 lần khi chạy full suite, pass khi chạy riêng — race giữa `expect.poll` và SW registration dưới load. Cân nhắc tăng poll timeout/interval trong spec.
3. **[Low] Dọn data test staging**: tài khoản `qc104-retest-1787973975@test.local` + học viên `QC-104-RETEST` trên staging D1 (junk row được chấp nhận theo design; có thể bỏ qua).

## Unresolved Questions
- Không có câu hỏi chặn. Việc test trên tài khoản QC gốc `usertest1@mail.com` vẫn không khả thi (không có password); đã tái lập đúng repro bằng account mới trên cùng môi trường beta, giống cách retest #121.
- **Recommendation giữ nguyên từ report #121**: promote develop → main để prod nhận toàn bộ cụm fix (#104, #121, #125–#128), sau đó QC re-test nhanh trên prod.
