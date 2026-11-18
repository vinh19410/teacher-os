# Plan: Public video hướng dẫn kiểm tra đầu vào lên msmy.io.vn (#745)

- **Status:** In progress
- **Issue:** https://github.com/vinh19410/teacher-os/issues/745
- **Objective:** Đưa `huong-dan-kiem-tra-dau-vao.mp4` vào `apps/profile/public/` và phát hành qua `develop` → `main` để truy cập công khai tại `https://msmy.io.vn/huong-dan-kiem-tra-dau-vao.mp4`.

## Phases

1. **Move asset & local server support**
   - `git mv plans/reports/huong-dan-kiem-tra-dau-vao.mp4 apps/profile/public/huong-dan-kiem-tra-dau-vao.mp4`
   - Bổ sung `.mp4: "video/mp4"` và hỗ trợ HTTP `Range` trong [apps/profile/serve.mjs](../../apps/profile/serve.mjs)
   - Bổ sung test trong [apps/profile/tests/index.test.mjs](../../apps/profile/tests/index.test.mjs)
2. **CI smoke checks**
   - Bổ sung kiểm tra `HEAD $PROFILE_ORIGIN/huong-dan-kiem-tra-dau-vao.mp4` trả `200` và `content-type: video/mp4` trong `Smoke check profile` của [deploy-staging.yml](../../.github/workflows/deploy-staging.yml) và [deploy.yml](../../.github/workflows/deploy.yml)
3. **Verify & ship (`--both --merge`)**
   - Chạy `pnpm --filter profile test`, `pnpm test:ci-workflow`, `pnpm exec biome check .`, `pnpm check-types`
   - Review độc lập → PR & merge vào `develop` → xác nhận staging live → PR & merge `develop` vào `main` → chờ E2E + production deploy → xác nhận `https://msmy.io.vn/huong-dan-kiem-tra-dau-vao.mp4` → đăng POT comment lên `#745`

## Acceptance Criteria

- Không còn file trùng lặp tại `plans/reports/huong-dan-kiem-tra-dau-vao.mp4`.
- `apps/profile/public/huong-dan-kiem-tra-dau-vao.mp4` tồn tại (`13.251.764` bytes), được `buildProfile()` copy nguyên vẹn vào `dist/`.
- `pnpm --filter profile test`, `pnpm test:ci-workflow`, `pnpm exec biome check .`, `pnpm check-types` pass.
- Staging (`https://profile.staging.teacheros.io.vn/huong-dan-kiem-tra-dau-vao.mp4`) và Production (`https://msmy.io.vn/huong-dan-kiem-tra-dau-vao.mp4`) trả HTTP `200` với `content-type: video/mp4`.
