# Gate Verification — Release Promotion develop→main (v0.0.10)

- **Ngày giờ:** 2026-09-30, 20:33–20:52 (Asia/Saigon, +07)
- **Repo:** /Users/vinhtran/Documents/project/personal/teacher-os
- **HEAD:** `a119905` — `feat: teacher preview quiz take + review simulation — shared quiz logic/renderers, sim tab (#285) (#287)` (nhánh `develop`)
- **Phạm vi:** Mirror CI (`ci.yml`) + E2E (`e2e.yml`) tại HEAD, gate verification local trước khi promote `develop` → `main`.
- **Ràng buộc:** Read-only với source — không sửa code, không fix test, không dùng `biome --write`.

## Kết quả tổng hợp

| # | Gate | Lệnh | Kết quả | Chi tiết |
|---|------|------|---------|----------|
| 1 | Biome (read-only) | `pnpm exec biome check .` | **PASS** | exit 0; 571 files checked; 0 error, 0 fixable; 1 info deprecation |
| 2 | Type check | `pnpm check-types` | **PASS** | exit 0; turbo 7/7 tasks successful (cached) |
| 3a | Unit tests (uncached) | `pnpm exec turbo run test --force` | **PASS** | exit 0; turbo 6/6 tasks; **1.763 passed / 0 failed / 0 skipped** |
| 3b | CI workflow guard | `pnpm test:ci-workflow` | **PASS** | exit 0; 3 passed / 0 failed |
| 3c | Topology drift guard | `pnpm test:topology-drift` | **PASS** | exit 0; 8 passed / 0 failed |
| 4 | Build | `pnpm build` | **PASS** | exit 0; turbo 4/4 tasks successful (0 cached); 1 warning chunk size |
| 5 | E2E | `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` | **PASS** | exit 0; **108 passed / 1 skipped / 0 failed** (109 total), 3.7m |

**Tổng: tất cả 7 gate đều XANH. Không có test fail, không có blocking issue.**

## Chi tiết từng gate

### 1. Biome check (read-only) — PASS

- Lệnh: `pnpm exec biome check .` (không `--write`, đúng như `ci.yml:32`).
- Kết quả: `Checked 571 files in 383ms. No fixes applied.` — exit code 0.
- 1 info (không phải lỗi): `biome.json:45:12` — trường `recommended` trong `linter` đã deprecated, Biome khuyến nghị migrate bằng `biome migrate` (sẽ removed ở major tiếp theo). Không ảnh hưởng gate hiện tại.

### 2. `pnpm check-types` — PASS

- Exit 0, turbo: `7 successful, 7 total` (toàn bộ cache hit — cây source không đổi so với lần chạy trước, đúng hành vi turbo; gate `--force` bên dưới đã chạy lại thật phần test).

### 3. Tests — PASS

`pnpm exec turbo run test --force` (uncached, chạy 2 lần: lần 1 xác nhận exit 0, lần 2 với `--output-logs=full` để lấy số liệu từng suite):

| Suite | Test files | Tests | Kết quả |
|-------|-----------|-------|---------|
| server (vitest) | 26 | 427 | passed |
| web (vitest) | 107 | 1.145 | passed |
| student (vitest) | 12 | 110 | passed |
| @teacher-os/auth (vitest) | 5 | 59 | passed |
| @teacher-os/infra (vitest) | 1 | 17 | passed |
| landing (node --test) | — | 5 | passed |
| **Tổng** | **151** | **1.763** | **1.763 passed / 0 failed / 0 skipped** |

- Turbo: `6 successful, 6 total`, `Cached: 0 cached, 6 total`, ~15,6s.
- `pnpm test:ci-workflow`: 3 passed / 0 failed (exit 0) — `ci.yml`, `e2e.yml` khớp quality-gate contract; staging deploy manual-only.
- `pnpm test:topology-drift`: 8 passed / 0 failed (exit 0) — CORS default, google redirect URI, LANDING_ORIGIN, APP_DOMAIN... đều khớp.
- **Tổng cộng toàn bộ test script của root `pnpm test`: 1.774 passed / 0 failed / 0 skipped.**

