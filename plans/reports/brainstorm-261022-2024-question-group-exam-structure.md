# Brainstorm: cấu trúc bộ đề có tầng Question Group (tham chiếu Selfomy)

Ngày: 2026-10-22 · Trạng thái: đã chốt phạm vi (PR1 + PR2) · Supervisor: kongming (đồng ý phương án A, có chỉnh sửa)

## Bối cảnh

Selfomy One (Livewire v2, quan sát trực tiếp 2026-10-22) lưu đề theo cây
`section → question_group → question → answer`. Mỗi lần Save, trình duyệt gửi
cả cây qua `POST /livewire/message/education.quiz.quiz-builder`, với ULID do
client sinh. Group mang `question_type`, phần hướng dẫn dạng rich text có token
`{{ a }}` để đặt ô điền ngay trong bài, cùng các cờ
`answer_inputs_inside_content`, `split_content_and_questions` và
`allow_drag_drop_answers`. Mỗi answer có `is_correct` và một trường feedback
(giải thích).

Repo hiện tại gồm `library_test` → `library_test_part`. Part là slot cố định:
`p1..p3` cho Reading, `s1..s4` cho Listening. Mỗi part có đúng một `type` và
`questions` là JSON phẳng. Đoạn `ASSIGNMENT_PART_TYPES` khóa danh sách type
theo từng part. `gradeQuiz` (`packages/api/src/lib/grade-quiz.ts`) chấm theo
index bắt đầu từ 0 trên snapshot phẳng, và tách `alts` theo " / ". Cách này
tương đương kiểu "Car / Cars" của Selfomy.

Hiện chỉ `apps/server/src/routes/admin-library.ts` đọc `library_test`. Học
viên chưa làm được đề trong thư viện.

## Contract

- **Outcome:** Admin dựng được đề IELTS Reading/Listening có nhiều nhóm câu
  trong cùng một passage hay section. Mỗi nhóm có dạng bài riêng, phần hướng
  dẫn riêng, có thể đặt ô điền ngay trong nội dung và có option bank riêng.
  Mỗi câu có thể kèm giải thích. Bố cục editor tương tự Selfomy: cột mục lục
  bên trái và các thẻ Section → Group → Question mở ra được.
- **Constraints:** Giữ `questions` là mảng phẳng để `gradeQuiz`, snapshot và
  review không phải đổi. Đề cũ không có group vẫn đọc được. Đánh số câu luôn
  tính từ thứ tự part rồi đến index, không lưu cứng. Giữ nguyên SQLite và
  Drizzle. `assignmentQuestionSchema` đang dùng chung và `.strict()`.
- **Non-goals:** Không tách bảng section/group/question/answer như Selfomy.
  Không bỏ slot cố định để chuyển sang section tự do. Không làm Writing hay
  Speaking. Không làm "Nhập đề bằng AI".
- **Acceptance:**
  - Tạo được một part Reading gồm 2 nhóm (TFNG và note completion có gap
    inline), lưu rồi tải lại vẫn đúng.
  - Đề cũ hiển thị như một nhóm ngầm.
  - `superRefine` từ chối dải câu chồng nhau, bị hở, hoặc có số gap khác
    `count`.
  - Grader vẫn pass toàn bộ test hiện có.

## Phương án và trade-off

| Phương án | Giả định chịu lực | Hỏng trước tiên khi |
|---|---|---|
| **A. Thêm cột `groups` JSON vào part; mỗi group trỏ tới một dải câu phẳng** (khuyến nghị) | Mọi consumer chỉ cần index phẳng cộng metadata hiển thị | Bất biến dải câu không được kiểm, làm lệch số câu hoặc gap |
| B. Tách thành bảng section/group/question/answer như Selfomy | Cần truy vấn hoặc thống kê theo từng câu ở tầng DB | Phải sửa khoảng 12 consumer cùng grader, trong khi E2E chỉ chạy local |
| A′. Lồng `questions` vào trong `groups[]` (bản đầu của A) | Grader được viết lại để duyệt cây | Đáp án lưu theo index sẽ vỡ ở snapshot và review |

**Better approaches:** Nên chọn A với dải câu phẳng thay cho A′ (do kongming
đề xuất). Bằng chứng là `gradeQuiz` chấm theo key `String(index)` trên
snapshot phẳng. Chi phí chuyển đổi là 0, vì grader giữ nguyên.

## Hình dạng đề xuất

```ts
// library_test_part.groups: JSON text, mặc định "[]" = một nhóm ngầm phủ cả part
type QuestionGroup = {
  id: string;            // ULID
  type: string;          // thuộc catalog type của skill (không còn khóa theo part)
  instruction: string;   // rich text; có thể chứa {{gap}} theo thứ tự trong nhóm
  startIndex: number;    // index vào questions[] phẳng
  count: number;
  optionBank: string[];  // chuyển từ part xuống nhóm
  answersInline: boolean;     // tương ứng answer_inputs_inside_content
  splitContent: boolean;      // tương ứng split_content_and_questions
  dragDrop: boolean;
};
// assignmentQuestionSchema bổ sung (additive): explanation?: richText
```

"Choose TWO" được tách thành 2 câu phẳng cùng nhóm, kèm cờ `unordered`. Grader
so theo tập trong phạm vi nhóm. Đây là chỗ duy nhất phải sửa grader, nên cần
test riêng.

## Thứ tự triển khai (kongming đề xuất)

1. **PR1:** thêm `explanation` vào schema dùng chung, theo kiểu additive, và
   cho grader hỗ trợ `unordered`.
2. **PR2:** thêm cột `groups` vào `library_test_part`, viết validate bất biến,
   và làm lại editor `apps/admin` theo bố cục Selfomy.
3. **PR3:** mang `groups` sang `assignment_prompt`, web composer và màn làm bài
   của học viên.
4. Làm sau: màn "Answers Checking", tức parser thuần cho answer key dạng
   `1. A`.

## Rủi ro cần canh

- Bất biến dải câu: các nhóm phải nối tiếp, không chồng nhau và tổng `count`
  bằng `questions.length`.
- Parse gap token trên HTML đã sanitize, vì editor có thể cắt ngang token.
- Snapshot của attempt phải đóng băng cả `groups`.
- Client cũ gửi lên schema `.strict()` sẽ nhận lỗi 400 nếu không deploy đồng
  bộ.

## Quyết định của người dùng (2026-10-22)

- Đợt này chỉ làm PR1 và PR2: admin soạn được đề có question group. PR3 (học
  viên làm đề thư viện, `assignment_prompt`, web composer) để đợt sau.
- Giữ slot cố định `p1..p3` và `s1..s4`. Không làm section tự do.
- (2026-10-23) Ô trống của nhóm inline dùng marker `____` sẵn có trong stem (`ClozeEditor`), không dùng token `{{gap}}`. Plan: `plans/261022-1329-library-question-groups/`.
