---
phase: 1
title: "R2 + MediaStore + contract + DB"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: R2 + MediaStore + contract + DB

## Goal
Server có chỗ lưu file bài nói (R2 ở production/dev, đĩa ở e2e) qua một interface inject được. Contract và DB có đủ field để mô tả file đã nộp của một attempt.

## Bối cảnh
- Infra: `packages/infra/alchemy.run.ts`. `Cloudflare.D1.Database("database", …)` được bind vào `env.DB` của `Cloudflare.Worker("server", …)`. `ServerEnv = Cloudflare.InferEnv<typeof server>` được `packages/env/env.d.ts` re-export thành `CloudflareEnv`, nên binding mới tự có type.
- API R2 của alchemy (đã xác minh trên repo alchemy `main`): `Cloudflare.R2.Bucket("Bucket", { forceDestroy: true })`, rồi đưa object đó vào `env: { Bucket }`. Local dev có `BucketLocal`.
- Deps: `AppDeps` (`apps/server/src/app.ts:29`) và `StudentRouteDeps` (`apps/server/src/routes/student.ts:51`). `apps/server/src/index.ts` dựng deps từ `env`.
- E2E boot: `apps/e2e/src/boot.ts` dựng `buildApp` dưới Node bằng libsql.
- Schema: `packages/db/src/schema/quiz-attempt.ts`. Sau #304, migration mới nhất là `0031_*`. Tạo migration bằng `pnpm db:generate`.
- Contract: `packages/api/src/contracts.ts`, mục "Student quiz take & review (#283)" (khoảng `:1647`). Test của `packages/api/src/lib/*` đặt ở `apps/student/test/` (precedent `quiz-parts.test.ts`, `word-count.test.ts` của #304).

## Files to Create / Modify
- Modify: `packages/infra/alchemy.run.ts`
- Create: `apps/server/src/lib/media-store.ts` (interface thuần, không type Cloudflare), `apps/server/src/lib/r2-media-store.ts` (adapter R2, chỉ `index.ts` import) <!-- Updated: Red Team 2026-10-02 -->
- Modify: `apps/server/src/app.ts`, `apps/server/src/routes/student.ts` (chỉ phần interface deps), `apps/server/src/index.ts`
- Create: `apps/e2e/src/fs-media-store.ts`
- Modify: `apps/e2e/src/boot.ts`
- Modify: `packages/db/src/schema/quiz-attempt.ts`
- Create (generated): `packages/db/src/migrations/0032_*.sql`, `meta/0032_snapshot.json`, cập nhật `meta/_journal.json`
- Modify: `packages/api/src/contracts.ts`
- Create: `packages/api/src/lib/quiz-media.ts`
- Create: `apps/student/test/quiz-media.test.ts`

## Tasks & Steps

### 1.1 Bucket R2
- [ ] Trong `alchemy.run.ts`, khai báo `export const media = Cloudflare.R2.Bucket("media", {});` cạnh `db`. Không bật `publicDomain` hay custom domain: bucket private, chỉ Worker đọc/ghi. Không dùng `forceDestroy` vì đây là dữ liệu học viên.
- [ ] Thêm `MEDIA: media` vào `env` của Worker `server`, kèm comment một dòng giải thích bucket chứa file bài nói học viên, private, chỉ truy cập qua route `/api/student/attempts/:id/media`.
- [ ] `pnpm --filter @teacher-os/infra check-types` phải xanh. Nếu `Cloudflare.R2` không tồn tại ở `alchemy@2.0.0-beta.72` thì **dừng lại hỏi user** có nâng alchemy không. Không tự nâng.

### 1.2 `MediaStore` (server)
<!-- Updated: Red Team 2026-10-02 - tách interface/adapter, đếm byte thật, runInBackground -->
- [ ] `apps/server/src/lib/media-store.ts` chỉ chứa interface và lỗi dùng chung, không tham chiếu `R2Bucket` hay global Cloudflare nào: e2e (`tsconfig types: ["node"]`) type-check `server/app` → `app.ts` → file này. Export thêm `class MediaSizeMismatchError extends Error`. `app.ts` re-export `type MediaStore` để e2e import qua `server/app` (package `server` chỉ export `.`, `./app`, `./session`).
  ```ts
  export interface StoredMedia {
    body: ReadableStream<Uint8Array>;
    contentType: string;
    size: number;
  }
  export interface MediaStore {
    /** `size` = Content-Length đã kiểm; body là stream request chưa đọc. */
    put(key: string, body: ReadableStream<Uint8Array>, meta: { contentType: string; size: number }): Promise<void>;
    get(key: string): Promise<StoredMedia | null>;
    delete(key: string): Promise<void>;
  }
  export function createR2MediaStore(bucket: R2Bucket): MediaStore
  ```
- [ ] `apps/server/src/lib/r2-media-store.ts`: `createR2MediaStore(bucket: R2Bucket): MediaStore`. `put` gọi `bucket.put(key, body.pipeThrough(new FixedLengthStream(size)), { httpMetadata: { contentType } })`. `FixedLengthStream` là API native của Workers: R2 nhận stream có độ dài biết trước, và byte thật lệch `size` thì stream lỗi; adapter map lỗi đó thành `MediaSizeMismatchError`. `get` map `R2ObjectBody` → `{ body, contentType: httpMetadata?.contentType ?? "application/octet-stream", size }`. `delete` gọi `bucket.delete(key)`.
- [ ] `AppDeps` và `StudentRouteDeps` thêm `getMediaStore?(): MediaStore | undefined` và `runInBackground?(promise: Promise<unknown>): void`, kèm docblock giải thích vì sao optional: các test hiện có không cần storage, và thiếu store thì route media trả 503. Thiếu `runInBackground` thì handler tự `void promise.catch(log)`. `buildApp` truyền xuống `studentRoutes`.
- [ ] `index.ts`: `getMediaStore: () => env.MEDIA ? (mediaStore ??= createR2MediaStore(env.MEDIA)) : undefined` (binding thiếu → 503, không phải TypeError 500), lazy và memoized giống `db`. `runInBackground: (p) => waitUntil(p)` theo precedent auth.

### 1.3 Store cho e2e
- [ ] `apps/e2e/src/fs-media-store.ts`: `createFsMediaStore(dir: string): MediaStore`.
  - `put` ghi stream xuống `join(dir, encodeURIComponent(key))` bằng `Readable.fromWeb` + `pipeline`, đếm byte trong lúc ghi; lệch `size` thì xoá file dở và ném `MediaSizeMismatchError`. Ghi sidecar `.json` chứa `{ contentType, size }` sau khi ghi xong. Type của stream Node/web khác workers-types nên cast tại biên adapter. <!-- Updated: Red Team 2026-10-02 -->
  - `get` đọc sidecar, trả `Readable.toWeb(createReadStream(...))`. Không có file thì trả null.
  - `delete` dùng `rm(..., { force: true })` cho cả hai file.
- [ ] `boot.ts`: tạo thư mục `mkdtemp(join(os.tmpdir(), "teacher-os-e2e-media-"))` lúc boot và truyền `getMediaStore: () => store` vào `buildApp`. Comment rõ: đây là adapter lưu trữ thật cho runtime Node, giống libsql thay D1.

### 1.4 DB
- [ ] `quiz-attempt.ts` thêm các cột nullable:
  - `mediaKey: text("media_key")`
  - `mediaName: text("media_name")`
  - `mediaType: text("media_type")`
  - `mediaSize: integer("media_size")`
  - `mediaUploadedAt: integer("media_uploaded_at", { mode: "timestamp_ms" })`

  Cập nhật docblock: file bài nói Speaking do học viên upload, key trỏ vào bucket `MEDIA`, null nghĩa là chưa có file.
- [ ] `pnpm db:generate`. Kiểm tra SQL sinh ra chỉ gồm 5 câu `ALTER TABLE \`quiz_attempt\` ADD …`. Giữ nguyên tên file drizzle sinh.

### 1.5 Contract + helper
- [ ] Trong `contracts.ts`, cạnh `QUIZ_ANSWER_VALUE_MAX`:
  - `QUIZ_MEDIA_MAX_BYTES = 50 * 1024 * 1024`, kèm comment: user chốt 50MB, dưới trần 100MB body của Worker Free/Pro, đủ cho audio và video 720p ngắn.
  - `QUIZ_MEDIA_NAME_MAX = 200`.
  - `QUIZ_MEDIA_TYPES: Readonly<Record<string, string>>` là map MIME → nhãn: `audio/mpeg: "MP3"`, `audio/mp4` và `audio/x-m4a: "M4A"`, `audio/aac: "AAC"`, `audio/wav`, `audio/x-wav` và `audio/wave: "WAV"`, `audio/webm: "WEBM"`, `audio/ogg: "OGG"`, `video/mp4: "MP4"`, `video/quicktime: "MOV"`, `video/webm: "WEBM"`.
  - `quizAttemptMediaSchema = z.object({ name: z.string(), type: z.string(), size: z.number().int().min(0), uploadedAt: z.string() }).strict()` và type `QuizAttemptMedia`.
  - `studentQuizDetailSchema.attempt` thêm `media: quizAttemptMediaSchema.nullable().optional()`. Optional để client mới chạy được với server cũ.
  - `quizAttemptSummarySchema` thêm `skill: z.string().optional()` và `media: quizAttemptMediaSchema.nullable().optional()`, optional theo precedent `essay` của #304 (client mới + server cũ không throw). `quizAttemptDetailSchema` kế thừa hai field này qua `.omit({ items })`, nên handler detail cũng set chúng. <!-- Updated: Red Team 2026-10-02 -->
- [ ] `packages/api/src/lib/quiz-media.ts`:
  - `resolveQuizMediaType(fileName: string, browserType: string): string | null`. Trả `browserType` (lowercase, bỏ `;params`) nếu nằm trong `QUIZ_MEDIA_TYPES`. Nếu không thì tra theo đuôi file: `mp3 → audio/mpeg`, `m4a → audio/mp4`, `aac → audio/aac`, `wav → audio/wav`, `weba → audio/webm`, `ogg`/`oga → audio/ogg`, `mp4 → video/mp4`, `mov → video/quicktime`, `webm → video/webm`. Không khớp thì trả null.
  - `isVideoMediaType(type: string): boolean`.
  - `formatMediaSize(bytes: number): string`, ví dụ "820 KB" hoặc "12,4 MB" (dấu phẩy thập phân theo vi-VN).
  - `sanitizeMediaFileName(raw: string): string | null`. Cắt mọi thứ trước `/` hoặc `\` cuối cùng, bỏ ký tự điều khiển `\p{Cc}` và ký tự định dạng `\p{Cf}` (bidi override như U+202E, zero-width), trim. <!-- Updated: Red Team 2026-10-02 --> Rỗng hoặc dài hơn `QUIZ_MEDIA_NAME_MAX` thì trả null. Server và client dùng chung hàm này.
- [ ] `apps/student/test/quiz-media.test.ts`:
  - `resolveQuizMediaType`: `File.type` rỗng với `.m4a` → `audio/mp4`; `audio/x-m4a` giữ nguyên; `video/quicktime`; `.MOV` viết hoa; `application/pdf` + `.pdf` → null; `text/html` + `.mp3` → `audio/mpeg` (tên file thắng MIME lạ, server vẫn kiểm lại).
  - `formatMediaSize`: 0, 1023, 1.5MB, 50MB.
  - `sanitizeMediaFileName`: path `C:\fakepath\a.mp3` → `a.mp3`; `../../x.mp3` → `x.mp3`; chuỗi có `\u0000`; chuỗi có `\u202E` bị bỏ ký tự đó; chuỗi toàn khoảng trắng → null; 201 ký tự → null.

## Verification
- `pnpm --filter @teacher-os/infra check-types`: xanh.
- `pnpm --filter student test -- quiz-media`: xanh.
- `pnpm check-types`: xanh, gồm cả `pnpm --filter e2e check-types` (bắt lỗi nếu `R2Bucket` lọt vào module e2e type-check). Hai field mới là optional nên fixture cũ không vỡ. Handler server set `skill: loaded.skill`, `media: null` ngay ở phase này; Phase 2 hoàn thiện `media`. <!-- Updated: Red Team 2026-10-02 -->
- Thủ công: `pnpm dev` boot được với binding `MEDIA` (alchemy dev tạo bucket local). Nếu fail vì tài khoản chưa bật R2, ghi bước bật R2 cho dev vào runbook ở Phase 4.

## Risks
- `alchemy dev` cần tạo bucket local ở lần chạy đầu. Chạy `pnpm dev` một lần để chắc dev stack (port 8000/8001/8003) vẫn boot.
