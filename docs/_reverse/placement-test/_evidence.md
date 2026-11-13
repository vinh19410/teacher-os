---
type: reverse-evidence-log
feature: placement-test
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# Bằng chứng theo chủ đề — feature `placement-test`

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

## EV-01 Lược đồ dữ liệu và CAS

- `placement_test` dùng `orgId` làm khóa chính — một tổ chức một đề. Trích: `orgId: text("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" })` (packages/db/src/schema/placement-test.ts:14-16). ✅
- Comment thiết kế D5/D6/CAS: `revision: integer("revision").notNull().default(0)` và `publishedRevision`, `publishedVersion: integer("published_version").notNull().default(0)`, `publishedAt: integer("published_at", { mode: "timestamp_ms" })` (packages/db/src/schema/placement-test.ts:18-24; comment 5-12). ✅
- `placement_test_audio`: id text PK, orgId FK cascade, objectKey, name, contentType, size, createdAt; index `placement_test_audio_org_id_idx` (packages/db/src/schema/placement-test.ts:35-51; comment D8/D11 29-34). ✅
- Migration tạo bảng thật: packages/db/src/migrations/0058_simple_lady_deathstrike.sql:1-24. ✅
- Cột lead liên quan: `placement` text DEFAULT '' NOT NULL (:13), `source` text DEFAULT 'profile' NOT NULL (:15), `ip_hash` (:17), `submit_count` integer DEFAULT 1 (:18), index `lead_ip_updated_idx` (:27) (packages/db/src/migrations/0057_exotic_vulture.sql). ✅

## EV-02 API riêng tư của GV

- Guard: 401 "unauthorized" (apps/server/src/routes/placement-test.ts:121-127); 403 "placement-forbidden" qua `canAccessFinance` (:127-132; packages/auth/src/role.ts:75,85). ✅
- GET trạng thái tính dirty: so draft JSON khác snapshot (apps/server/src/routes/placement-test.ts:159-163); isLeadOrg (:164-167); `Cache-Control: no-store` (:179). ✅
- PUT draft: 415 content-type (:186-188); 413 PAYLOAD_TOO_LARGE so 256 KB (:190-199); 400 invalid json/body (:201-211); revision 0 → insert `onConflictDoNothing` → 409 `PLACEMENT_REVISION_CONFLICT` (:231-239) → `{revision:1, dirty:true}` (:241); nhánh update `where revision` → 409 (:259-267) → revision+1. ✅
- PUT audio: 503 `PLACEMENT_AUDIO_DISABLED` (:274-283); 400 `INVALID_AUDIO` cho Content-Length sai/zoom tên file xấu/body rỗng (:285-320); 413 `AUDIO_TOO_LARGE` (:293-295); 415 `UNSUPPORTED_AUDIO_TYPE` (:297-303); `audioId = crypto.randomUUID()`, `objectKey = placement/${ctx.orgId}/${audioId}` (:322-323); MediaSizeMismatchError → 400 + discardObject (:329-338); DB insert lỗi → 500 + discardObject (:340-354); trả `{audioId, name, size, type}` (:356-361). ✅
- POST publish: CAS 409 (:423-436,508-516); nháp hỏng → 422 `PLACEMENT_INVALID` "Bản nháp không đúng định dạng." (:438-450); audio cross-org → issue path `parts.1.clips.N.audioId` "File âm thanh không tồn tại hoặc không thuộc tổ chức này." (:454-468); nextVersion+1 + buildPlacementSnapshot (:481-482); update CAS trên revision và publishedVersion (:485-506); GC nền (:518-525); trả `{publishedVersion, publishedAt, revision, dirty:false}` (:527-532). ✅
- GC audio mồ côi: TTL 24h `PLACEMENT_AUDIO_ORPHAN_TTL_MS` (:33-34); gom id đang tham chiếu từ draft+published, xóa dòng metadata trước rồi xóa object, lỗi chỉ log (:53-107; comment D11 tại :33,:89). ✅

## EV-03 API công khai

