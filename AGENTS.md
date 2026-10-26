# AGENTS.md — Conventions cho AI collaborator

## Ngôn ngữ giao tiếp

- **Response, summary, completion report, giải thích: TIẾNG VIỆT** (mặc định cho mọi session/agent trong repo này).
- Giữ nguyên tiếng Anh cho: commit message (conventional commits), PR title, code identifier, tên test, thuật ngữ kỹ thuật đã tiếng Anh hoá trong codebase.
- PR body / issue comment / changelog theo precedent tiếng Việt của repo (xem PR #281, #284).

## Lưu ý vận hành

- CI quality (`ci.yml`: biome check, test, check-types, build) trigger cho push + PR vào `main` **và `develop`** (từ #409). E2E workflow vẫn chỉ trigger `main` — E2E chạy local qua bộ lệnh (`pnpm --filter <app> test`, `pnpm --filter e2e e2e` với port 8100/8101/8103). Bộ lệnh local (`pnpm check`, `pnpm check-types`, test, e2e) **vẫn là gate chính** cho agent — CI develop chỉ là lưới an toàn sau merge, không phải lý do bỏ local gate. Develop CI đỏ vì lint/format → remedy: `pnpm check:fix` rồi commit lại.
- Artifact report sinh tự động (HTML…) đặt trong `plans/reports/` — glob `plans/reports/**/*.html` bị biome exclude (từ #409), không commit artifact report ở chỗ khác. Caveat: file dưới glob exclude không được lint quét — không dán secret/token/log nhạy cảm vào report.
- Dev stack local chiếm port 8000/8001/8003/8004 (8004 = admin, plan #413 phase 5) — e2e dùng override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104`.
- E2E có watchdog hạ tầng (#402, entry `dev-watchdog`): vite web/student chết giữa run được restart tối đa 1 lần; chết lần 2 hoặc api chết → run FAIL cuối run với message `[dev-watchdog] hạ tầng dev server bất ổn…` — đừng nhầm đây là lỗi test; `design:compare` thì hủy run ngay kèm log tail. Root cause death (nếu gặp lại): native abort trong rolldown-binding của vite 8 dưới memory pressure — xem crash report `.ips` trong `~/Library/Logs/DiagnosticReports/`.

## Quy ước UI

- Đọc `DESIGN.md` trước khi sửa/thêm UI: token màu/type/motion lấy từ
  `packages/ui/src/styles/globals.css` (design v2 — shadcn neutral oklch, light mặc định,
  Geist), không hard-code giá trị lệch scale. Component shadcn trong
  `apps/web/src/components/ui/*`; shell dùng chung `sidebar-07`, search ⌘K.
- Trang list có bộ lọc: filter sống trong URL (search param), ô search debounce ~300ms mới đẩy
  lên URL; taxonomy hai cấp nhóm chip theo nhãn; badge đếm `aria-hidden`. Xem
  `apps/web/src/components/ui/chip-filter.tsx` và `/assignments` làm mẫu.
- Verify UI ở 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; PR
  đụng hình ảnh kèm screenshot và chạy `pnpm design:compare`.

## GitHub Issues

- Mỗi khi tạo GitHub issue mới trong repo này (ví dụ `gh issue create`), **luôn thêm label `ai-handle`** theo mặc định (`--label ai-handle`).
- Chỉ bỏ label này khi người dùng yêu cầu rõ ràng cho issue đó.
- Khi issue có phụ thuộc được đề cập (trong yêu cầu của người dùng, plan, hoặc nội dung issue — ví dụ "cần #X xong trước", "chặn #Y"), **luôn gắn quan hệ phụ thuộc tương ứng**: `--blocked-by <số|URL>` cho issue phải xong trước, `--blocking <số|URL>` cho issue đang chờ issue này (nhiều số phân cách bằng dấu phẩy, ví dụ `--blocked-by 200,201`). Issue đã tồn tại thì dùng `gh issue edit <N> --add-blocked-by …` / `--add-blocking …`. Không tự suy đoán phụ thuộc khi không được đề cập.
- Khi chuyển `Status` của issue trên board "Teacher OS" (`In progress` / `Ready to ship` / `Done`), **luôn align status sang Jira ticket liên kết** (site `teacher-os.atlassian.net`, project `TOS`). Ticket liên kết = key `TOS-N` trong title/body issue (ví dụ "Plan: TOS-8 — …", dòng "Nguồn: Jira [TOS-8](…)"). Dùng Atlassian MCP: lấy danh sách transition của ticket tại runtime, chọn transition theo tên status đích (`In progress` → `In Progress`, `Done` → `Done`; `Ready to ship` → status tương ứng nếu workflow Jira có, không có thì giữ `In Progress`), rồi `transitionJiraIssue`. Issue không có key `TOS-N` thì bỏ qua; MCP thiếu auth hoặc lỗi thì báo lại, không chặn việc chuyển status trên GitHub. Jira status là delivery metadata — không đổi `status` vòng đời tài liệu trong vault (xem skill `ba-jira`).
- Lưu ý: label `ai-handle` chỉ là điều kiện để agent nhận việc; người duyệt vẫn phải kéo card sang **Ready** trên board "Teacher OS" thì agent mới bắt đầu làm.
- Pipeline chạy từ repo chung `vinh19410/ai-handle@38656c3` (installed tại `~/.local/lib/teacher-os-ai-handle/`); upgrade = `bash install.sh --project teacher-os`.

## Luồng ak-plan → ak-git cp

- Khi skill `ak-plan` hoàn tất (plan đã được duyệt/chốt), **luôn gọi tiếp skill `ak-git cp`** để commit và push các file đã tạo ra trong session (plan, journal, các file liên quan).
- Không tự viết lệnh git thủ công thay cho `ak-git cp` trừ khi skill đó lỗi.

