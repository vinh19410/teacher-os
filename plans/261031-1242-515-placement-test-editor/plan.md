---
title: "Giáo viên sửa và phát hành bộ đề kiểm tra đầu vào"
description: "Chuyển đề /kiem-tra-dau-vao/ từ file tĩnh sang DB, cho giáo viên sửa toàn bộ đề và audio trong apps/web, bấm Phát hành là học viên thấy ngay."
status: pending
priority: P2
effort: 4d
issue: 515
branch: feat/515-placement-test-editor
tags: [feature, frontend, backend, database, api, profile]
blockedBy: []
blocks: []
created: 2026-10-31
---

# Giáo viên sửa và phát hành bộ đề kiểm tra đầu vào

## Overview

Đề `/kiem-tra-dau-vao/` hiện nằm trong `apps/profile/public/kiem-tra-dau-vao/questions.json` và 5 file MP3 commit trong repo. Muốn đổi một chữ phải sửa code rồi deploy lại. Plan này đưa đề vào DB, thêm màn sửa đề trong `apps/web` có bản nháp và nút Phát hành, và cho trang profile đọc bản đã phát hành qua API công khai.

## Contract

- **Outcome:** giáo viên sửa toàn bộ đề (câu hỏi, đáp án, đáp án đúng, audio, ngưỡng CEFR, thêm/bớt câu và đoạn nghe) trong `apps/web`, bấm Phát hành là học viên thấy đề mới ở lần tải trang kế tiếp, không cần deploy.
- **Constraints:** `apps/profile` giữ zero-dependency, không bundler. Không đổi `POST /public/leads` hay schema `lead`. Luật làm bài giữ nguyên: không giới hạn giờ, nghe tối đa theo `maxPlays`, không hiện đáp án sau khi nộp. Không có transcript trong dữ liệu công khai.
- **Non-goals:** sửa đề ở `apps/admin`; nhiều bộ đề trong một org; lịch sử phiên bản hay khôi phục bản cũ; gỡ phát hành; chấm phía server; lưu kết quả của người không đăng ký; rate limit cho endpoint đọc công khai.
- **Scope mode:** HOLD SCOPE.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Màn sửa đề nằm trong `apps/web`, route `/placement-test`, nhãn sidebar "Bài test đầu vào", cạnh `/leads`. | Người dùng chọn. Đề thuộc org của cô Mỹ, lead cũng ở đây. |
| D2 | Bấm Phát hành là bước duyệt của cô Mỹ. Bỏ `assertPlacementContentApproved`, `resolveBuildChannel` và field `status`. | Người dùng chọn. Thay D10/D10b của plan #511. |
| D3 | API lỗi, chưa có bản phát hành hoặc payload sai đều hiện trang bảo trì "quay lại sau". Không có đề dự phòng tĩnh. | Người dùng chọn. API là nguồn đề duy nhất nên không bao giờ ra đề cũ. |
| D4 | Sửa toàn bộ, số câu linh hoạt. Hai phần cố định `vocab-grammar` và `listening`, mỗi phần có ít nhất 1 câu. Mỗi câu đúng 4 đáp án. | Người dùng chọn. 4 đáp án là giả định sẵn của `test.js` (`OPTION_LETTERS`, `val < 4`). |
| D5 | Một org một đề: bảng `placement_test` khóa theo `org_id`, có cột `draft`, `published`, `revision`, `published_version`. Sửa đồng thời chặn bằng CAS trên `revision`, sai thì 409. | D1 không có transaction. CAS trên một dòng là đủ và phát hành là atomic. |
| D6 | `published` là snapshot JSON dựng lúc Phát hành, gồm `version`, `bands` kèm `courseLabel`, `parts` kèm `src`. Route công khai trả nguyên văn cột này, `Cache-Control: no-cache`. | Nháp không bao giờ lộ, và Phát hành có hiệu lực ngay. `courseLabel` thay map `COURSE_LABELS` 4 khóa của `test.js`, vì giáo viên chọn được mọi `LEAD_COURSES`. |
| D7 | Giữ chấm phía client, đáp án vẫn nằm trong payload công khai. | Giữ D4 của plan #511: bài xếp lớp không có phần thưởng theo điểm. `questions.json` hiện cũng đã công khai như vậy. |
| D8 | Audio lưu ở bucket `LIBRARY_AUDIO` với prefix `placement/<orgId>/<uuid>`, metadata ở bảng `placement_test_audio`. Mỗi lần upload sinh id mới, không ghi đè. Trần 20 MB, dùng lại `LIBRARY_AUDIO_MIME`. | Không cần resource Cloudflare mới. Id bất biến nên cache `immutable` được, và bản đang phát hành không bị hỏng khi nháp thay audio. |
| D9 | Route audio công khai hỗ trợ HTTP `Range` (`206`), mở rộng `MediaStore.get(key, range?)`. | Safari iOS cần `Range` để phát `<audio>`. Route audio hiện tại ghi rõ "chưa Range" (`admin-library.ts:787`), không dùng lại được nguyên trạng. |
| D10 | Upload audio dùng `PUT /api/placement-test/audio`, không dùng POST. | Guard kernel chặn mọi POST không phải JSON (`kernel.ts:161-169`), PUT không bị kiểm content-type. |
| D11 | Dọn audio chạy nền sau Phát hành: xóa audio không được nháp hay bản phát hành tham chiếu và cũ hơn 24 giờ. Xóa row trước, object sau. | Mốc 24 giờ tránh xóa file vừa upload ở tab khác mà chưa lưu nháp. Thứ tự theo precedent `admin-library`. |
| D12 | Đề gốc 30 câu và 5 MP3 chuyển sang `apps/web/public/placement-seed/`. Khi org chưa có nháp, màn sửa hiện nút "Nhập đề gốc": trình duyệt upload 5 audio qua API thường, xong mới `PUT` nháp. | Không cần script ops hay nhét MP3 vào Worker. Lỗi giữa chừng không để lại nháp dở, bấm lại là xong; audio mồ côi được D11 dọn. |
| D13 | Viết nháp và phát hành chỉ cho vai trò `canAccessFinance`, tức không gồm `ta` và `class_teacher`. | Thao tác này đổi nội dung công khai. Kernel mặc định cho mọi vai trò giáo viên. |
| D14 | Giáo viên nghe thử audio bằng `fetch` có cookie rồi `blob:` như `lib/repos/grading.ts`, và thêm `media-src 'self' blob:` vào CSP của web. | CSP web hiện không có `media-src`, nên `blob:` rơi về `default-src 'self'` và bị chặn. Phase 3 kiểm chứng trên header thật. |
| D15 | Chữ cố định trên trang profile không ghi số câu. `test.js` lấy số câu, số đoạn từ payload. | Số câu giờ do giáo viên quyết định; "30 câu" đang hard-code ở `index.html` trang chủ, trang test và `test.js`. |