- Comment #515 Phase 2 + giải thích ngoài `/api/*`, CORS leadOrigins không credentials, Range cho Safari iOS (apps/server/src/routes/public-placement-test.ts:19-24). ✅
- CORS: GET/OPTIONS, cho header `Range`, expose `Accept-Ranges/Content-Range/Content-Length`, maxAge 600 (:28-37). ✅
- GET đề: 503 `PLACEMENT_DISABLED` (:40-46); 404 `PLACEMENT_NOT_PUBLISHED` (:54-59); 200 + `Cache-Control: no-cache` (:61-67). ✅
- GET audio: 503 `PLACEMENT_AUDIO_DISABLED` (:79-85); 404 `not found` khi thiếu id/không thuộc leadOrg/không thấy object (:87-104, body `{ error: "not found" }` không có field `code`); parseByteRange + 416 `Content-Range: bytes */total` + nosniff + CSP `default-src 'none'; sandbox` (:107-128); header chung gồm `Cache-Control: public, max-age=31536000, immutable` (:145-151); 206 (:153-162); 200 (:164-170). ✅
- CORP same-site cho audio qua API riêng tư: apps/server/src/app.ts:325-328; mount public: :428-429; CORS bypass: :399-405. ✅

## EV-04 Hợp lệ hoá nội dung (validate publish)

- Hằng số: ID_REGEX, PROMPT_MAX 1000, OPTION_MAX 300, CLIP_TITLE_MAX 200, LEVEL_MAX 20, CEFR_MAX 20, MAX_QUESTIONS 100, MAX_CLIPS 20, MAX_CLIP_QUESTIONS 20, MAX_BANDS 8, AUDIO_MAX_BYTES 20MB, DRAFT_BODY_MAX_BYTES 256KB (packages/api/src/placement-test-contracts.ts:19-30). ✅
- kinds `["grammar","vocab"]` (:32); LEVELS A1..C2 + "B2+" (:35-43); options đúng 4 chuỗi (:45-50); answer 0-3 nullable (:52); clip `maxPlays` int 1-5 default 2 (:81-91); bands min/max/cefr/course (:93-99); parts id literal "vocab-grammar"/"listening" (:101-115). ✅
- superRefine tổng ≤100: "Tổng số câu hỏi không được vượt quá 100 câu." (:117-136). ✅
- validateQuestionItem: trùng id `Mã câu hỏi "${q.id}" bị trùng.` (:234); "Đáp án A không được để trống." (:254-262); "Các đáp án trong cùng một câu không được trùng nhau." (:264-270); "Chưa chọn đáp án đúng." (:272-282). ✅
- validatePlacementForPublish: "Phần 1 (Vocab + Grammar) phải có ít nhất 1 câu hỏi." (:299-304); trùng id đoạn `Mã đoạn nghe "${clip.id}" bị trùng.` (:328); "Phần 2 (Listening) phải có ít nhất 1 đoạn nghe." (:315-320); "Đoạn nghe chưa có file âm thanh." (:334-339); "Mỗi đoạn nghe phải có ít nhất 1 câu hỏi." (:355-360); "Phải có ít nhất 1 ngưỡng điểm CEFR." (:381-387); "Khóa học gợi ý không thuộc danh mục hợp lệ." (:397-402); "Ngưỡng điểm đầu tiên phải bắt đầu từ 0." (:411-417); chồng lấn/hở khoảng (:419-434); "Ngưỡng cuối cùng phải kết thúc đúng bằng tổng số câu (N)." (:436-442). ✅
- buildPlacementSnapshot: allowlist trường, courseLabel, clip `src` = `/public/placement-test/audio/${audioId}` (:494), chuẩn hóa `answer ?? 0` (:481-514); extractReferencedAudioIds (:516-562). ✅

## EV-05 Màn soạn đề GV

