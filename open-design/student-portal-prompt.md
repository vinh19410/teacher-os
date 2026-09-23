# Open Design Prompt — Teacher OS Student Portal

Copy everything below the line into Open Design as a single prompt.

---

Design the **student portal home screen** for **Teacher OS** — an operations web app that today serves teachers (classes, students, lessons, assignments, invoicing). We are adding a student-facing view: after logging in, a student lands on this screen and sees the **classes they are currently enrolled in** and their **current and upcoming assignments**. Deliver as `student-portal.html`, separate from any teacher screens, but it must look like it belongs to the same product.

## Audience & goal
- Primary audience: students at a Vietnamese IELTS/English tutoring center, ages 15–35, mobile-first (most will open on a phone), low tolerance for clutter — they open the app to answer "what's my homework and when is my next class".
- Goal: within 3 seconds of login the student can see which classes they're in, when those classes meet, and which assignments are due with their status.
- Read-only scope: the student sees only their own data. No teacher/admin actions, no grading, no invoicing.

## Screen structure (top to bottom)
1. **App shell** — desktop: slim left sidebar like the teacher app, only 2–3 items ("Trang chủ", "Bài tập", "Hồ sơ"). Mobile: compact top bar with wordmark left, avatar + first name right.
2. **Greeting header** — a greeting with the student's first name ("Chào Minh"), today's date in Vietnamese ("Thứ Ba, 23/09"), plus one summary line like "2 bài tập sắp đến hạn trong tuần này".
3. **"Lớp học của tôi" (My classes)** — one card per enrolled class (2–3 classes in the mock data). Each card: class name (e.g. "IELTS Foundation A"), level chip ("IELTS 5.0–6.0"), mode chip ("Online"), weekly schedule ("T2 & T5 · 18:30–20:00"), course progress ("Buổi 12/24" with a thin progress bar), and next session ("Buổi tới: Thứ Năm 25/09 · Writing Task 2"). Desktop: 2–3 column grid; mobile: stacked full-width cards.
4. **"Bài tập" (Assignments)** — segmented filter tabs: "Tất cả" / "Sắp đến hạn" / "Quá hạn" / "Đã nộp". Below, a list of assignment rows/cards, each with: title (realistic IELTS homework, e.g. "Writing Task 2 – Opinion Essay"), the class it belongs to, due date with relative time ("Hạn: 25/09 · còn 2 ngày"), and a status chip: "Chưa nộp" (neutral), "Sắp đến hạn" (warning, ≤3 days to due), "Quá hạn" (danger), "Đã nộp" (success). Include one graded example showing a band score ("Điểm: 6.5"). Overdue items sort first.
5. **Empty states** — design a compact empty state for "no classes yet" and one for "no assignments" (friendly one-liner in Vietnamese + subtle Lucide-style icon, no heavy illustration).
6. **Account** — logout and profile reachable from the avatar menu.

## Visual style — must match our existing product design (Apple-inspired minimal)
- Background: `#ffffff`; card/section surfaces: `#f5f5f7` and `#fbfbfd`; borders: `#e8e8ed` / `#d2d2d7`.
- Text: primary `#1d1d1f`, muted `#6e6e73`.
- Accent (links, buttons, active tab, progress bar): `#0071e3`, hover `#0077ed`, active `#0066cc`; success `#16a34a`, warning `#eab308` (use `#a16207` for warning *text* on light backgrounds for contrast), danger `#dc2626`.
- Typography: system stack ("SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif). Type scale 12 / 14 / 17 (body base) / 21 / 28. Page title 28, section titles 21, body 17, meta text 14, chips 12. Line-height 1.5.
- Cards: 12–18px radius, 1px borders, very subtle shadows, generous padding (16–24px). Calm and airy — an Apple product feel, not gamified.
- Motion: subtle fade + 8–12px rise on section reveal, 150–300ms ease on hover/press, 200ms crossfade on tab switch. Respect `prefers-reduced-motion`.

## Copy language
- All visible UI copy must be in **Vietnamese** (the product's app UI is Vietnamese): "Lớp học của tôi", "Bài tập", "Sắp đến hạn", "Quá hạn", "Đã nộp", "Chưa nộp", "Hạn nộp", "Buổi tới", "Buổi 12/24", "Điểm". Dates in Vietnamese format ("Thứ Hai, 22/09"). Assignment titles may keep English IELTS terms ("Writing Task 2", "Speaking Part 1") because that is how teachers name homework.

## Hard requirements
- Mobile-first adaptive experience at 360, 390, 430, 768, 1024, 1440, 1920px. Touch targets ≥ 44px; tabs and chips comfortably tappable. No horizontal scroll at any viewport.
- Accessibility: text contrast ≥ 4.5:1 (never yellow text on white), visible focus rings, semantic HTML (single h1, ordered headings), tabs as real buttons with `aria-selected`, status conveyed by text + color together (never color alone).
- Icons: SVG line icons only (Lucide/Heroicons style). Never emoji as icons.
- Realistic mock data for one student: 2 classes, 6–8 assignments spread across all four statuses with believable IELTS homework titles and staggered due dates around today.
- Light mode only. Single self-contained `student-portal.html` (inline CSS/JS allowed).

## Avoid
- Gamification clichés: streak flames, coins, confetti, cartoon mascots, bright gradients.
- Diverging from the teacher-side design language: no new accent color, no different font family, no heavy shadows.
- A 5-item bottom tab bar — the student scope is small; keep navigation to 2–3 destinations.
- Dense data tables on mobile; more than one primary button style; placeholder text ("Lorem ipsum", "Your text here").

## Deliverable
One production-quality `student-portal.html` implementing everything above, ready to hand off to a developer, visually consistent with the existing teacher screens.
