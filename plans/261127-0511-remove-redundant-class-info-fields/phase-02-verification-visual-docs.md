---
phase: 2
title: "Phase 2: E2E Coverage, Verification, Visual Audit, POT & Docs"
status: completed
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: E2E Coverage, Verification, Visual Audit, POT & Docs

## Overview

Khắc phục lỗi đường dẫn percent-encoded (`fileURLToPath`) trong `helpers-quiz.ts` và `student-class-detail.spec.ts` cho worktree tiếng Việt, mở rộng `seedQuizFixture` với `classMeta?` (allowlist cột tĩnh, bảo toàn mặc định DB `mode = "Online"` và cột `start_date`) để `specs/student-class-detail.spec.ts` kiểm chứng thật trên trình duyệt cả 4 mục giữ lại, việc ẩn `Khoá` & `Số buổi đã học`, lẫn positive assertions cho `JourneySummitCard` & `RingStat`, đồng thời tích hợp cờ opt-in `CAPTURE_POT=1` + `POT_PREFIX` chụp 4 ảnh POT sạch PII (`1440×900` Light/Dark, `768×1024`, `375×812`) + `320px` reflow + toggle `ThemeToggle` giữ qua reload (`localStorage.theme`) + `Tab` focus `mailto:` trong cùng một lần chạy Playwright cô lập (`E2E_HOSTNAME=127.0.0.1`). Cuối cùng đồng bộ `DESIGN.md`, chạy toàn bộ local gates và `design:compare`, khôi phục mọi ảnh lịch sử bị ghi đè ngoài phạm vi.

## Files to Modify

<!-- Updated: Red Team Session 2026-11-27 - fix fileURLToPath on UTF-8 worktree, safe classMeta SQL allowlist, opt-in CAPTURE_POT in spec instead of ad-hoc server stack -->
- Modify: `apps/e2e/specs/helpers-quiz.ts` (đổi `openDb()` dòng `87` sang `fileURLToPath(new URL("../local.db", import.meta.url).href)` khớp `boot.ts:98`; thêm `classMeta?: { level?: string; mode?: string; schedule?: string; startDate?: string }` theo allowlist cột tĩnh `level`, `mode`, `schedule`, `start_date` chỉ nối khi giá trị `!== undefined` để giữ nguyên mọi DB `DEFAULT` bao gồm `mode = "Online"`)
- Modify: `apps/e2e/specs/student-class-detail.spec.ts` (đổi `screenshots` dòng `331-334` sang `fileURLToPath`; truyền `classMeta` synthetic có khung giờ khác `"18:30"`: `level: "Band 6.5"`, `mode: "Online"`, `schedule: '{"days":[1,4],"start":"19:00","end":"20:30"}'`, `startDate: "2026-12-15"`; assert đầy đủ trên `infoCard` + positive assertions trên `JourneySummitCard` & `RingStat`; thêm nhánh opt-in `CAPTURE_POT=1` chụp 4 ảnh POT kèm kiểm tra `320px` reflow, `ThemeToggle` + reload `localStorage.theme`, và `Tab` focus `mailto:`)
- Modify: `DESIGN.md` (dòng `111–119`: cập nhật mô tả `ClassInfoCard` 4 mục và ghi rõ lý do gỡ `Khoá` + `Số buổi đã học` cùng đánh đổi đầy đủ gồm cả lớp 0 buổi vào mục `Lệch có chủ đích` so với `StudentClass.tsx` của design v2)
- Create (POT artifacts): `plans/reports/${POT_PREFIX}-class-info-card-{desktop,dark,tablet,mobile}.png` (với `POT_PREFIX` lấy số GitHub issue tạo ở bước 5 của pipeline `ak-vibe` trước khi chạy Phase 1–2; fallback `"class-info"` nếu chạy độc lập ngoài pipeline)

## Requirements

