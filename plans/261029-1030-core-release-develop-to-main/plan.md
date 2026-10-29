---
title: "Release lõi vận hành lớp + học phí: develop → main"
status: released
created: 2026-10-29
owner: Vinh Tran (release operator + restore authority)
blockedBy: []
---

# Release lõi: develop → main

## Why

Production đứng ở `origin/main` = `2ba23a22` (2026-10-07). `develop` đi trước 306 commit, 22 migration (0035–0056), 2164 file. Không feature nào trong số đó từng chạm production hay được dùng thật, nên pilot M4 chưa bắt đầu (`docs/project-roadmap.md`: 5/5 DOD M4 chưa tick). Mục tiêu: đưa **lõi vận hành lớp + học phí** lên production an toàn, ẩn phần chưa sẵn sàng, rồi mở self-pilot.

Lõi = đăng nhập, lớp, học viên, syllabus, lịch (tháng/tuần/ngày + kỳ nghỉ), điểm danh (theo buổi + theo ngày), hóa đơn, thu tiền, sổ công nợ, nhắc học phí và nhật ký thông báo (TOS-6…TOS-23 + M1–M3).

Ngoài lõi (không phải mục tiêu release, chỉ phải **không gây hại**): nhập đề AI (TOS-24…27), chấm nháp AI (TOS-30…33), ví Credit, admin console + thư viện đề, cổng học viên (`apps/student`), SePay Bank Hub, từ vựng, báo cáo phụ huynh.

## Ràng buộc đã xác minh từ repo

- Merge `develop` → `main` **tự deploy prod** (`.github/workflows/deploy.yml`): quality gates + full E2E + `alchemy deploy --stage prod` + smoke `/readyz`. Không cherry-pick được 306 commit đan xen, nên **cả develop ship**, ta kiểm soát bằng gating và kiểm chứng.
- Deploy tạo luôn worker student + admin, binding `AI`, bucket `library-audio` (`packages/infra/alchemy.run.ts`). Binding `AI` khai báo vô điều kiện.
- `/readyz` chỉ kiểm bảng, **không kiểm cột**. Runbook ghi các migration thêm cột (0033, 0035…) làm trang 500 mà `/readyz` vẫn xanh. Smoke tự động không đủ.
- Migration forward-only; rollback code không hoàn tác dữ liệu; hoàn tác migration = restore (chỉ Vinh Tran).
- Staging deploy bằng `git push origin develop:staging`, không tự chạy khi merge develop.

## Chưa biết, phải xác minh trong plan (không giả định)

1. Trạng thái migration thực của D1 prod (giả định 0034 là cuối, chưa kiểm).
2. Org mới có Credit mặc định không (`TRIAL_CREDITS`) và route AI có lộ ra UI giáo viên prod không.
3. Secret SePay trên prod có đang trống không (route phải trả 503 `BANKHUB_DISABLED`).
4. Cổng học viên và admin: ship hay ẩn (quyết định ở phase 1).

## Phases

### Phase 1. Kiểm kê và quyết định gating (chỉ đọc)

- [ ] 1.1 Liệt kê migration 0035–0056: loại (additive hay không), bảng/cột nào code mới bắt buộc. Tìm migration không additive (DROP, NOT NULL không default, unique index mới trên dữ liệu có sẵn).
- [ ] 1.2 Đọc trạng thái prod: `wrangler d1 migrations list` (hoặc ledger) → xác nhận 0034 là cuối. Ghi kết quả vào evidence, không ghi ID.
- [ ] 1.3 Lập bảng "bề mặt lộ ra khi deploy": mỗi tính năng ngoài lõi → điểm vào UI/API → đang bật hay tắt trên prod → quyết định (giữ / ẩn / fail-closed).
- [ ] 1.4 Quyết định cho: AI (nên fail-closed trên prod tới khi có đường nạp Credit và bảng giá), cổng học viên, admin, SePay, từ vựng, báo cáo.
- [ ] 1.5 Tạo GitHub issue theo dõi release, label `ai-handle`. Đồng bộ Jira nếu có key TOS liên quan (`AGENTS.md`).

Exit: bảng gating được Vinh duyệt.

