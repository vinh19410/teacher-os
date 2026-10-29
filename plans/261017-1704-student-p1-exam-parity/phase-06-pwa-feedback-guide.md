---
title: "Phase 6: PWA + Feedback + Hướng dẫn"
status: todo
---

# Phase 6: PWA + Feedback + Hướng dẫn

## Context Links

- [Research §3/§4](../reports/researcher-report.md) · [Scout §F](../reports/scout-report.md)
- Phụ thuộc: Phase 1 (bảng student_feedback). Red-team findings #6, #8, #15.

## Overview

(a) Student app installable — manifest + icons + `apple-*` meta, **KHÔNG service worker**; (b) widget "Báo lỗi / Góp ý" + endpoint auth student (CSRF guard + rate limit best-effort + honeypot + pageUrl an toàn); (c) trang Hướng dẫn tiếng Việt. **Teacher `/feedback` view NGOÀI scope P1** (report chỉ yêu cầu endpoint — red-team #15): feedback lưu DB, tạm xem bằng SQL; view là follow-up.

## Key Insights

- **Cấm service worker**: issue #125 + spec `no-service-worker.spec.ts` (hiện CHỈ cover web — Phase 7 chắc chắn thêm student). PWA = manifest (icons 192/512 maskable, display standalone, theme DESIGN) + `apple-touch-icon` 180 + meta `apple-mobile-web-app-*` (Chrome/Edge installable không cần SW; iOS A2HS thủ công đọc apple-touch-icon). `apple-mobile-web-app-capable` mở full-screen không URL bar — chấp nhận có chủ đích, note trong guide.
- **Feedback phải qua guard CSRF** (red-team #6): cookie SameSite=None → route ghi trong student router cần Origin check; đăng ký `router.use("/feedback", quizWriteGuard)` + `requireStudent` (2 dạng path #320), handler nằm trong studentRoutes closure. ** KHÔNG mount app.ts riêng** (bootstrapMiddleware bỏ qua /api/student — mount riêng = không auth, comment :586-588).
- **Rate limit best-effort** (red-team #21/SA4): COUNT-then-INSERT không atomic trên D1 (không transaction — comment :1188) — chấp nhận race hẹp, GHI RÕ trong code comment + plan: quota mềm 5/giờ/học viên; e2e tuần tự vẫn verify được; multi-org mỗi org 5 (student row per-org) — chấp nhận.
- **pageUrl an toàn** (red-team #8): server chỉ chấp nhận relative path bắt đầu `/` (trim, reject `javascript:`/`http` tuyệt đối) — cap 500; honeypot `website` (input ẩn CSS, tabindex -1) → 200 im lặng.
- `lucide-react` có sẵn cả 3 app — icon widget dùng `Bug`/`MessageSquare`.

## Requirements

- [ ] Manifest hợp lệ + icons (192/512 thường + maskable, apple-touch 180) + apple meta; KHÔNG SW.
- [ ] Widget: nút nổi (aria-label "Báo lỗi / Góp ý") → dialog (category Lỗi/Góp ý/Câu hỏi/Khác + message + honeypot) → POST `/student/feedback` → toast.
- [ ] Endpoint: auth student + Origin guard; rate limit 5/giờ (429 + Retry-After, best-effort); validate category enum + message 1..2000 + pageUrl relative; honeypot im lặng.
- [ ] Trang `/guide` tiếng Việt đủ tính năng mới; entry từ shell header.

## Architecture

```
Student shell → <FeedbackWidget/> (nút nổi + dialog)
POST /api/student/feedback {category, message, pageUrl, website}
  → honeypot filled → 200 {ok} im lặng (không lưu)
  → COUNT(student, 1h) ≥ 5 → 429 Retry-After
  → validate → INSERT student_feedback (orgId, studentId, ua≤300)
Teacher xem feedback: SQL query (follow-up: view apps/web)
Icons: apps/student/public/icons/* + manifest.webmanifest + index.html meta
```

## Files to Create / Modify

- Create: `apps/student/public/manifest.webmanifest`
- Create: `apps/student/public/icons/` (icon-192/512, maskable-192/512, apple-touch-icon 180)
- Modify: `apps/student/index.html` (manifest link + apple meta + theme-color)
- Modify: `apps/server/src/routes/student.ts` (POST `/feedback` trong closure + use() guard/requireStudent 2 dạng path)
- Modify: `packages/api/src/contracts.ts` (feedback schemas — Phase 1 đã có bảng)
- Create: `apps/student/src/components/layout/feedback-widget.tsx`
- Modify: `apps/student/src/components/layout/student-shell.tsx` (widget + link Hướng dẫn header)
- Create: `apps/student/src/routes/_auth/guide.tsx`
- Modify: `apps/student/src/lib/repos/student.ts` (`sendFeedback`)
- Test: `apps/server/src/feedback.test.ts` (trong include pattern — auth 401, honeypot, 429 boundary tuần tự, pageUrl `javascript:` reject)

## Implementation Steps

1. Icons: tìm logo/wordmark (apps/web/public, assets/); không có → script sinh icon minimal (nền token dark + mark cam `--accent #ff5b1f`, maskable safe-zone ≥80%); kích thước đúng.
2. Manifest + index.html meta; DevTools Application verify parse.
3. Server POST feedback (§ Architecture; Origin check qua quizWriteGuard pattern; COUNT rate limit).
4. Widget UI: nút nổi (safe-area-inset-bottom; không che nội dung 375px); dialog form; 429 → "Bạn đã gửi nhiều lần, thử lại sau"; thành công toast + đóng.
5. `/guide`: các section — Làm bài & tự lưu; Chế độ Thi thật (timer, hết giờ tự nộp, đồng hồ theo giờ hệ thống); Đánh dấu câu xem lại; Audio Listening (thi thật phát 1 lần — honor-policy ghi thẳng); Xem lại & giải thích; Lịch sử & streak; Cài app (A2HS iOS/Android — iOS qua Share menu, app mở full-screen); Báo lỗi/Góp ý.
6. Server test + gate + 3 viewport + screenshots.

## Todo

- [ ] Icons + manifest + apple meta (KHÔNG SW)
- [ ] Server POST /feedback (guard + requireStudent + rate limit + pageUrl + honeypot) + server test
- [ ] Widget student + repos + mount shell
- [ ] Trang /guide + entry header
- [ ] Gate local + screenshots 3 viewport

## Success Criteria

- Manifest parse + install available (Chrome desktop); iOS A2HS icon đúng.
- Không có SW registration trong bundle student (grep + spec phase 7).
- Gửi feedback → row trong bảng (verify SQL); tuần tự 6 lần → lần 6 nhận 429 + UI thông báo; honeypot → 200 không lưu; `javascript:` pageUrl → 400.
- `/guide` đủ section + vào được từ header mọi trang student.

## Risk Assessment

- Icon nguồn không có → script sinh (kèm script trong repo để tái tạo).
- Widget che nội dung mobile → safe-area + kiểm 375×812.
- Quota mềm race: chấp nhận (ghi comment); nếu spam thật → theo dõi sau.

## Security Considerations

- Auth student + Origin check (SameSite=None); honeypot; enum + caps; pageUrl chỉ relative (chống stored-XSS cho view follow-up); ua cap 300.
- KHÔNG anonymous endpoint mới mở surface public.

## Next Steps

→ Phase 7 (E2E & verification); follow-up riêng: teacher /feedback view.
