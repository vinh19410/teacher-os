# Code Review — Release develop → main (pre-landing, 2 lượt)

## Phạm vi
- Diff: `git diff origin/main...HEAD` (develop @ c49a9fdd), 196 file / ~104k dòng thêm (phần lớn là snapshot migration, seed JSON, test). Chỉ review source: `apps/*/src`, `packages/*/src`, migration 0075–0082, workflow mới.
- Bỏ qua: PNG, plans, journals.
- Trọng tâm: Zoom Pro + khung giờ vào lớp (#831/#842), nhóm bộ từ (#832), gộp bộ đề (#829), redirect sai role (#839), xuất bản thư viện (#810), fix 500 admin library tests (#824).
- Không chạy lại lint/types/test (caller xác nhận đã pass local).

## Kết luận tổng quan
Không có lỗ hổng bảo mật kiểu auth bypass, injection hay lộ secret có thể khai thác ngay. Migration 0075–0082 an toàn cho prod: main dừng ở 0074 nên prod chưa có bảng `class_session_meeting`, và việc rebuild ở 0081 chạy trên bảng rỗng. Có 1 phát hiện critical cần người dùng quyết định (ghi đè dữ liệu xuyên tenant qua system study pack, do AC #4 của #829 chủ ý mở quyền) và 3 phát hiện high là lỗi chức năng/toàn vẹn dữ liệu đã kiểm chứng.

## Pass 1 — Critical

### C1. Giáo viên bất kỳ được sửa/xoá study pack hệ thống (`org_id IS NULL`) — ghi đè dữ liệu dùng chung mọi org
- File: `apps/server/src/routes/study-pack.ts:265-345` (PUT), `:351-395` (DELETE), predicate `or(eq(studyPack.orgId, ctx.orgId), isNull(studyPack.orgId))`.
- Kịch bản lỗi: nếu prod có từ 2 org trở lên thì giáo viên `canPublishGrade` của org A sửa tiêu đề/nội dung hoặc xoá một pack hệ thống, và pack đó đổi hoặc mất với mọi org khác. `bootstrapMiddleware` (`apps/server/src/app.ts:298-313`) tạo org riêng cho mỗi giáo viên chưa có membership, kể cả khi `TEACHER_EMAILS` có nhiều email. Vì vậy "single-org" không được code bảo đảm, chỉ là giả định vận hành.
- Bối cảnh: đây là quyết định đã ghi trong AC #4 `plans/261119-829-merge-study-packs/plan.md` ("do hệ thống chạy single-org"), có test `teacher can update and delete system pack directly (#829)`. Reviewer **không đề xuất đảo ngược âm thầm**.
- Cần người dùng xác nhận: prod hiện có đúng 1 org giáo viên không (`SELECT count(*) FROM organization` hoặc membership)? Nếu có hơn 1 org thì nên chặn trước khi lên main, bằng một trong các cách: chỉ cho sửa pack hệ thống khi org là org duy nhất, gate bằng cờ env, hoặc giữ cơ chế clone-về-org.

Ngoài C1: **không có** critical nào khác về auth bypass, injection, race gây mất dữ liệu, migration mất dữ liệu hay secret leak.

## Pass 1 — High (đã kiểm chứng, không chặn bảo mật nhưng sai hành vi)

### H1. PUT system pack bỏ qua guard "system pack cannot reference org_prompt"
- File: `apps/server/src/routes/study-pack.ts:288` gọi `validateStudyPackItems(db, ctx.orgId, ...)` bằng org của người gọi, không dùng `existing.orgId` (null). Guard ở `apps/server/src/lib/study-pack-clone.ts:407` vì vậy không bao giờ chạy cho pack hệ thống.
- Kịch bản: editor `apps/web/src/components/study-packs/study-pack-editor-modal.tsx:262-281` cho thêm `org_prompt` (câu hỏi riêng của trung tâm) vào pack hệ thống. Sau khi lưu:
  - `loadStudyPackItemWithAudio` trả `null` khi `packOrgId === null` (`study-pack-clone.ts:1045-1046`), nên item 404 khi xem chi tiết hoặc nghe audio;
  - `resolveStudyPackItemMetadata(db, null, …)` bỏ qua metadata, nên item hiện thiếu thông tin;
  - org khác gán pack thì nhận 422 `org_prompt not found` từ `materializePrompts`.
- Hậu quả: một lần sửa làm hỏng pack dùng chung.
- Sửa: dùng `existing.orgId` khi validate. Nếu pack là hệ thống thì từ chối `org_prompt` (422) và ẩn nguồn "câu hỏi của tôi" trong editor khi `pack.scope === "system"`.

### H2. Chỉnh sửa pack hệ thống của giáo viên bị seed/promote ghi đè hoặc trộn
- File: `packages/db/src/seed/study-packs.ts:352-382` (upsert `ON CONFLICT DO UPDATE` theo id seed), `:752-770` (`--if-needed` re-seed khi content parity lệch); staging chạy tự động ở `deploy-staging.yml:148`, prod chạy qua `scripts/promote-study-packs-prod.ts`.
- Kịch bản: giáo viên sửa hoặc xoá pack hệ thống, khiến parity lệch. Lần deploy staging hoặc promote prod kế tiếp sẽ:
  - ghi đè title/description/status về bản seed;
  - upsert lại item seed bên cạnh item giáo viên đã thêm, gây trùng hoặc trộn;
  - tạo lại pack đã bị xoá.
- Hậu quả: thay đổi của giáo viên mất mà không có thông báo.
- Sửa: chốt một nguồn sự thật. Có hai cách: (a) seed bỏ qua pack đã bị sửa, dựa vào `updated_at`/cờ `edited`; (b) chỉ cho sửa bản clone. Cần quyết cùng với C1.

### H3. Bulk tạo Zoom gồm cả buổi trong quá khứ, đốt quota 100 lần/ngày
- File: `apps/server/src/lib/zoom/session-zoom-service.ts:583-605`. `candidateDates` lấy toàn bộ `class_session`/`lesson` của lớp, sắp tăng dần, và không lọc `date < vietnamTodayISO(now)`. `ensureSessionMeeting` (`:267`) cũng không chặn ngày đã qua.
- Kịch bản: lớp đã chạy nhiều tuần chưa có Zoom bấm "Tạo Zoom cho cả lớp". 12 slot/lần (`MAX_BULK_CREATE_PER_CALL`) bị dùng cho các buổi đã học xong, buổi sắp tới vẫn không có link, và quota ngày của tài khoản Zoom (dùng chung mọi lớp) bị tiêu. Sau đó cron còn poll recording cho các meeting ảo này.
- Sửa: lọc các ngày đã kết thúc trong bulk, dùng `vietnamSessionEndMs` hoặc tối thiểu `date >= todayISO`. Cân nhắc trả 409 cho POST tạo Zoom một buổi đã kết thúc. Thêm test "bulk bỏ qua buổi quá khứ".

## Pass 2 — Informational

### Medium
- **M1. Khung giờ vào lớp chỉ là lớp mềm.** Meeting tạo với `join_before_host: true`, `waiting_room: false`, `meeting_authentication: false` (`apps/server/src/lib/zoom/zoom-client.ts:184-188`). `join_url` chứa `pwd`, dùng lại được bất kỳ lúc nào. Ngoài ra link cũng nằm ở `lesson.zoom`/`class_session.zoom`, giáo viên copy vào tin nhắc lịch. Endpoint `/zoom-join` chỉ quyết định khi nào UI đưa link, không ngăn được việc vào phòng ngoài giờ. Nếu yêu cầu là chặn thật thì cần waiting room hoặc giới hạn người tham gia phía Zoom; nếu chỉ cần UX thì ghi rõ trong runbook.
- **M2. Ghép nhiều buổi vào cùng một host Zoom (`ZOOM_HOST_USER`, mặc định `me`).** Các lớp trùng giờ dùng chung một host Pro. Zoom giới hạn số meeting đồng thời mỗi host (JBH cho tối đa 2), nên buổi trùng giờ có thể không vào được. Đây là rủi ro vận hành, nên ghi vào runbook.
- **M3. Dời buổi xoá luôn meeting ở ngày đích, kể cả recording.** `syncZoomOnSessionEdit` (`session-zoom-service.ts:693-716`) xoá dòng `class_session_meeting` ở `newDateISO` mà không kiểm `recordingUrl`. Khi dời buổi sang ngày đã có buổi khác của cùng lớp với recording sẵn, link recording của buổi kia bị mất. Edge hiếm nhưng mất dữ liệu: nên giữ recording hoặc từ chối.
- **M4. Ghi dữ liệu trên đường GET của học viên.** `student-practice.ts:251` gọi `syncLibraryTestsToOrg` ở mỗi lần load catalog, mỗi lần khoảng 6–10 query kể cả khi không có gì thay đổi. Race song song đã được xử lý đúng: test có unique `(org_id, library_ref)`, part có unique `(test_id, part)`, đều dùng `onConflictDoNothing`. Tuy vậy `materializePrompts` vẫn có thể sinh `assignment_prompt` mồ côi khi hai request đua nhau. Gợi ý: so `max(updated_at)` của `library_test` với một mốc trước khi chạy full sync.
- **M5. Zoom client secret là plain binding.** `packages/infra/alchemy.run.ts:236-249` khai báo `ZOOM_CLIENT_SECRET` bằng `Config.String`, không phải Redacted, nên hiện rõ trong dashboard Cloudflare. Code đã chú thích lý do (cùng mẫu `RESEND_API_KEY`). Chấp nhận được nhưng nên theo dõi.
- **M6. Workflow `cleanup-step-ielts.yml` ở mode apply không upload dump preimage/rollback SQL thành artifact.** Dump nằm trên runner rồi mất theo runner, nên không còn đường rollback. Nên thêm bước `actions/upload-artifact` (retention ngắn, chỉ staging).

### Low
- `updateSessionRecordingManual` (`session-zoom-service.ts:1112-1160`): nhánh insert không bắt lỗi unique `(class_id,date)` khi race với `ensureSessionMeeting`, nên trả 500 thay vì retry/update. Hiếm.
- `POST /groups` nhận `id` do client gửi (`vocab-teacher.ts:191`). Nếu trùng PK với group của org khác thì trả 500 (không lộ dữ liệu, chỉ là oracle tồn tại). Đây là pattern có sẵn của repo.
- `POST /classes/:classId/sessions/:date/zoom` không kiểm `class.mode === "Online"`, nên vẫn tạo được Zoom cho lớp Offline. Có thể là chủ ý.
- Magic number Zoom (`MAX_BULK_CREATE_PER_CALL=12`, `MAX_AUTO_PROVISION_ON_CREATE=5`, cron 10 phút / 72h / retry 1h) đã đặt tên hằng nhưng chưa ghi trong runbook.
- Test gap: chưa có test cho (a) bulk với buổi quá khứ (H3), (b) PUT pack hệ thống chứa `org_prompt` (H1), (c) dời buổi ghi đè recording (M3).

## Đã kiểm chứng sạch (để hiệu chỉnh rủi ro)
- **Zoom routes** (`routes/zoom-meeting.ts`): mọi endpoint kiểm `kernelCtx` + class thuộc `ctx.orgId`, có CSRF Origin allowlist + `application/json`. `bootstrapMiddleware` chặn role student/admin và áp allowlist `TEACHER_EMAILS`. Lỗi trả về không lộ token.
- **`ensureSessionMeeting`**: race 2 request được xử lý bằng unique `(class_id,date)` + claim CAS `joinUrl = ''` + xoá meeting thừa.
- **`/zoom-join` học viên**: yêu cầu enrollment `active` + lớp cùng org + lesson theo `enrollmentId`, có `Cache-Control: no-store`. Payload list/detail/overview/schedule chỉ trả `hasZoom`, không trả raw `joinUrl` (`student-class.ts:335-383`, `loadNextSession`). Client mở tab với `opener = null`.
- **Recording URL thủ công**: schema bắt buộc `https:` (`contracts.ts:5437`).
- **Vocab group / clone / CSV import**: mọi truy vấn scope theo `ctx.orgId`. Clone kiểm IDOR lớp trước khi đọc deck, group của bản sao được resolve bằng subquery cùng org. Xoá audio R2 có kiểm còn tham chiếu (`vocab-teacher.ts:1595-1604`), nên clone không bị mất audio.
- **Wrong-role (#839)**: client guard (`isStudentSession`) khớp server `resolveUserRole` (NULL được coi là teacher), không tạo vòng redirect cho student hợp lệ.
- **Admin library (#824)**: `instr(lower())` dùng tham số bind nên không có injection. `onError` che chi tiết `Failed query:`. Batch giữ dưới trần 100 bind.
- **Migration 0075–0082**: chỉ thêm cột/bảng/index nullable hoặc có default. 0075 unique trên cột mới toàn NULL (SQLite cho phép nhiều NULL). 0081 rebuild bảng mới tạo ở 0078 (prod chưa có). Không có bảng nào FK tới `class_session_meeting`.
- **Cron `scheduled`**: no-op khi chưa cấu hình Zoom, có giới hạn quét 30 dòng và 10 lần sync mỗi tick.

## Hành động đề xuất (ưu tiên)
1. **Người dùng quyết C1** (đếm số org trên prod), kèm H2. Nếu prod có hơn 1 org thì chặn release cho tới khi gate quyền sửa pack hệ thống.
2. Sửa H1: validate theo `existing.orgId` và ẩn `org_prompt` trong editor khi pack hệ thống.
3. Sửa H3: lọc buổi đã kết thúc trong bulk/ensure, thêm test.
4. Theo dõi M1/M2 trong runbook Zoom, M3 và M6 khi có slot.

## Metrics
- Type coverage / test coverage: không đo lại (caller xác nhận gate pass).
- Lint issues: không chạy lại.

## Câu hỏi chưa giải quyết
- Prod hiện có bao nhiêu `organization` có membership giáo viên? (quyết định mức độ C1)
- Khung giờ Zoom là yêu cầu UX hay yêu cầu kiểm soát truy cập thật? (M1)
- Pack hệ thống: nguồn sự thật là seed hay chỉnh sửa trên UI? (H2)