### Phase 2. Gating phần ngoài lõi

Mỗi mục là một PR nhỏ vào `develop`, có test hành vi. Phạm vi cụ thể do Phase 1 chốt, ứng viên:

- [ ] 2.1 AI: prod không bind `AI` hoặc cờ tắt, để `getExamExtractor`/`getAiGrader` trả `undefined` (đã fail-closed `AI_GRADING_DISABLED` / route 503 theo `index.ts`). Ẩn mục nav "Nhập đề AI" khi tắt. Test: route trả đúng mã khi tắt, nav không hiện.
- [ ] 2.2 Admin: xác nhận `ADMIN_EMAILS` không set trên prod nghĩa là không ai đăng ký admin. Nếu chưa dùng, chấp nhận ship worker nhưng không cấp admin.
- [ ] 2.3 SePay: xác nhận secret rỗng → 503. Không merge PR #491 trong release này (không thuộc lõi). Nếu #491 chứa migration thì không đưa vào để giữ nhóm migration đã rehearse.
- [ ] 2.4 Cổng học viên: nếu quyết định ẩn, không gắn domain `student.` hoặc chặn sign-up role student; nếu ship, thêm vào danh sách smoke. #358 để ngoài release.
- [ ] 2.5 Dọn CTA no-op trong luồng lõi (nút Billing "coming soon" đã có, kiểm lại) theo DOD "0 CTA no-op".

Exit: develop CI xanh, bảng gating khớp hành vi thực.

### Phase 3. Rehearse migration từ trạng thái prod

Staging đã migrate liên tục nên không chứng minh được bước nhảy 0034 → 0056.

- [ ] 3.1 Tạo D1 throwaway, restore ledger/schema ở 0034 (dùng snapshot schema tại commit `2ba23a22` hoặc export prod đã ẩn dữ liệu nhạy cảm), áp 0035–0056 bằng quy trình runbook "D1 ledger…".
- [ ] 3.2 Điền dữ liệu mẫu có hình dạng prod (lớp, học viên, invoice, enrollment, attempt cũ) trước khi migrate, để bắt lỗi backfill/NOT NULL.
- [ ] 3.3 Chạy `/readyz` **và** các API đọc cột mới (loadSnapshot, GET `/api/grading/:attemptId`, danh sách học viên, công nợ) → không 500.
- [ ] 3.4 Ghi evidence (lệnh, kết quả đã sanitize) vào `plans/261029-1030-core-release-develop-to-main/reports/`.

Exit: migration chạy sạch, không 500, ghi evidence. Nếu có migration không an toàn: dừng, sửa bằng migration forward mới, lặp phase 3.

### Phase 4. Staging QA bằng luồng lõi

- [ ] 4.1 `git push origin develop:staging` (sau khi Phase 2 merge), chờ `deploy-staging.yml` xanh và `/readyz` 200.
- [ ] 4.2 UAT lõi theo script, mỗi bước có kỳ vọng và ảnh:
  1. Đăng ký/đăng nhập email, bootstrap org.
  2. Tạo lớp có lịch, học viên, enroll, syllabus, buổi học sinh ra đúng.
  3. Lịch Tháng/Tuần/Ngày, tạo kỳ nghỉ (dời/bù/hủy/hoàn tác).
  4. Điểm danh theo buổi và theo ngày, "tất cả Có mặt", reload giữ dữ liệu.
  5. Tạo invoice, thu một phần/toàn bộ, sổ công nợ + KPI, dòng thời gian, nhắc học phí.
  6. Nhật ký thông báo: gửi lại, retry.
