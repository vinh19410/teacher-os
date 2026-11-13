---
type: reverse-usecase
feature: student-quiz
uc: UC-05
status: draft
updated: 2026-11-12
---
# UC-05 — Tải lên, thay, xoá và nghe lại file bài nói

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Với đề Speaking, học viên tải một file ghi âm/ghi hình; có thể thay hoặc xoá trước khi nộp; sau nộp nghe/xem lại file của mình |
| (b) Actor chính | Học viên. Phụ: R2 object storage |
| (c) Tiền điều kiện | Attempt `in_progress` (PUT/DELETE) hoặc `submitted` (chỉ GET); bucket R2 đã cấu hình (không → 503); trình duyệt hỗ trợ fetch blob |
| (d) Hậu điều kiện | Attempt trỏ đúng một object R2 qua 5 cột `media_*`; object key không bao giờ rời server; file cũ được dọn nền |

**(e) Luồng chính**

1. Học viên kéo-thả/chọn file; panel kiểm định dạng theo allowlist hiển thị. — ✅ [S18] `apps/student/src/components/quiz/speaking-submission-panel.tsx:316-450`, [S9] `packages/api/src/lib/quiz-media.ts:19-46`
2. PUT raw body kèm `Content-Type`, `Content-Length`, `X-File-Name` (encodeURIComponent). — ✅ [S1] `apps/server/src/routes/student.ts:1691-1698` (docblock), [S11] `apps/student/src/lib/repos/quiz.ts` (XHR progress/abort)
3. Máy chủ kiểm rẻ: Content-Length tồn tại (411), body không rỗng (400), MIME trong 12 loại (415), tên file hợp lệ sau strip Cc/Cf + ≤200 ký tự (400). — ✅ [S1] `apps/server/src/routes/student.ts:1713-1737`
4. Stream vào R2 với object key mới `quiz-media/{orgId}/{attemptId}/{uuid}`; cap 50MB đo trên byte thật (`FixedLengthStream` + `enforceDeclaredSize`, lệch → 400 `size mismatch`). — ✅ [S1] `apps/server/src/routes/student.ts:1745-1761`, [S26] `apps/server/src/lib/r2-media-store.ts:14-48`, `apps/server/src/lib/media-store.ts`
5. CAS ghi DB: UPDATE 5 cột `media_*` WHERE attempt thuộc học viên + `status='in_progress'` + (`media_key` IS NULL lần đầu hoặc = key cũ khi thay). — ✅ [S1] `apps/server/src/routes/student.ts:1765-1804`
6. Thắng CAS → xoá object cũ nền (best-effort); trả media DTO (name/type/size/uploadedAt — không có key). — ✅ [S1] `apps/server/src/routes/student.ts:1751-1807`, [S26] `apps/server/src/lib/media-response.ts:15-27`
7. Nộp bài được mở khoá khi đã có file (đề Speaking); xoá file khoá lại. — ✅ [S16] `apps/student/src/components/quiz/quiz-take-view.tsx`; e2e [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:1165-1195`
8. Xem lại sau nộp: GET media stream về client (fetch đính header org) → blob URL → player "Nghe lại bài nói"/"Xem lại bài nói". — ✅ [S1] `apps/server/src/routes/student.ts:1890-1909`, [S11] `apps/student/src/lib/repos/quiz.ts:340-431`, [S19] `apps/student/src/components/quiz/quiz-media-player.tsx:87-130`

**(f) Luồng thay thế/đặc biệt**

- f1: Thay file khi request khác đã đổi/xoá (thua CAS) → 409 `MEDIA_CONFLICT`, client "File vừa được thay ở tab khác — đã tải lại." + xoá object mới bù. — ✅ [S1] `apps/server/src/routes/student.ts:1804`; [S18] `apps/student/src/components/quiz/speaking-upload-state.ts:69-74`
- f2: Sau nộp PUT/DELETE → 409 `ATTEMPT_SUBMITTED`; DELETE sau nộp không xoá object R2. — ✅ [S1] `apps/server/src/routes/student.ts:1742,1867-1877`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:564-600`
- f3: DELETE khi chưa có file → ok (idempotent). — ✅ [S1] `apps/server/src/routes/student.ts:1824-1881`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:735-762`
- f4: Lỗi tải lên map theo mã: 413 "File vượt quá 50 MB.", 415 "Định dạng không hỗ trợ.", 400 "File không hợp lệ. Hãy chọn file khác.", mất mạng "Không tải lên được — kiểm tra kết nối.", 401 → reauth. — ✅ [S18] `apps/student/src/components/quiz/speaking-upload-state.ts:46-110`
- f5: Xoá có xác nhận "Xoá file bài nói?"; rời trang giữa chừng tải lên có hỏi trước, huỷ quay lại dropzone. — ✅ [S18] `apps/student/src/components/quiz/speaking-submission-panel.tsx:567`; e2e [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:1196-1255`
- f6: Bucket chưa cấu hình → 503 `media storage unavailable` ở mọi route media. — ✅ [S1] `apps/server/src/routes/student.ts:1704,1829-1831,1896-1898`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:600-620`
- f7: Player không phát được định dạng → "Trình duyệt không phát được định dạng này." + nút "Tải file về". — ✅ [S19] `apps/student/src/components/quiz/quiz-media-player.tsx:124-130`

**(g) Dữ liệu chính**

- Vào: raw bytes + `Content-Type` + `Content-Length` + `X-File-Name`; DELETE không body.
- Ra: `QuizAttemptMedia {name, type, size, uploadedAt}`; stream object với header nosniff/CSP sandbox/CORP same-site/no-store + `Content-Disposition` RFC 8187. — ✅ [S7] `packages/api/src/contracts.ts:2445-2454`, [S26] `apps/server/src/lib/media-response.ts:29-46`

**(h) Truy vết test**

- Unit: upload/thay/headers — `apps/server/src/routes/student-quiz-media.test.ts:337-418`; guard 401/403/415/413 — `:453-563`; CAS lost → MEDIA_CONFLICT — `:669-707`; delete idempotent — `:735-762`; 503 — `:600-620`. — ✅
- E2E: kéo-thả, sống qua reload, thay file, nộp, phát lại — `apps/e2e/specs/student-quiz-take-review.spec.ts:1083-1164`; xoá file khoá nộp — `:1165-1195`; rời giữa chừng — `:1196-1255`. — ✅
