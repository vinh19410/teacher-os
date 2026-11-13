---
type: reverse-source-map
feature: placement-test
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# Bản đồ nguồn — feature `placement-test`

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

Bảng nguồn (EOF đã kiểm bằng `wc -l`; mọi range ≤ EOF):

| S# | Path | Loại | EOF range | ✅ | ext | Mô tả |
|----|------|------|-----------|----|-----|-------|
| S01 | packages/db/src/schema/placement-test.ts | schema | 1-51 | ✅ | ts | 2 bảng đề + audio, comment CAS/D5/D6/D8/D11 |
| S02 | packages/db/src/migrations/0058_simple_lady_deathstrike.sql | migration | 1-24 | ✅ | sql | CREATE TABLE placement_test (9 cột) + placement_test_audio (7 cột) + 1 index |
| S03 | packages/db/src/migrations/0057_exotic_vulture.sql | migration | 1-26 | ✅ | sql | cột lead: placement, source default 'profile', ip_hash, submit_count + index ip_hash |
| S04 | packages/api/src/placement-test-contracts.ts | contract | 1-562 | ✅ | ts | hằng số trần, Zod draft/publish, validatePlacementForPublish, buildPlacementSnapshot, extractReferencedAudioIds |
| S05 | apps/server/src/routes/placement-test.ts | server-route | 1-536 | ✅ | ts | API GV: GET state, PUT draft (CAS), PUT/GET audio, POST publish, GC audio mồ côi |
| S06 | apps/server/src/routes/public-placement-test.ts | server-route | 1-174 | ✅ | ts | API công khai: GET đề, GET audio Range/206/416, CORS profile |
| S07 | apps/server/src/app.ts | server-mount | 1-481 | ✅ | ts | gắn route public tại :428-429, CORS bypass :399-405, CORP same-site cho audio :325-328 |
| S08 | apps/server/src/routes/kernel.ts | server-mount | 1-3523 | ✅ | ts | gắn route riêng tư :3506-3507; guard Origin ghi :185-191 |
| S09 | apps/web/src/routes/_auth/placement-test/index.tsx | web-route | 1-759 | ✅ | tsx | màn soạn đề GV: state, autosave, publish, import seed |
| S10 | apps/web/src/lib/repos/placement-test.ts | web-repo | 1-268 | ✅ | ts | fetch/save/upload XHR/publish/fetchAudioBlobUrl |
| S11 | apps/web/src/components/placement-test/question-card.tsx | web-component | 1-215 | ✅ | tsx | thẻ câu hỏi Phần 1 và câu trong đoạn nghe |
| S12 | apps/web/src/components/placement-test/clip-card.tsx | web-component | 1-228 | ✅ | tsx | thẻ đoạn nghe + danh sách câu |
| S13 | apps/web/src/components/placement-test/clip-audio-field.tsx | web-component | 1-191 | ✅ | tsx | tải/đổi/nghe thử audio đoạn nghe |
| S14 | apps/web/src/components/placement-test/bands-editor.tsx | web-component | 1-167 | ✅ | tsx | bảng ngưỡng CEFR + khóa gợi ý |
| S15 | apps/web/src/components/placement-test/publish-dialog.tsx | web-component | 1-71 | ✅ | tsx | hộp thoại xác nhận phát hành |
| S16 | apps/web/src/components/placement-test/seed-empty-state.tsx | web-component | 1-60 | ✅ | tsx | trạng thái rỗng + 2 nút khởi tạo |
| S17 | apps/web/src/components/layout/sidebar.tsx | web-nav | 1-214 | ✅ | tsx | mục "Bài test đầu vào" :52-59; FINANCE_NAV_KEY_MAP :128-133; teacherNavForViewer :140-145 |
| S18 | apps/web/src/components/command-search/search-index.ts | web-nav | 1-239 | ✅ | ts | ⌘K derive từ teacherNavForViewer :179-191 |
| S19 | apps/web/src/routes-matcher.ts | web-nav | 1-154 | ✅ | ts | khai báo route "/placement-test" :30-31 |
| S20 | apps/web/src/lib/use-finance-route-guard.ts | web-guard | 1-31 | ✅ | ts | chặn thiếu quyền → /dashboard + toast |
| S21 | apps/web/src/components/layout/app-shell.tsx | web-nav | 1-193 | ✅ | tsx | breadcrumb "Bài test đầu vào" :39-40 |
| S22 | packages/auth/src/role.ts | auth | 1-177 | ✅ | ts | FINANCE_ROLES :75; canAccessFinance :85 |
| S23 | packages/api/src/lib/quiz-media.ts | lib | 1-109 | ✅ | ts | normalizeMediaType :19-21; sanitizeMediaFileName :68 |
| S24 | apps/server/src/lib/byte-range.ts | lib | 1-42 | ✅ | ts | parseByteRange (bytes=start-end và suffix) |
| S25 | packages/api/src/library-contracts.ts | contract | 1-548 | ✅ | ts | LIBRARY_AUDIO_MIME: mp3/m4a/aac/wav/webm/ogg :43-54 |
| S26 | packages/api/src/lead-contracts.ts | contract | 1-288 | ✅ | ts | LEAD_SOURCES có "placement-test" :146-148; placement ≤300 :216-223; email bắt buộc khi placement :229-231 |
| S27 | apps/server/src/routes/public-leads.ts | server-route (biên leads) | 1-370 | ✅ | ts | rate-limit IP/ngày 429 :292-328; hằng số :23-36 |
| S28 | apps/profile/public/kiem-tra-dau-vao/index.html | static-page | 1-58 | ✅ | html | khung trang học viên + meta lead-api |
| S29 | apps/profile/public/kiem-tra-dau-vao/test.js | static-js | 1-1826 | ✅ | js | 5 bước làm bài, audio plays, chấm, kết quả, đồng bộ lead |
| S30 | apps/profile/public/kiem-tra-dau-vao/lead-gate.js | static-js | 1-284 | ✅ | js | xác thực form, buildLeadPayload (source, elapsedMs, placement) |
| S31 | apps/profile/public/kiem-tra-dau-vao/grading.js | static-js | 1-131 | ✅ | js | chấm client + buildPlacementSummary |
| S32 | apps/web/public/placement-seed/questions.json | seed-data | 1-397 | ✅ | json | 30 câu + 5 đoạn nghe đề gốc |
| S33 | apps/web/public/placement-seed/clip-1.mp3 … clip-5.mp3 | seed-audio | (binary) | ✅ | mp3 | 5 file audio mẫu cho nhập đề gốc |
| S34 | apps/profile/serve.mjs | static-server | 1-185 | ✅ | mjs | phục vụ trang tĩnh + thay meta :9-20 |
| S35 | apps/profile/build.mjs | build | 1-43 | ✅ | mjs | build 2 trang tĩnh, thay meta lead-api :20 |
| S36 | apps/server/src/routes/placement-test.test.ts | test | 1-533 | ✅ | ts | 5 test: 403, CAS 409, draft-vs-public, đa tổ chức+CORP, 422+GC |
| S37 | apps/server/src/routes/public-placement-test.test.ts | test | 1-293 | ✅ | ts | 3 test: 503/404, snapshot no-cache, audio 200/206/416/404 |
| S38 | apps/web/src/routes/_auth/placement-test/index.test.tsx | test | 1-311 | ✅ | tsx | 4 it: seed empty, banner ngưỡng, 409, 422 |
| S39 | apps/web/src/components/placement-test/content-model.test.ts | test | 1-143 | ✅ | ts | 3 it: CRUD câu VG, đoạn nghe, ngưỡng |
| S40 | apps/profile/tests/placement-test.test.mjs | test | 1-410 | ✅ | mjs | 7 test: HTML tĩnh, grading, serve/build meta, lead-gate |
| S41 | apps/e2e/specs/placement-test-editor.spec.ts | e2e | 1-286 | ✅ | ts | 1 test chạy trọn: bảo trì giữ localStorage, nhập seed, sửa ngưỡng, phát hành v1/v2, Range, thay audio |
| S42 | apps/e2e/specs/profile-placement-test.spec.ts | e2e | 1-664 | ✅ | ts | 3 test: luồng lead-gate + đồng bộ, lỗi gate, viewport/keyboard/hoàn lượt nghe |

Nguồn biên (đọc để làm rõ ranh giới, không mô tả sâu): packages/api/src/lead-contracts.ts (S26), apps/server/src/routes/public-leads.ts (S27), apps/profile/tests/index.test.mjs (556 dòng; 23 test, 2 test chạm điểm vào trang học viên). 🔵