- [ ] 4.3 Chạy 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md` cho các màn lõi.
- [ ] 4.4 Smoke Chrome và Safari private (runbook "Post-deploy smoke").
- [ ] 4.5 Mỗi lỗi: GitHub issue (label `ai-handle`), fix vào develop, push lại `develop:staging`, lặp 4.2 phần liên quan.

Exit: UAT lõi 6/6 pass trên cả hai trình duyệt, 0 lỗi nghiêm trọng mở.

### Phase 5. Gate cục bộ và E2E đầy đủ

- [ ] 5.1 Trên commit release: `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build`.
- [ ] 5.2 Full Playwright suite local (port 8100/8101/8103/8104). Gặp message `[dev-watchdog]` thì chạy lại, không coi là lỗi test.
- [ ] 5.3 `pnpm design:compare` cho PR có đụng hình ảnh trong release.
- [ ] 5.4 Nếu develop thay đổi sau lần chạy trên, chạy lại E2E trên develop + PR trước khi squash-merge (memory: full-e2e-before-merge).

Exit: tất cả xanh, ghi số pass/fail.

### Phase 6. Chuẩn bị prod

- [ ] 6.1 Preflight runbook 1–7: operator, auth Cloudflare, zone, Google redirect URI, secrets, staging, green gates.
- [ ] 6.2 Ghi bookmark D1 Time Travel của prod ngay trước deploy (đường restore).
- [ ] 6.3 Xác nhận secret prod khớp bảng gating (AI tắt, SePay rỗng, `ADMIN_EMAILS` theo quyết định).
- [ ] 6.4 Điền hàng "prod release" vào bảng Release sign-off ở trạng thái pending: commit, operator, rehearsal, restore authority.
- [ ] 6.5 Chọn cửa sổ ít người dùng và để Vinh có mặt ≥1 giờ sau deploy.

### Phase 7. Release

- [ ] 7.1 PR `develop` → `main` (merge commit, giữ lịch sử). Body PR tiếng Việt, mở đầu bằng mục `## Why` của plan này, kèm link evidence phase 3–5.
- [ ] 7.2 Merge → theo dõi `Deploy Production`: quality, E2E, deploy, `/readyz`.
- [ ] 7.3 Smoke tay trên prod: Chrome + Safari incognito, sign-in, reload, wrong-origin 403, **cộng** các API đọc cột mới (do `/readyz` không bắt được lỗi cột).
- [ ] 7.4 Quy tắc rollback: nếu 500 trên màn lõi hoặc đăng nhập lỗi → redeploy commit `2ba23a22` theo "Rollback code" ngay. Không sửa tay dữ liệu. Chỉ restore khi migration gây hỏng dữ liệu, do Vinh Tran quyết.
- [ ] 7.5 Điền sổ sign-off (GO/NO-GO), tag release, cập nhật `CHANGELOG.md`.

### Phase 8. Sau release và vào pilot

- [ ] 8.1 Theo dõi 48 giờ: Worker logs, `/readyz`, email verification (Resend quota), thông báo.
- [ ] 8.2 Cập nhật `docs/project-roadmap.md`: ghi release, đưa M4 sang trạng thái đang chạy thật; tick DOD kèm evidence.
- [ ] 8.3 Tạo org thật trên prod, onboard 2 lớp, xác nhận đăng nhập Google thật (đóng deviation OAuth của M3). Mở pilot log.
- [ ] 8.4 Từ lúc này: chỉ sửa lỗi pilot, không thêm feature cho tới decision record M5.

## Rủi ro chính

| Rủi ro | Cách giảm | Phase |
| --- | --- | --- |
| Migration lỗi trên dữ liệu prod thật | Rehearse từ trạng thái prod + Time Travel bookmark | 3, 6 |
| 500 do thiếu cột mà `/readyz` xanh | Smoke API đọc cột mới, trước và sau deploy | 3, 7 |
| Bề mặt AI/Credit lộ ra prod chưa có bảng giá | Fail-closed + ẩn nav | 2 |
| Cổng student/admin chưa ổn | Quyết định ship/ẩn rõ, không cấp admin | 1, 2 |
| E2E đỏ chặn deploy | Chạy local trước, sửa lỗi hạ tầng riêng | 5 |
| Scope trượt (thêm feature giữa chừng) | Đóng băng tới sau pilot | toàn bộ |

## Ngoài phạm vi

#358 (parity học viên), PR #491 (SePay hardening), A0 (gói Credit + nạp tiền), Giai đoạn B/C trong roadmap, mọi feature mới.

## Phần mở cho Vinh quyết trước Phase 2

1. Cổng học viên: ship hay ẩn trong release này?
2. AI: tắt hẳn trên prod, hay bật cho riêng org của Vinh?
3. Ngày/giờ release mong muốn.