- [x] Sửa `apps/e2e/specs/helpers-quiz.ts:85-90` dùng `fileURLToPath(new URL("../local.db", import.meta.url).href)` và `apps/e2e/specs/student-class-detail.spec.ts:331-334` dùng `fileURLToPath(new URL("../../../plans/261019-0648-student-portal-nav-menu/screenshots/", import.meta.url))` để tránh lỗi `SQLITE_CANTOPEN` và ghi rò ảnh chụp ra thư mục percent-encoded ngoài worktree. <!-- Updated: Red Team Session 2026-11-27 - UTF-8 worktree path safety -->
- [x] Thêm `classMeta?` vào `seedQuizFixture` (`apps/e2e/specs/helpers-quiz.ts:92-125`) bằng danh sách cột allowlist tĩnh (`[["level", opts.classMeta?.level], ["mode", opts.classMeta?.mode], ["schedule", opts.classMeta?.schedule], ["start_date", opts.classMeta?.startDate]]`), chỉ append cột & `?` khi `val !== undefined` (tuyệt đối không nội suy key/value vào SQL và không ghi đè `DEFAULT "Online"` của cột `mode` khi không truyền). <!-- Updated: Red Team Session 2026-11-27 - SQL allowlist + preserve DB mode default -->
- [x] Cập nhật `apps/e2e/specs/student-class-detail.spec.ts:43-50, 151-160`:
  - Truyền `classMeta: { level: "Band 6.5", mode: "Online", schedule: '{"days":[1,4],"start":"19:00","end":"20:30"}', startDate: "2026-12-15" }` (lịch `19:00–20:30` tách biệt khỏi giờ buổi học `18:30` để không va chạm dòng `158`).
  - Assert `infoCard` (`region[name="Thông tin lớp học"]`) chứa đủ 4 mục (`Lịch` / `T3 & T6 · 19:00–20:30`, `Hình thức` / `Online`, `Giáo viên` / `teacherName` / `mailto:${teacherEmail}`, `Khai giảng` / `Thứ Ba, 15/12/2026`) và KHÔNG chứa `Khoá`, `Band 6.5`, `Số buổi đã học`, `/\d+\/\d+\s*buổi/`, `Buổi tới:`, `18:30`, `/\d+\s*tháng/`.
  - Assert positive ngoài `infoCard`: `JourneySummitCard` hiển thị `"Band 6.5"` và `"1/4 buổi"`; `RingStat` (`"Buổi đã diễn ra"`) hiển thị `"1/4"` để chứng minh DB thật sự có `level` và số buổi, tránh false-pass.
  - Bổ sung khối opt-in `if (process.env.CAPTURE_POT === "1")` ngay trong test 1 (sau khi đã mở `/classes/${fixture.classId}` trên dữ liệu synthetic `@test.local`/`@e2e.local`):
    1. Kiểm tra `Tab` focus đạt tới link `mailto:${teacherEmail}` trong `infoCard`.
    2. Chụp `desktop` (`1440×900` Light), bấm `ThemeToggle` (`getByRole("switch", { name: "Giao diện tối" })`), `page.reload()` xác nhận `document.documentElement.classList.contains("dark")` và `localStorage.getItem("theme") === "dark"`, chụp `dark` (`1440×900` Dark), bấm toggle trở lại Light, chụp `tablet` (`768×1024`) và `mobile` (`375×812`) vào `fileURLToPath(new URL("../../../plans/reports/", import.meta.url))` với prefix `process.env.POT_PREFIX ?? "class-info"`.
    3. Kiểm tra không tràn ngang (`scrollWidth <= clientWidth`) tại đủ 4 chiều rộng `1440`, `768`, `375`, `320` rồi khôi phục viewport `1440×900`. <!-- Updated: Red Team Session 2026-11-27 - consolidated loopback POT capture + real ThemeToggle reload + positive assertions -->
- [x] Cập nhật `DESIGN.md:111-119`: mô tả `ClassInfoCard` 4 mục (`Lịch`, `Hình thức`, `Giáo viên`, `Khai giảng`) và ghi rõ lý do gỡ `Khoá` + `Số buổi đã học` cùng đánh đổi đầy đủ (kể cả tab phụ và lớp 0 buổi `lessons.length === 0` — `cls.level` vẫn hiển thị ở `ClassCard` trên `/` và `/classes`) vào đoạn `Lệch có chủ đích`; không chạm `docs/_reverse/*`. <!-- Updated: Red Team Session 2026-11-27 - accurate 0-lesson trade-off in DESIGN.md -->
- [x] Chạy toàn bộ local gates: `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter student test`, `pnpm test`.
- [x] Chạy targeted E2E + chụp 4 ảnh POT trong cùng 1 run loopback-only:
  `E2E_HOSTNAME=127.0.0.1 E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 CAPTURE_POT=1 POT_PREFIX=<issue> pnpm --filter e2e e2e specs/student-class-detail.spec.ts` (không chạy full E2E theo `AGENTS.md`), sau đó chạy `git checkout -- plans/261019-0648-student-portal-nav-menu/screenshots/` để khôi phục 3 ảnh tracked ngoài phạm vi.
