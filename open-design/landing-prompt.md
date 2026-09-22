# Open Design Prompt — Teacher OS Marketing Landing Page

Copy everything below the line into Open Design as a single prompt.

---

Design a single marketing landing page (deliver as `landing.html`, separate from any app screens) for **Teacher OS** — a teacher-first operations web app that lets independent teachers and small tutoring centers run their entire teaching business from one workspace: classes, students, syllabi, lessons, assignments, invoices, reports, notifications, and student feedback.

## Audience & goal
- Primary audience: solo teachers and tutors (IELTS/English test prep), 25–45, tech-comfortable but time-poor, currently juggling spreadsheets, notebooks, and chat groups. Secondary: small tutoring centers with 2–10 teachers.
- Page goal: convert visitors into early-access signups. Primary CTA is "Join the beta" (email capture), secondary CTA is "See how it works" (scrolls to product section).

## Page structure (in this exact order)
1. **Sticky nav** — wordmark logo left; links: Features, How it works, Pricing, FAQ; "Join the beta" button right. Transparent over hero, gains a subtle blur + border on scroll.
2. **Hero** — large display headline with the value proposition ("Run your whole teaching business from one place" — refine this copy), one supporting sentence, dual CTA (primary "Join the beta", ghost "See how it works"), and below it a browser-frame mockup of the app dashboard showing a realistic class list + today's schedule + upcoming lessons. Soft fade-in on load.
3. **Social proof strip** — 3–4 believable metrics (e.g. "1,200+ classes managed", "8,500+ assignments graded", "40+ syllabus templates"), muted text, thin dividers. No fake logos.
4. **Problem section** — headline "Teaching is the easy part. The admin isn't." with 3 short pain points: schedules scattered across tools, grading + invoicing done by hand, parents/students chasing updates.
5. **Feature grid** — 6 cards, one key message each, Lucide-style SVG line icons: Class management (schedules, packages, enrollments); Syllabus & lesson planning (templates copied into classes, lesson-by-lesson progress); Assignment bank & auto-grading (IELTS 4-skill prompts with answer keys); Invoicing (per-student invoices, payment status); Progress reports (per-student and per-class); Notifications & feedback (announcements, lesson feedback).
6. **How it works** — 3 numbered steps: Create your workspace → Set up classes from a syllabus template → Teach, grade, and invoice from one dashboard.
7. **Product deep-dive** — one large annotated screenshot-style mockup of the assignments grading view with 2–3 callout labels pointing at real UI elements.
8. **Testimonials** — 3 quote cards with avatar placeholder, name, role ("IELTS teacher, Hanoi"). Italic quotes, muted color.
9. **Pricing / early access** — a single simple card: "Free during beta. Early members lock in founder pricing." plus email capture form inline.
10. **FAQ** — 4–5 accordion items (Who is it for? Do students need accounts? What happens to my data? Which browsers? When do you launch?).
11. **Final CTA** — full-width centered band: headline, one line of copy, "Join the beta" button.
12. **Footer** — logo, short tagline, link columns (Product, Company, Legal), copyright.

## Visual style — must match our existing product design (Apple-inspired minimal)
- Background: `#ffffff`; alternate section surfaces: `#f5f5f7` and `#fbfbfd`; borders: `#e8e8ed` / `#d2d2d7`.
- Text: primary `#1d1d1f`, muted `#6e6e73`.
- Accent (links, buttons, highlights): `#0071e3`, hover `#0077ed`, active `#0066cc`; success `#16a34a`, warning `#eab308`, danger `#dc2626`.
- Typography: system stack ("SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif). Type scale: 12 / 14 / 17 (body base) / 21 / 28, hero display 48–64px with tight letter-spacing. Body line-height 1.5.
- Generous whitespace, large airy sections, rounded corners (10–14px on cards/buttons), very subtle shadows, thin 1px borders. Clean and calm — feel like an Apple product page, not a loud startup page.
- Motion: subtle scroll-reveal (Intersection Observer, fade + 12px rise), 150–300ms ease transitions on hover, sticky nav blur. Must respect `prefers-reduced-motion`.

## Hard requirements
- Fully responsive as one adaptive experience: 360, 390, 430, 768, 1024, 1440, 1920px. Mobile: nav collapses to hamburger + sheet; feature grid stacks to 1 column; hero mockup scales down without horizontal scroll.
- Accessibility: text contrast ≥ 4.5:1, visible focus rings, semantic HTML (single h1, ordered headings), buttons/links/inputs as real elements, labeled email inputs.
- Icons: SVG line icons only (Lucide/Heroicons style). Never emoji as icons.
- All copy must be realistic, specific product copy in English — no lorem ipsum, no "Your text here".
- SVG illustrations or CSS mockups for product screenshots are fine; do not use stock photos of people.
- Light mode only. Single self-contained `landing.html` (inline CSS/JS allowed).

## Avoid
- Purple-blue AI gradient clichés, glow effects, 3D blobs, noise textures.
- Dark backgrounds for the whole page.
- Generic dashboard screenshots with fake bar charts as filler.
- Overloaded hero with more than one message; more than one primary CTA style.
- Horizontal scroll at any viewport; fixed pixel container widths.

## Deliverable
One production-quality `landing.html` implementing everything above, ready to hand off to a developer.