- Trạng thái + tự lưu + so sánh dirty: apps/web/src/routes/_auth/placement-test/index.tsx:128-192; 401 → đăng nhập lại (:159-163). ✅
- Chặn rời trang: useBlocker confirm "Còn thay đổi chưa lưu nháp. Rời trang bây giờ sẽ mất các thay đổi này — tiếp tục?" (:194-201); beforeunload (:203-211). ✅
- Lưu nháp: toast "Đã lưu bản nháp." (:250); 409 → toast "Đề đã được sửa ở tab khác, tải lại để tiếp tục" (:257-261); banner xung đột (:492-507). ✅
- Phát hành: tự lưu trước (:274-278); chặn client `Chưa thể phát hành: còn N lỗi cần kiểm tra.` + scroll (:280-288); thành công toast `Đã phát hành bộ đề vN.` (:305); 409 (:313-317); 422 toast `Phát hành bị từ chối (N lỗi nội dung).` (:318-325) + banner "Không thể phát hành — vui lòng sửa N lỗi sau:" (:509-524). ✅
- Nhập đề gốc: fetch `/placement-seed/questions.json` (:339); vòng 5 clip fetch mp3 + uploadAudio (:351-375); toast "Đã nhập đề gốc (30 câu, 5 đoạn nghe)." (:398); lỗi seed (:400-405). ✅
- Tạo đề trống: createBlankContent — band {0,2,"A1","ielts-foundation"}, vg-01, clip-1 maxPlays 2, l-01 (:60-102). ✅
- Header: title "Bài test đầu vào", huy hiệu "Có thay đổi chưa phát hành"/"Có thay đổi chưa lưu", lead mô tả trang /kiem-tra-dau-vao/ (:429-474); publishStatusText "Chưa phát hành"/`Đã phát hành vN lúc ...` (:417-425). ✅
- Cảnh báo lead org: "Lưu ý cấu hình tổ chức:" + LEAD_ORG_ID + /kiem-tra-dau-vao/ (:476-490). ✅
- Điều hướng: sidebar key "placement-test" nhãn "Bài test đầu vào" nhóm "Kinh doanh" (apps/web/src/components/layout/sidebar.tsx:52-59); FINANCE_NAV_KEY_MAP (:128-133); teacherNavForViewer (:140-145); ⌘K tự có (apps/web/src/components/command-search/search-index.ts:179-191); breadcrumb (apps/web/src/components/layout/app-shell.tsx:39-40); route matcher (apps/web/src/routes-matcher.ts:30-31); guard tài chính (apps/web/src/lib/use-finance-route-guard.ts:1-31). ✅

## EV-06 Audio phía GV

- Client kiểm tra MIME + 20 MB với toast "Định dạng file âm thanh không được hỗ trợ." / "Dung lượng file âm thanh không được vượt quá 20 MB." (apps/web/src/components/placement-test/clip-audio-field.tsx:68-75); nút "Tải audio lên"/"Thay audio"/"Nghe thử" (:150-174); preview `<audio>` (:178-188); nhãn "Chưa có file âm thanh" (:135-138). ✅
- uploadAudio dùng XHR PUT + header X-File-Name + tiến trình (apps/web/src/lib/repos/placement-test.ts:114-204; comment D10 :121-124); "Lỗi mạng khi tải audio lên." (:196); `Tải audio lên thất bại (HTTP N).` (:189). ✅
- fetchAudioBlobUrl → blob: cho nghe thử (comment D14 :207; apps/web/src/lib/repos/placement-test.ts:206-237). ✅
- Danh sách MIME cho phép: packages/api/src/library-contracts.ts:43-54 (audio/mpeg, audio/mp4, audio/x-m4a, audio/aac, audio/wav, audio/x-wav, audio/wave, audio/webm, audio/ogg). ✅
- e2e xác nhận: thay audio, "Nghe thử" tạo src `blob:`, HTTP 206 với `bytes=0-99` (apps/e2e/specs/placement-test-editor.spec.ts:209-259). ✅

## EV-07 Trang học viên