### 4. `pnpm build` — PASS

- Exit 0, turbo: `4 successful, 4 total`, `Cached: 0 cached, 4 total`, ~3,0s.
- Warning duy nhất (không chặn, đã tồn tại từ trước): `web` chunk `index-B_3qoSpe.js` 866,17 kB (gzip 271 kB) > 500 kB — Vite gợi ý code-split. Chỉ là cảnh báo bundle size, không phải lỗi build.

### 5. E2E — PASS

- Pre-check: `lsof -i :8100 -i :8101 -i :8103` → trống (exit 1, không process nào chiếm).
- Lệnh (mirror `e2e.yml:35` `pnpm --filter e2e e2e` + override port theo AGENTS.md, playwright.config.ts:5–7 hỗ trợ đủ 3 biến):
  `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`
- Kết quả: **108 passed / 1 skipped / 0 failed** (109 total), 3,7 phút, exit 0.
- 1 skipped (có chủ đích, theo điều kiện môi trường): `specs/profile.spec.ts:140` — "nút Kết nối Google mở redirect sang Google khi cấu hình OAuth thật" (chỉ chạy khi có OAuth thật).
- Playwright tự boot stack self-contained (API + web + student qua webServer config); sau khi chạy xong các port 8100/8101/8103 được giải phóng (lsof xác nhận trống). Không để lại process nền.

## Mirror CI mapping

| Bước CI | Local mirror | Kết quả |
|---------|--------------|---------|
| `pnpm exec biome check .` (ci.yml:32) | giống hệt | PASS |
| `pnpm test` (ci.yml:33) = turbo test + ci-workflow + topology-drift | chạy riêng từng phần, test turbo với `--force` (uncached) | PASS |
| `pnpm check-types` (ci.yml:34) | giống hệt | PASS |
| `pnpm build` (ci.yml:35) | giống hệt | PASS |
| `pnpm install --frozen-lockfile` | không chạy lại (node_modules đã có, không đổi lockfile) | — |
| `pnpm --filter e2e e2e` (e2e.yml:35) | + override port 8100/8101/8103 (dev stack không chiếm port này nhưng vẫn dùng override theo AGENTS.md) | PASS |

## Quan sát phụ (không chặn)

1. **Working tree cuối chạy có `M CHANGELOG.md`** (4 dòng thêm, entry tính năng "Xem trước" #282 + mục CI/Infra về script `dev:bare`). Thay đổi này **không do bước verification tạo ra** (toàn bộ lệnh gate không ghi file nào ngoài `dist/`); nó xuất hiện giữa chừng từ process/agent bên ngoài. Docs-only, không ảnh hưởng kết quả gate (biome đã chạy trước khi thay đổi xuất hiện; markdown không thuộc phạm vi test/type/build). **Lưu ý người promote:** kiểm tra lại `git status` trước khi tạo PR vào main để quyết định commit thay đổi này hay không.
2. Warnings không chặn trong log e2e (dev-time, từ WebServer Vite): tanstack-router code-split warnings cho các route file export Route; `configLoader: 'native'` unsupported feature warning (vite.config.ts:11); route file `routes/_auth/reports.test.tsx` không export Route (nên đổi tên tiền tố `-` hoặc ignore pattern nếu không cố ý).
3. Biome deprecation `recommended` (mục 1) — nên chạy `biome migrate` trong một PR riêng sau release.

## Kết luận

Đủ điều kiện promote `develop` (a119905) → `main` cho v0.0.10: toàn bộ 7/7 gate xanh, không có fail, không có flaky quan sát được (turbo test --force chạy 2 lần, e2e 1 lần — 108/109 pass, 1 skip có chủ đích).

## Unresolved questions

- `M CHANGELOG.md` ngoài phạm vi: commit cùng PR release hay để lại?
- Chunk size warning web (866 kB): có đưa vào scope code-split sau release không (hiện chỉ là warning)?