## Phases

| # | Phase | Phụ thuộc | Effort | Status |
|---|---|---|---|---|
| 1 | [Contract, schema và Range cho kho audio](phase-01-contract-schema-range.md) | — | 0.5d | Pending |
| 2 | [API giáo viên và API công khai](phase-02-server-routes.md) | 1 | 1d | Pending |
| 3 | [Màn sửa đề trong apps/web](phase-03-web-editor.md) | 2 | 1.5d | Pending |
| 4 | [Trang profile đọc đề từ API](phase-04-profile-api-switch.md) | 2 | 0.5d | Pending |
| 5 | [E2E, tài liệu và thứ tự phát hành](phase-05-e2e-docs-rollout.md) | 3, 4 | 0.5d | Pending |

## Luồng chính

```text
apps/web /placement-test
  sửa nháp ──PUT draft (CAS revision)──> placement_test.draft
  thay audio ──PUT audio──> R2 LIBRARY_AUDIO + placement_test_audio
  Phát hành ──POST publish──> validate ──> placement_test.published, version + 1
                                                     │
apps/profile /kiem-tra-dau-vao/                      │ org = LEAD_ORG_ID
  test.js ──GET /public/placement-test──────────────>│
  <audio> ──GET /public/placement-test/audio/:id (Range)
  lỗi / 404 / 503 ──> trang bảo trì
```

## Tiêu chí hoàn thành