- Khung trang: apps/profile/public/kiem-tra-dau-vao/index.html:1-58 (title "Bài Kiểm Tra Đầu Vào (CEFR & IELTS) | Cô Đỗ Thục Mỹ", meta lead-api, chân trang Zalo 0929.060.994). ✅
- Khoá localStorage `msmy_placement_attempt_v1` (apps/profile/public/kiem-tra-dau-vao/test.js:17); loadSavedAttempt + đổi version giữ lead (:145-238). ✅
- Bảo trì: renderMaintenance "Bài kiểm tra đang bảo trì" (:316-350); init → kiểm tra (:1646-1671). ✅
- Cổng thông tin: honeypot (:623-634); submit POST `/public/leads` timeout 10s (:1064); 200/201 → Phần 1 (:1076-1086). ✅
- Làm bài: 2 phần (:1139-1470); maxPlays trừ lượt khi 'playing' (:1302-1310); hoàn lượt khi lỗi (:1318-1337); reset currentTime (:1345-1349); xác nhận nộp khi còn câu trống (:1422-1465). ✅
- Kết quả: đồng bộ lead keepalive (:1483-1519); thông điệp "Đáp án chi tiết được bảo mật..." (:1538-1544); đăng ký (:1603-1614); "🔄 Làm Lại" (:1625-1639); khám phá CEFR (:1677-1826). ✅
- lead-gate.js: LEAD_MIN_SAFE_ELAPSED_MS 3500 (:8-12); nhóm khóa học placement (:18-59); study modes (:64-68); normalizeVietnamPhone `^0\d{9}$` (:81-85); ngày sinh (:108-122); validateLeadForm (:132-191); buildLeadPayload source "placement-test" + elapsedMs floor 3500 + placement ≤300 (:206-248); leadErrorMessage (:255-284). ✅
- grading.js: chấm trúng +1, bỏ trống 0, map band kèm fallback (:49-110); `buildPlacementSummary` "Kiểm tra đầu vào: T/M (Vocab + Grammar a/b, Listening c/d) – CEFR X" ≤300 (:119-131). ✅

## EV-08 R1 — kiểm kê test (không chạy test, chỉ đếm)

Đếm bằng regex `^\s*(test|it)\(` (python), `\.skip\(|\.only\(|\.todo\(` = 0 ở mọi file:

| File | Số test active | Ghi chú |
|------|----------------|---------|
| apps/server/src/routes/placement-test.test.ts | 5 | :238-267 403 vai trò/origin; :269-326 CAS 409; :328-397 draft-after-publish không đổi public + dirty; :399-450 đa tổ chức + CORP + 422 cross-org; :452-532 422 ngưỡng + GC D11 |
| apps/server/src/routes/public-placement-test.test.ts | 3 | :102-117 503/404+CORS; :119-183 snapshot+no-cache; :185-292 audio 200/206/416/404 |
| apps/web/src/routes/_auth/placement-test/index.test.tsx | 4 | seed empty :151-164; banner ngưỡng :166-189; 409 xung đột :191-243; 422 issues :245-310 |
| apps/web/src/components/placement-test/content-model.test.ts | 3 | CRUD câu VG :76, đoạn nghe :103, ngưỡng :131 |
| apps/profile/tests/placement-test.test.mjs | 7 | HTML tĩnh :102; grading :116; serve meta :180; build :229; validateLeadForm :268; buildLeadPayload :343; leadErrorMessage :391 |
| apps/e2e/specs/placement-test-editor.spec.ts | 1 | :71-285 luồng trọn: bảo trì giữ localStorage, nhập seed, sửa ngưỡng, phát hành v1/v2, viewport/dark, thay audio + Range 206, chặn API → bảo trì |
| apps/e2e/specs/profile-placement-test.spec.ts | 3 | luồng lead-gate + đồng bộ + merge :155-410; lỗi gate + 500 + Zalo + "Đổi thông tin" :412-534; viewport/keyboard/hoàn lượt nghe/xác nhận bỏ trống :535-663 |
| **Tổng feature** | **26** | 5+3+4+3+7+1+3 |
| Biên: apps/server/src/lead-catalog-drift.test.ts | 4 it tổng, 1 it liên quan placement (:64) | seed khớp LEAD_COURSES + validate |
| Biên: apps/profile/tests/index.test.mjs | 23 test tổng, 2 test chạm điểm vào (:107,:179) | trang chủ linking |

## EV-09 Trạng thái git và các điểm đọc thêm