- [x] Chạy `pnpm design:compare --screens s-class-detail --force` (fallback `--side app --force` nếu không clone được `teacheros-design-v2`; lưu ý `design-seed.ts` không seed `class.level` nên `design:compare` kiểm chứng regression bố cục/token của `ClassInfoCard`, còn việc ẩn `Khoá` được chứng minh bởi unit tests + E2E + 4 ảnh POT ở trên), sau đó khôi phục ngay mọi ảnh baseline lịch sử tại `plans/261020-1446-378-redesign-design-v2/screenshots/` bằng `git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/`.
- [x] Mở đọc trực quan cả 4 ảnh POT (`plans/reports/<issue>-class-info-card-{desktop,dark,tablet,mobile}.png`) bằng `read_file` xác nhận **0 PII thật / 0 token / 0 mục Khoá / 0 mục Số buổi đã học / 0 tràn ngang**, và kiểm tra cả `git status` lẫn thư mục cha `/root/orca/workspaces/teacher-os/` đảm bảo không tồn tại thư mục rác percent-encoded.

## Implementation Steps

1. Sửa `apps/e2e/specs/helpers-quiz.ts` (`fileURLToPath` + `classMeta?` allowlist), `apps/e2e/specs/student-class-detail.spec.ts` (`fileURLToPath` + `classMeta` + assertions + nhánh `CAPTURE_POT=1`), và `DESIGN.md:111-119`.
2. Chạy local gates toàn workspace: `pnpm exec biome check . && pnpm check-types && pnpm test`.
3. Chạy targeted E2E kèm `E2E_HOSTNAME=127.0.0.1` + `E2E_LMS_PORT=8101` + `CAPTURE_POT=1 POT_PREFIX=<issue>` trên `specs/student-class-detail.spec.ts`, sau đó chạy `git checkout -- plans/261019-0648-student-portal-nav-menu/screenshots/`.
4. Chạy `pnpm design:compare --screens s-class-detail --force` (hoặc `--side app --force`), sau đó chạy `git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/` nếu có ảnh baseline lịch sử bị ghi đè.
5. Soi trực quan cả 4 ảnh POT bằng `read_file`, kiểm tra `git status` sạch PNG lịch sử ngoài phạm vi và không có thư mục rác percent-encoded ở thư mục cha.

## Todo

- [x] Fix `fileURLToPath` and add static-allowlist `classMeta?` to `seedQuizFixture` in `apps/e2e/specs/helpers-quiz.ts`
- [x] Fix `fileURLToPath`, strengthen `ClassInfoCard`/`JourneySummitCard`/`RingStat` assertions, and add opt-in `CAPTURE_POT=1` verification block in `apps/e2e/specs/student-class-detail.spec.ts`
- [x] Sync `DESIGN.md` lines 111-119 with 4-item `ClassInfoCard` and full intentional deviation trade-off (including 0-lesson classes)
- [x] Run `pnpm exec biome check .`, `pnpm check-types`, and `pnpm test`
- [x] Run loopback targeted E2E with `CAPTURE_POT=1 POT_PREFIX=<issue>` and revert unrelated `student-nav-*.png` overwrites
- [x] Run `pnpm design:compare --screens s-class-detail --force` (or `--side app --force`) and revert historical baseline PNG overwrites
- [x] Visually inspect all 4 PII-free POT screenshots via `read_file` and verify clean `git status`

## Success Criteria

- Toàn bộ gates (`biome`, `check-types`, workspace tests), targeted E2E `specs/student-class-detail.spec.ts` (kèm `CAPTURE_POT=1`), và `design:compare` exit 0; `git status` không dính PNG lịch sử ngoài phạm vi và không phát sinh thư mục rác percent-encoded.
- 4 ảnh POT sạch PII (`plans/reports/<issue>-class-info-card-{desktop,dark,tablet,mobile}.png`) xác nhận trực quan `ClassInfoCard` chỉ còn đúng 4 mục (`Lịch`, `Hình thức`, `Giáo viên`, `Khai giảng`) gọn 1 hàng trên desktop/tablet và 2×2 trên mobile, không còn `Khoá` hay `Số buổi đã học`, Light & Dark giữ trạng thái qua reload, `0px` tràn ngang từ `320px` tới `1440px`, và `Tab` focus `mailto:` hoạt động đúng.
