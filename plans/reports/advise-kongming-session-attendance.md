# Kongming checkpoint — research (2026-08-26)

Host: Grok / Oh My Pi — same-model counsel, không pin Fable/Sol.

**Verdict: GO-WITH-CHANGES**

## Pins

- Sequential-only: CTA chỉ buổi upcoming sớm nhất đủ điều kiện; POST 1 upcoming id / 1 sid / 1 click.
- Today enabled: `dateISO <= todayISOVietnam()`.
- Date gate UI-only. Không derive ngày trên server.
- Bãi status dropdown + fan-out issue #87. Không inline-edit topic trong slice này.
- Next risk: chọn nhầm `lessonId` từ slot bag.

## Non-goals

mark-absent, cột date, cancel-lesson trên tab này, đổi `sessionStatus`, bulk "Điểm danh tất cả".
