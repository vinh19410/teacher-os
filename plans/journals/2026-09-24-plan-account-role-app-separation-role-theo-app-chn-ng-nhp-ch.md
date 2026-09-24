---
title: "Plan account-role-app-separation: role theo app + chặn đăng nhập chéo"
date: 2026-09-24
summary: "Lập plan 260924-0215 (issue #260): user.role + better-auth hooks + API gates; red-team 3 reviewer → 9 cụm findings (3 Critical) đã áp dụng"
---

# Plan account-role-app-separation: role theo app + chặn đăng nhập chéo

## What happened
Hoàn tất planning cho yêu cầu "account tạo từ student portal → role student, không login được teacher app và ngược lại" qua ak-plan (mode hard: scout → researcher better-auth 1.6.27 → plan 4 phases → red-team 3 reviewer → validate → GitHub issue #260).

Phát hiện then chốt về hiện trạng: bảng user không có role; bootstrapMiddleware (apps/server/src/app.ts:69-82) tự cấp workspace teacher cho mọi user; cookie zone dùng chung cross-subdomain nên chặn form login là chưa đủ; server không biết sign-up đến từ app nào.

Researcher verify trực tiếp source better-auth 1.6.27 cài trong repo: databaseHooks.user.create.before (gán role, phủ cả OAuth), databaseHooks.session.create.before (chặn sign-in cả email lẫn Google; Google → 302 errorCallbackURL với ?error=&error_description=), getOAuthState() export từ better-auth/api, additionalFields input:false bắt buộc có cột thật.

Red-team (3 reviewer, tier Standard): 21 finding thô → 9 cụm accepted (3 Critical, 5 High, 1 Medium). Critical đáng nhớ nhất: backfill "membership thắng" dùng dữ liệu BỊ CHÍNH LỖ HỎNG đang vá làm bẩn (học viên từng mở nhầm teacher app có membership rác → bị khóa portal vĩnh viễn); và OAuth app-detection phụ thuộc client additionalData sẽ gãy với client bundle cũ → đổi thành server-side stamping trong hooks.before /sign-in/social.

## Decision
- D2 (user chốt): backfill "nguồn sử dụng đầu tiên thắng" theo created_at (membership trước student row → teacher; ngược lại → student) + audit query bắt buộc trước deploy + runbook flip.
- D5: server-side stamping OAuth app vào state tại /sign-in/social — client không khai báo gì (bundle-cũ-safe).
- D3: classifier chỉ tin Origin khớp chính xác origin đã biết; lạ/"null"/thiếu → student (least privilege).
- D9: phases 1-3 ship một release; cột role DEFAULT 'student'; post-deploy check count(role IS NULL)=0.
- D7 (user chốt): màn chặn teacher app chỉ có Đăng xuất, không link chéo sang portal.

## Next steps
- Thực thi: /ak:cook plans/260924-0215-account-role-app-separation/plan.md
- Lưu ý operator: chạy audit query overlap trên prod trước deploy (phase-01 bước 5); sau deploy kiểm tra count(role IS NULL).
- Plan stub 260924-0213-student-email-verification (email verification portal) còn TBD — liên quan miền portal identity, nên làm sau plan này.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
