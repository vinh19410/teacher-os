# Evidence — issue #58 (gỡ GCal badge hardcode / chrome giả trên schedule)

Branch: `feat/58-remove-schedule-fake-chrome` · Base: `origin/develop` @ bdf71b0 · Ngày: 2026-08-21

## Change set

| File | Thay đổi |
|------|----------|
| `apps/web/src/lib/format-schedule.ts` | Thêm `lessonDayLabel(day)` — 1-based (lesson-day convention), JSDoc phân biệt với `parseSchedule().days` 0-based |
| `apps/web/src/lib/format-schedule.test.ts` | Unit test mới: 1→"T2", 7→"CN", 0/8→fallback "day N" |
| `apps/web/src/lib/kernel-runtime.contract.test.ts` | Contract test mới "schedule flow shows no fake chrome" — khóa vĩnh viễn schedule/lesson-modal/$classId/mock-data không còn GCal, todayIdx, dayDates, "19–25/08", "11 buổi học", "← Trước", "Sau →", "Tuần này" (mirror pattern dashboard) |
| `apps/web/src/routes/_auth/schedule.tsx` | Gỡ: Badge "GCal · Đã bật", cả row chip nav ("← Trước/Tuần này/Sau →"), `todayIdx` + class `today`/`accent-blue`, block `{dayDates[i]}`, prop `lead` của PageHead; dọn dead imports `Badge`/`Button`/`Card` |
| `apps/web/src/components/schedule/lesson-modal.tsx` | `T{day+1} {dayDates}/08` → `{lessonDayLabel(day)} · {time} ({dur} phút)` |
| `apps/web/src/routes/_auth/classes/$classId.tsx` | Cột "Ngày": `T{l.day+1} {dayDates}/08` → `{lessonDayLabel(l.day)}` |
| `apps/web/src/lib/mock-data.ts` | Xóa `export const dayDates` (0 usage còn lại) |

Không thêm component/CTA/stub thay thế nào (Zalo/GCal non-goal — giữ nguyên).

## Gates (mirror CI `.github/workflows/ci.yml`)

| Gate | Lệnh | Kết quả |
|------|------|---------|
| Unit/contract tests (web) | `pnpm -F web test` | **20 files / 201 tests pass** (RED→GREEN TDD: fail 3 trước khi implement, pass 201 sau) |
| Toàn repo test | `pnpm test` | **pass** (turbo test + `test:ci-workflow` + `test:topology-drift` — 5/5 script tests) |
| Typecheck | `pnpm check-types` | **5/5 tasks successful** |
| Biome (read-only, đúng chế độ CI) | `pnpm exec biome check .` | **exit 0** (2 warnings có sẵn trên develop tại `tuition.tsx`, ngoài scope, không phải error) |
| Build | `pnpm build` | **2/2 tasks successful** |

## Scoped grep (đúng pattern red-team đã sửa — KHÔNG grep toàn `apps/web/src` vì "Tuần này" tồn tại hợp lệ ở `settings.tsx:29` + negative assertion dashboard)

```
grep -rn "dayDates\|todayIdx\|GCal\|19–25\|11 buổi học\|← Trước\|Sau →" \
  apps/web/src/routes/_auth/schedule.tsx \
  apps/web/src/components/schedule/lesson-modal.tsx \
  "apps/web/src/routes/_auth/classes/$classId.tsx" \
  apps/web/src/lib/mock-data.ts
```
→ **0 kết quả** (exit 1). Tương đương assertion trong contract test mới — gate tự động hóa vĩnh viễn.

Import check riêng cho `schedule.tsx`: `grep -n "Badge\|Button\|Card\|dayDates"` → **0 kết quả** (biome/tsc không bắt unused import — kiểm thủ công theo red-team finding).

## Ghi chú

- **Dist grep bị chặn bởi `.ckignore` hook của máy local** (pattern `dist`). Đây là kiểm tra dự phòng: `dist/` là artifact không track trong git (CI build riêng), chuỗi giả chỉ tồn tại nếu còn ở source — source đã khóa bằng contract test + scoped grep = 0. Không mất đảm bảo nào.
- Contract test dashboard hiện hữu (`kernel-runtime.contract.test.ts`) và các assertion đọc `$classId.tsx`/`lesson-modal.tsx` (dòng 195-208 gốc) vẫn pass nguyên vẹn — không weaken test nào.
- `lesson.day` 1-based verified trực tiếp: `apps/server/src/routes/kernel.ts:78-79` comment "lesson.day is 1-7 with 1 = Monday... hence the +1" + `:96` `day: (parsed.days[...] ?? 0) + 1`; contract `packages/api/src/contracts.ts:167` `min(1).max(7)`.