- [ ] Giáo viên sửa được câu hỏi, đáp án, đáp án đúng, cấp độ, tiêu đề đoạn nghe, số lần nghe, ngưỡng CEFR; thêm và xóa được câu, đoạn nghe; thay được audio và nghe thử ngay trên màn sửa.
- [ ] Lưu nháp không đổi đề học viên đang thấy; bấm Phát hành thì lần tải trang kế tiếp thấy đề mới, không deploy.
- [ ] Phát hành bị từ chối kèm danh sách lỗi khi có câu thiếu nội dung, thiếu đáp án đúng, đoạn nghe thiếu audio, hoặc ngưỡng không phủ kín `0..tổng điểm`.
- [ ] Hai tab cùng sửa thì tab lưu sau nhận 409 và thông báo tải lại, không ghi đè im lặng.
- [ ] Vai trò `ta` và `class_teacher` không ghi được; org khác không đọc được audio của nhau.
- [ ] Trang test hiển thị đúng số câu, số đoạn theo đề đã phát hành, và kết quả về form đăng ký vẫn đúng.
- [ ] Audio phát được qua API, trả `206` với header `Range`; smoke trên Safari iOS sau deploy.
- [ ] API lỗi hoặc chưa phát hành thì trang hiện bảo trì; bài làm dở trong `localStorage` không bị xóa.
- [ ] Build `apps/profile` không còn cổng `status`; repo không còn `questions.json` trong `public/`.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm --filter e2e e2e` đều qua.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Deploy `apps/profile` trước khi cô Mỹ phát hành thì học viên thấy trang bảo trì. | Runbook phase 5 quy định thứ tự: server và web, nhập đề, phát hành, kiểm `curl`, rồi mới deploy profile. |
| `LEAD_ORG_ID` khác org của giáo viên thì phát hành xong trang công khai vẫn không có đề. | `GET /api/placement-test` trả `isLeadOrg`, màn sửa hiện cảnh báo; runbook có bước kiểm. |
| Học viên đang làm dở khi giáo viên phát hành bản mới. | Tải lại trang thì `version` đổi và bài làm dở bị xóa. Hộp xác nhận Phát hành nêu rõ điều này. |
| Trang test đã mở sẵn phát audio của bản cũ sau khi D11 dọn file. | Nhánh lỗi audio hiện có hoàn lượt và báo lỗi. Chấp nhận vì tình huống hiếm và tải lại trang là hết. |
| Endpoint đọc công khai không có rate limit, kẻ xấu có thể gọi nhiều lần vào R2. | Chấp nhận: R2 không tính egress, và route đề chỉ đọc một dòng D1. Theo dõi sau phát hành. |
| Id audio của nháp truy cập được nếu đoán đúng UUID. | Chấp nhận: UUID không đoán được, route chỉ phục vụ audio của `LEAD_ORG_ID`. |
| Thay đổi `MediaStore.get` chạm các caller hiện có. | Tham số thứ hai là tùy chọn, store không hỗ trợ thì trả toàn bộ và route trả `200`. |

## Extension trace

Biến thể khả dĩ tiếp theo là org thứ hai có trang profile riêng. Hợp đồng payload công khai giữ nguyên; thứ phải đổi là cách chọn org ở route công khai, hiện đọc `LEAD_ORG_ID`. Dữ liệu đã khóa theo `org_id` nên không phải migrate. Plan không thêm tham số org hay registry nào cho việc này.

## Validation Log

### Session 1 — 2026-10-31

**Trigger:** quyết định kiến trúc trước khi soạn plan.
**Questions asked:** 4

1. **[Architecture]** Bộ đề nên được sửa ở đâu?
   - Options: apps/web | apps/admin | Cả hai
   - **Answer:** apps/web
   - **Rationale:** quyết định route, quyền và org của đề.
2. **[Architecture]** Cổng duyệt của cô Mỹ thay bằng gì?
   - Options: Nút Phát hành | Phát hành + giữ cổng build
   - **Answer:** Nút Phát hành
   - **Rationale:** bỏ được toàn bộ cổng status trong `build.mjs`.
3. **[Risks]** API lỗi hoặc chưa có bản phát hành thì trang làm gì?
   - Options: Báo lỗi kèm Zalo | Lùi về đề tĩnh
   - **Answer:** Khác
   - **Custom input:** "page bảo trì và báo quay lại sau"
   - **Rationale:** không giữ đề dự phòng; thẻ lỗi hiện có đổi thành trang bảo trì.
4. **[Scope]** Giáo viên được sửa tới mức nào?
   - Options: Toàn bộ, số câu linh hoạt | Giữ cấu trúc 15+15
   - **Answer:** Toàn bộ, số câu linh hoạt
   - **Rationale:** cần validate ngưỡng theo tổng điểm và bỏ số câu hard-code.

### Verification Results

- Mode: auto, không cần research ngoài. Không spawn reviewer con; phần phản biện làm trực tiếp trong session và đã đưa vào D8-D14 và bảng Rủi ro.
- Tier: Full (5 phase), kiểm thủ công bằng grep trên source. Claims checked: 17. Verified: 14. Sai và đã sửa trong phase: 3. Unverified: 1.
- Đã sửa: `lead-catalog-drift.test.ts:107` đang đọc `questions.json` nên phải đổi đường dẫn (phase 3); `profile-placement-test.spec.ts:287,298` chặn theo tên file MP3 nên phải đổi URL (phase 5); `kernelRoutes` thiếu kiểu cho `leadOrgId`, `getLibraryAudioStore` dù runtime đã có qua `...deps` (phase 2).
- Verified: POST trong kernel bắt buộc JSON (`kernel.ts:161-169`); PUT không bị kiểm; CSP web không có `media-src` (`security-headers.ts:15`); `X-File-Name` đã có trong CORS (`app.ts:325`); `canAccessFinance` gồm `teacher`, `owner`, `admin`; `FINANCE_NAV_KEY_MAP` lọc sidebar; `readiness.ts` tự suy ra bảng từ schema; `sanitizeMediaFileName`, `LEAD_COURSE_LABELS`, `uploadLibraryAudio` tồn tại; `packages/api` export wildcard `./*`.
- Unverified: `<audio src="blob:">` trong `submission-media-player` có thật sự bị CSP chặn trên production không. Phase 3 bước 7 kiểm trên header thật.

### Whole-Plan Consistency Sweep

- Files reread: `plan.md` và 5 phase.
- Unresolved contradictions: 0.

<!-- slug: placement-test-editor -->