- git status tại thời điểm soạn: KHÔNG có file nguồn của feature nào đang sửa. File đang sửa duy nhất liên quan hạ tầng media là apps/server/src/routes/admin-library-audio.test.ts (2 thêm/2 xóa) — thuộc feature library-audio, chỉ dùng chung MediaStore; không ảnh hưởng mệnh đề nào của placement-test. ✅
- docs/_reverse/reverse-plan.json: entry `placement-test` — slug khớp, sources = 4 file kế hoạch reverse, existing_doc: null, confidence: high, complexity_flags: ["media"], status: pending. ✅
- Throttle: public GET của feature KHÔNG có throttle (N-01); POST /public/leads (feature leads) CÓ 429 LEAD_RATE_LIMITED/LEAD_DAILY_CAP (apps/server/src/routes/public-leads.ts:292-328) — ghi là ranh giới tính năng, không phải của placement-test. ✅

## EV-10 Trích nguyên văn chọn lọc (verbatim)

- "Đã lưu bản nháp." — apps/web/src/routes/_auth/placement-test/index.tsx:250
- "Đề đã được sửa ở tab khác, tải lại để tiếp tục" — :257-261
- "Chưa thể phát hành: còn N lỗi cần kiểm tra." — :281-287
- "Đã phát hành bộ đề vN." — :305
- "Phát hành bị từ chối (N lỗi nội dung)." — :318-325
- "Còn thay đổi chưa lưu nháp. Rời trang bây giờ sẽ mất các thay đổi này — tiếp tục?" — :194-201
- "Đã nhập đề gốc (30 câu, 5 đoạn nghe)." — :398
- "Bản nháp không đúng định dạng." — apps/server/src/routes/placement-test.ts:443-449
- "File âm thanh không tồn tại hoặc không thuộc tổ chức này." — apps/server/src/routes/placement-test.ts:458-466
- "Tổng số câu hỏi không được vượt quá 100 câu." — packages/api/src/placement-test-contracts.ts:117-136
- "Ngưỡng cuối cùng phải kết thúc đúng bằng tổng số câu (N)." — packages/api/src/placement-test-contracts.ts:436-442
- "Bài test đầu vào" — apps/web/src/components/layout/sidebar.tsx:53; apps/web/src/routes/_auth/placement-test/index.tsx:430-433
- "Xác nhận phát hành bộ đề (vN)" — apps/web/src/components/placement-test/publish-dialog.tsx:31
- "Học viên đang làm dở phiên bản cũ khi tải lại trang sẽ được chuyển sang đề mới và phải làm lại từ đầu." — apps/web/src/components/placement-test/publish-dialog.tsx:63-66
- "Chưa có bản nháp bộ đề kiểm tra đầu vào" — apps/web/src/components/placement-test/seed-empty-state.tsx:17-25
- "Bài kiểm tra đang bảo trì" — apps/profile/public/kiem-tra-dau-vao/test.js:316-350
- "Bạn còn X/Y câu chưa chọn đáp án. Câu bỏ trống sẽ được tính là 0 điểm. Bạn có chắc chắn muốn nộp bài ngay?" — apps/profile/public/kiem-tra-dau-vao/test.js:1422-1465
- "Đáp án chi tiết được bảo mật để cô Thục Mỹ trực tiếp phân tích lỗ hổng tư duy và chữa bài 1-1 cùng bạn." — apps/profile/public/kiem-tra-dau-vao/test.js:1538-1544
- Lỗi mã: `PLACEMENT_DISABLED`, `PLACEMENT_NOT_PUBLISHED`, `PLACEMENT_AUDIO_DISABLED`, `PLACEMENT_REVISION_CONFLICT`, `PLACEMENT_INVALID`, `INVALID_AUDIO`, `AUDIO_TOO_LARGE`, `UNSUPPORTED_AUDIO_TYPE`, `PAYLOAD_TOO_LARGE`, `LEAD_RATE_LIMITED`, `LEAD_DAILY_CAP` — grep `code: "` trên 2 route file cho kết quả khớp từng dòng như EV-02/EV-03. ✅
