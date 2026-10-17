# Flinto Review Specification (v2 — memory levels)

The review rules both native apps (iOS and Android) implement: five memory
levels with a warning flag, objective quiz answers, a shuffled session, and a
fixed wait per level. The model is inspired by the five-level review model
common in vocabulary apps; every rule below is Flinto's own. Both platforms
must produce **byte-identical results** for identical inputs; conformance is
verified against the shared vectors in `shared/srs/level-vectors.json`
(regenerate/verify with `node shared/srs/generate-level-vectors.mjs --check`).

## 1. Card fields

| Field | Type | Meaning |
|---|---|---|
| `level` | Int 1…5 | How well the word is known. New cards start at 1. |
| `isWarning` | Bool | Set when a level-5 card is answered wrong for the first time. **Invariant: `isWarning` is only ever `true` at level 5.** Migration, backfill, seed and card creation never set it. |
| `state` | `new \| review` | `new`: never answered. `review`: answered at least once. |
| `intervalDays` | Int | The day count of the last scheduled wait. Display and export only; scheduling never reads it. `0` for new cards. |
| `dueAt` | Int (epoch ms, UTC) | When the card may be reviewed again. A card is due iff `dueAt <= now`. |
| `lapses` | Int | Times a known word (level ≥ 2) got a non-correct first result. Never decremented. |

Constants: `DAY_MS = 86_400_000`, `LEVEL_INTERVAL_DAYS = [1, 3, 7, 14, 30]`
(index `level − 1`), `WARNING_INTERVAL_DAYS = 1`, `MIN_LEVEL = 1`,
`MAX_LEVEL = 5`.

## 2. Answer math

`applyAnswer(card, correct, now)` turns the first result of a card in a session
into its new level, flag, wait and due time. `now` is the answer timestamp
(epoch ms).

```
level = card.level, warning = card.isWarning
if correct:
    newLevel   = warning ? level - 1 : level + 1
    newWarning = false
else if level >= 5:
    if warning: newLevel = 1; newWarning = false
    else:       newLevel = 5; newWarning = true
else if level >= 2:
    newLevel = level - 1; newWarning = false
else:
    newLevel = 1; newWarning = false
newLevel     = clamp(newLevel, 1, 5)
intervalDays = newWarning ? 1 : LEVEL_INTERVAL_DAYS[newLevel - 1]
return { level: newLevel, isWarning: newWarning, state: "review",
         intervalDays, dueAt: now + intervalDays * DAY_MS,
         lapses: card.lapses + (!correct && level >= 2 ? 1 : 0) }
```

| Level before | Flag before | Result | Level after | Flag after | Wait (days) |
|---|---|---|---|---|---|
| 1 | no | correct | 2 | no | 3 |
| 1 | no | wrong | 1 | no | 1 |
| 2 | no | correct | 3 | no | 7 |
| 2 | no | wrong | 1 | no | 1 |
| 3 | no | correct | 4 | no | 14 |
| 3 | no | wrong | 2 | no | 3 |
| 4 | no | correct | 5 | no | 30 |
| 4 | no | wrong | 3 | no | 7 |
| 5 | no | correct | 5 | no | 30 |
| 5 | no | wrong | 5 | yes | 1 |
| 5 | yes | correct | 4 | no | 14 |
| 5 | yes | wrong | 1 | no | 1 |

Rules in words:

- A correct answer raises the level by one, up to 5. A correct answer on a
  flagged card lowers it by one instead (the card is still recovering from a
  slip) and clears the flag.
- A wrong answer lowers a level 2–4 card by one and leaves a level 1 card at 1.
  The first wrong answer at level 5 keeps the level and sets the warning flag;
  a wrong answer on a flagged card drops it to level 1.
- The flag is reset by every result except the first wrong answer at level 5.
  The level is always clamped to 1…5.
- A flagged card waits `WARNING_INTERVAL_DAYS = 1` day instead of level 5's 30
  days, so a wrong answer at level 5 is re-tested tomorrow.
- `lapses` counts forgetting a known word: it grows only when a first result is
  not correct and the level before the answer was ≥ 2.
- Waits are `now + n × DAY_MS`, not local calendar days, so vectors stay
  deterministic.

## 3. Session

1. **Build.**
   - **Global daily session (`lessonDeckId == null`):** Take live cards with `dueAt <= now` whose deck satisfies `deck.sourceLessonId == null || card.state == "review"` (so unstudied `new` cards from Course lessons never flood the Home queue, while studied `review` cards from Courses join daily SRS reviews when due). Sort by `dueAt` ascending (ties: iOS by `createdAt`, then `id`; Android by `rowid`), keep the first `cap` cards (Profile "Words per session", default 20), then shuffle with Fisher–Yates: `for i from n-1 down to 1 { j = random.nextInt(i + 1); swap(i, j) }`. No due cards → no session (the caught-up state). `total = min(due, cap)`.
   - **Course lesson review session (`lessonDeckId != null`, no live `state == "new"` cards remaining):** When a Course lesson still has at least one live card with `state == "new"` (`notStarted` or `inProgress`), the app starts a **Learn session (§3b)** instead of this Review session. When the lesson has zero live `new` cards (`completed` / `"Studied"`), take all live cards belonging to `deckId == lessonDeckId`. Let `pending` be cards in that lesson with `dueAt <= now`, sorted by `dueAt` ascending (ties: iOS by `createdAt`, then `id`; Android by `rowid`). If `pending` is non-empty, use all `pending` cards (uncapped by `Words per session`); if `pending` is empty (all cards in the lesson are already `state == "review"` with `dueAt > now`), use all cards of the lesson so the learner can re-study a completed lesson at any time. Shuffle the selected cards with Fisher–Yates, while passing all cards in the store as the distractor `pool`.
   - Deleted cards (removed when a user deletes a deck or when a sync pull applies a card tombstone) never enter the queue; if a sync pull deletes a card while a session is already running, the session skips that card.
2. **Prompt and response.** The card at the front gets a prompt (chosen by the
   Minigame rules in §4) when it reaches the front.
   Every game also offers "I don't remember". Result: an option equal to the
   answer → `correct`; typed text that matches → `correct`; "Remembered" →
   `correct`; "Forgot" / "I don't remember" → `forgot`; anything else →
   `wrong`.
3. **First result.** The first response for a card in this session applies
   `applyAnswer(card, result == correct, now)` to the card and persists it
   together with exactly one log row, immediately. Later responses for the
   same card in the same session write nothing (no card change, no log row).
4. **Wrong streak.** `correct` resets the streak to 0; `wrong`/`forgot` add 1.
   On reaching 5 the encouragement overlay is shown and the streak resets to 0.
   While the overlay is shown, `respond`, `reveal` and Continue are ignored;
   only dismissing it does anything. The overlay never changes the queue.
   Dismissing also performs Continue only when the current prompt is a
   `selfCheck` (its 240 ms timer was swallowed while the overlay was up). For
   every quiz game dismissing only closes the overlay: the feedback panel
   (correct answer, word, example) stays and waits for its own Continue.
5. **Feedback, then Continue.** A response puts the session into feedback.
   Continue is a no-op unless the session is in feedback (so a second
   Continue — timer, key or double tap — never advances twice). Continue:
   `correct` → the card leaves, `done += 1`;
   `forgot` → `forgotCount[card] += 1`; at 2 the card leaves and `done += 1`,
   otherwise it is re-queued (rule 6); `wrong` → re-queued.
   `selfCheck` skips the feedback screen in the UI (the answer is already
   visible): the view calls Continue 240 ms after the response, once per turn.
6. **Re-queue.** Remove the card from the front and insert it at index
   `min(4 + random.nextInt(2), rest.count)` of the remaining list (`4` and `5`
   are both possible).
7. **End.** The session ends when the queue is empty;
   `progress = done / total`.
8. **Summary.** `reviewed` = cards with a first result; `firstTryCorrect` =
   first results equal to `correct`; recall % =
   `round-half-away-from-zero(firstTryCorrect / reviewed × 100)` (nil when
   `reviewed == 0`); `levelUps` / `levelDowns` compare the level before and
   after each first result.


## 3b. Learn session (Course lessons)

1. **When used.** When the learner opens a Course lesson (`lessonDeckId != null`) in `notStarted` or `inProgress` state (the lesson has at least one live card with `state == "new"`). A `completed` (`"Studied"`) lesson opens a `ReviewSession` per §3. Personal and Community decks (`sourceLessonId == null`) always use §3.
2. **Card selection.** Take all live cards belonging to `deckId == lessonDeckId` with `state == "new"`.
   - Sort by `dueAt` ascending (ties: iOS by `createdAt`, then `id`; Android by `rowid`).
   - Uncapped by `Words per session` (`cap`).
   - The distractor `pool` is all live cards in the store.
3. **Per-word steps (`learnSteps`).** For each selected card, evaluate `E = eligibleKinds(card at level 1, pool)` per §4 and apply `learnSteps(E)`:
   - Always start with `"intro"`.
   - `listen`: `"listeningChoice"` if present in `E`, else `"meaningChoice"` if present in `E`, else omitted.
   - `produce`: `"typing"` if present in `E`, else `"wordChoice"` if present in `E`, else omitted.
   - Deterministic (no random choice of kind). Prompts (options and typing hints) are generated per §4 at level 1 when the step reaches the front of the queue.
4. **Queue.** For each selected `new` card in order (rule 2), append its steps (`"intro"`, then `listen` if present, then `produce` if present). `total` = initial step count; `progress = done / total`.
5. **Intro step (`intro`).** Displays the card's flashcard (front/back flip). Calling `reveal()` flips the card (`isRevealed` toggles) and latches `introRevealedOnce = true`. Continue is enabled and takes effect only after the card has been flipped at least once (`introRevealedOnce == true`). Continue removes the `intro` step from the front of the queue, increments `done += 1`, adds `max(0, now - stepShownAt)` to `durationMs[card]`, resets `isRevealed = false` and `introRevealedOnce = false`, increments `turn += 1`, and sets `stepShownAt = now`. No grading occurs on `intro`.
6. **Scored steps (`listeningChoice`, `meaningChoice`, `typing`, `wordChoice`).** Responses are scored as in §3 rule 2: option equal to answer → `correct`; typed text matching → `correct`; "I don't remember" → `forgot`; anything else → `wrong`.
   - The first response for each `(card, stepKind)` is recorded in `firstTry[stepKey]`: if any scored step's first response is not `correct`, `firstTryCorrect[card]` becomes `false` (starts `true`, including when a card has only `"intro"`). On that first response only (`firstTry[stepKey]` was unset), add `max(0, now - stepShownAt)` to `durationMs[card]` (feedback reading time and retry attempts do not add to `durationMs`).
   - A response puts the session into feedback; Continue is a no-op unless in feedback.
   - On Continue:
     - `correct` → the step leaves the front of the queue, `done += 1`;
     - `wrong` or `forgot` → the step is removed from the front and appended to the **end** of the queue, keeping its `kind` (options are freshly generated when it reaches the front again);
     - reset `feedback = null`, `isRevealed = false`, `introRevealedOnce = false`, increment `turn += 1`, and set `stepShownAt = now`.
7. **Word completion (`learned`).** Immediately when the last remaining step of a card leaves the queue (no steps for that card remain in the queue), commit that card:
   - `learned(card, now)` = `{ level: 1, isWarning: false, state: "review", intervalDays: 1, dueAt: now + DAY_MS, lapses: card.lapses }`.
   - Persist the updated card (`dirty = true`) together with **exactly one `ReviewLog` row**: `grade = "good"` if `firstTryCorrect[card]` is `true` (a word with no scored steps also logs `"good"`), else `"again"`; `intervalBefore = card.intervalDays` (`0` for new cards); `intervalAfter = 1`; `durationMs = durationMs[card]`; `dirty = true`.
8. **End and summary.** The session ends when the queue is empty. Summary displays:
   - `learnedCount` (labeled **"Learned"**), `goodCount` (first-try recall % = `round-half-away-from-zero(goodCount / learnedCount × 100)`), and elapsed time (the "Levels" tile is hidden);
   - the **learned words list** in commit order (`word`, `translation`), marking words whose committed grade is `again` with **"Missed first try"**;
   - a primary **"Back to course"** button (no "Keep going").
9. **Mid-session card deletion.** If a card is deleted while the session is running (via deck deletion or sync pull tombstone), all remaining steps of that card are removed from the queue and nothing is persisted for it, matching §3 rule 1.
10. **Not applicable in Learn.** The wrong-streak encouragement overlay (§3 rule 4), the two-forgot cap (§3 rule 5), and the offset 4–5 re-insertion (§3 rule 6) do not apply to Learn sessions.
## 4. Minigames

- **Kinds**, fixed order: `meaningChoice` (show word + IPA, pick the
  translation), `wordChoice` (show translation, pick the word),
  `listeningChoice` (play the recorded audio, pick the word), `typing` (show
  translation + hint, type the word), `selfCheck` (flip card, Forgot /
  Remembered). Every kind also offers "I don't remember" (= `forgot`), the
  only way out of a typing prompt the learner cannot answer.
- **Answer.** `meaningChoice` → the card's translation; every other kind →
  the card's word.
- **Distractors.** `meaningChoice` uses other cards' translations (any deck:
  translations are in the learner's language); `wordChoice` /
  `listeningChoice` use other cards' words **from decks with the same `lang`
  as the card's deck** (a Japanese word never gets Spanish options). Only live
  (non-deleted) cards are eligible as distractors. Exclude the card itself,
  blank texts, and any text whose normalized key equals the answer's (cards
  sharing a translation never appear as wrong options).
  Normalized keys (`normalizeAnswer` of word and translation) are computed
  once per session per candidate. Need `k = choiceOptionCount − 1 = 3`.
  Draw from the same-deck list first, then from the other-deck list, each
  with this partial Fisher–Yates draw (never a full shuffle):
  `i = 0; while collected < k && i < n { j = i + random.nextInt(n - i); swap(i, j); if key(list[i]) not in seen { seen.add; collect list[i] }; i += 1 }`.
  Options = answer + collected distractors, shuffled with Fisher–Yates. If
  both lists together do not offer `k` distinct distractors, use every
  distractor found (a prompt still has at least 2 options because eligibility
  requires ≥ 1 distractor).
  Option equality for scoring is exact string equality with the answer as
  displayed.
- **Eligibility.** `meaningChoice`, `wordChoice`: `level <= 4`, translation
  not blank, ≥ 1 distractor (for `wordChoice`: ≥ 1 same-language word). `listeningChoice`: `audioKey != nil`, ≥ 1 word
  distractor. `typing`: `typingEligible(word)` and translation not blank.
  `selfCheck`: used only when no other kind is eligible.
- **Choice (strict priority, never loops).** Let `E` = eligible kinds in the
  fixed order (without `selfCheck`). Try, in order, the first non-empty of:
  (a) `E` minus {this card's last kind in the session, the previous turn's
  kind}; (b) `E` minus {this card's last kind}; (c) `E`. If all are empty →
  `selfCheck`. Pick `candidates[random.nextInt(candidates.count)]`.
- The prompt is generated when the card reaches the front, using the card's
  current level (after any first result earlier in the session).

### 4.1 Typing rules

**`normalizeAnswer(text)`** — the typing comparison key, in this order:
Unicode NFC normalization (`normalize("NFC")` in JS,
`precomposedStringWithCanonicalMapping` in Swift,
`java.text.Normalizer.normalize(s, Normalizer.Form.NFC)` in Kotlin); replace
`’ ‘ ʼ` (U+2019, U+2018, U+02BC) with `'`; replace `– —` (U+2013, U+2014) with
`-`; trim; collapse every run of whitespace to one space; lowercase without a
locale (`toLowerCase()` in JS, `lowercased()` in Swift,
`lowercase(Locale.ROOT)` in Kotlin). Diacritics are significant: `cafe` does
not match `café`, `pho` does not match `phở`. Typed text matches iff
`normalizeAnswer(typed) == normalizeAnswer(word)` and the typed text is not
blank.

**`typingEligible(word)`** — `true` iff `normalizeAnswer(word)` is non-empty,
at most 30 Unicode code points, and matches
`^[\p{L}\p{M}]+([ '\-][\p{L}\p{M}]+)*$` (letters and combining marks
separated by single spaces, apostrophes or hyphens; use the `u` flag in JS).
Lengths are always counted in Unicode code points, never UTF-16 units.

**`typingHint(word, level)`** — built from `normalizeAnswer(word)` code point by
code point: level 1–2 → the first letter of every space-separated token is kept,
every other letter/mark becomes `_`; level 3–4 → every letter/mark becomes `_`;
level 5 → the empty string. Spaces, `'` and `-` are always kept as they are
(a hyphen does not start a new token).
Examples: `("ice cream", 1)` → `"i__ c____"`, `("ice-cream", 1)` →
`"i__-_____"`, `("o'clock", 3)` → `"_'_____"`.

**`choiceOptionCount`** — 4 options for every choice game at every level, in
Learn and Review alike.

## 5. Derived values

Computed from stored cards and the review log; never stored redundantly.

| Value | Definition |
|---|---|
| **Global review pool** | live cards (whose deck is not tombstoned) with `deck.sourceLessonId == null \|\| card.state == "review"` |
| **Due** (deck / total) | count of cards with `dueAt <= now` (global due count = global review pool ∩ `dueAt <= now`) |
| **Next review time (`nextDueAt`)** | `min(dueAt)` over the global review pool with `dueAt > now`; `null` when none exists. Invariant: non-empty global review pool and global `due == 0` ⇒ `nextDueAt != null`. |
| **Upcoming count (`upcomingCount`)** | count of global-review-pool cards with `nextDueAt <= dueAt < nextDueAt + upcomingWindowMs`, where `upcomingWindowMs = 3_600_000` (1 hour — same batch as the countdown). `0` when `nextDueAt == null`; `>= 1` when `nextDueAt != null` (UI clamps the display to `max(1, n)` so a non-atomic `nextDueAt` + count re-query on Android can never render "0 cards coming up"). |
| **Countdown label (`formatCountdown(ms)`)** | `s = ceil(ms / 1000)` (`0` when `ms <= 0`); `s < 3600` → `m:ss` (seconds 2-digit padded); `s < 86400` → `h:mm:ss` (minutes and seconds 2-digit padded); else → `{d}d {h}h` (`d = floor(s / 86400)`, `h = floor((s mod 86400) / 3600)`). |
| **Learned** | count of cards with `level >= 2` |
| **Mature** | count of cards with `level == 5` (flagged cards included, so the number does not flicker) |
| **Level distribution** | count of **studied** cards per level 1–5: live cards (deck not tombstoned) with `state == "review"` and `level` in 1–5. Cards with `state == "new"` (level 1, not yet studied) are excluded; flagged cards count at level 5 (like Mature). The Learned words page lists exactly this same set across its five level tabs, so each level's count always equals the count on the corresponding level tab of the Learned words page. |
| **Daily goal** | default **20** reviews per local day (user-adjustable; apps may keep it fixed at 20 initially) |
| **Streak** | number of consecutive **local calendar days** ending at today **or yesterday** that each have ≥ 1 logged review. If today has no review yet, the streak shown is the one ending yesterday (it stays alive until the local day ends); if neither today nor yesterday has a review, the streak is 0. Personal best = max streak ever. |
| **Summary streak state (`summaryStreakState(logs, sessionStart, now)`)** | In the local calendar day of `now`: if any log today has `reviewedAt < sessionStart` → `"alreadyCounted"`; else if any log today has `reviewedAt >= sessionStart` → `"claimed"`; else → `"none"`. Determines whether the session-complete summary celebrates a newly claimed streak with the animated fire badge (`"claimed"`) or shows the completion check badge with a static streak chip (`"alreadyCounted"` / `"none"`). |
| **Retention** | `(logs with grade != again) / total logs` over the selected range. `total == 0` → no value (UI shows an empty state, not 0%). |
| **Forecast (day d)** | count of cards with `dueAt` on local day `d`, for the next 7 days starting today; cards already overdue (day offset < 0) are not counted |


**`formatCountdown(ms)` vectors:**

| `ms` | `formatCountdown(ms)` |
|---|---|
| `1` | `0:01` |
| `59_000` | `0:59` |
| `60_000` | `1:00` |
| `3_599_000` | `59:59` |
| `3_599_001` | `1:00:00` |
| `3_600_000` | `1:00:00` |
| `8_073_000` | `2:14:33` |
| `86_399_000` | `23:59:59` |
| `86_400_000` | `1d 0h` |
| `280_800_000` | `3d 6h` |

**`summaryStreakState(logs, sessionStart, now)` vectors (local zone `Asia/Saigon`):**

| Prior logs (before `sessionStart`) | Session logs (`reviewedAt >= sessionStart`) | `sessionStart` (local) | `now` (local) | `summaryStreakState` | Post-session `streak` |
|---|---|---|---|---|---|
| *(none)* | `2026-03-15 10:02` | `2026-03-15 10:00` | `2026-03-15 10:05` | `"claimed"` | `1` |
| `2026-03-15 08:30` | `2026-03-15 10:02` | `2026-03-15 10:00` | `2026-03-15 10:05` | `"alreadyCounted"` | `1` |
| `2026-03-14 21:00` | `2026-03-15 09:10` | `2026-03-15 09:00` | `2026-03-15 09:15` | `"claimed"` | `2` |
| *(none)* | `2026-03-14 23:58`, `2026-03-15 00:02` | `2026-03-14 23:55` | `2026-03-15 00:03` | `"claimed"` | `2` |
| `2026-03-13 20:00` | `2026-03-14 23:58` | `2026-03-14 23:55` | `2026-03-15 00:02` | `"none"` | `2` |
| *(none)* | *(none)* | `2026-03-15 10:00` | `2026-03-15 10:05` | `"none"` | `0` |

**`upcomingCount` / `upcomingLabel(n)` vectors** (global review pool, `now < T`):

| Cards (all in the global review pool unless stated) | `nextDueAt` | `upcomingCount` | `upcomingLabel(n)` |
|---|---|---|---|
| card due at exactly `T` | `T` | 1 | `1 card coming up` |
| cards at `T`, `T + 3_599_999` | `T` | 2 | `2 cards coming up` |
| cards at `T`, `T + 3_600_000` (upper bound is exclusive) | `T` | 1 | `1 card coming up` |
| cards at `T − 1` (already due; `nextDueAt` moves past it) | `T + 10_000` | cards counted from the new `nextDueAt` window | — |
| card at `T` + a course-lesson card with `state == "new"` (not in the pool) | `T` | 1 | `1 card coming up` |
| card at `T` in a deck with a tombstone (not in the pool) | `null` | 0 | — |
| boundary race: `nextDueAt != null` but the count query returns 0 | `T` | render `1` | `1 card coming up` |

`upcomingLabel(n)`: `1` → `"1 card coming up"`, `5` → `"5 cards coming up"`. `upcomingCount` depends only on `nextDueAt` and card data — never on `now` — so it does not change while the countdown ticks; it changes only when card data changes (or `refreshDue()` re-derives it, together with `nextDueAt`).

The "words learned" growth chart still comes from the review log (the first
non-`again` grade per card, keyed by `cardId` so logs of deleted cards remain
distinct) and can differ from the Learned count. Deleting a deck removes its
cards from Due, Learned, Mature, Level distribution and Forecast, while keeping
all of its `ReviewLog` rows so Streak, Retention, Reviews and the Study
calendar keep their history.

**ReviewLog.** In a Review session (§3), write **exactly one log row per first
result** (later attempts for the same card in the same session write nothing; a
correct first result is logged as grade `good`, a wrong or forgotten one as
`again`, and `durationMs` is the milliseconds from the prompt appearing to the
first response). In a Learn session (§3b), write **exactly one log row per
completed word** when its last step leaves the queue (`good` if every scored
step was answered `correct` on its first attempt, `again` otherwise, and
`durationMs` is the sum of first-attempt response times across that word's
steps plus the `intro` step duration). Legacy grades `hard` and `easy` only
appear in logs written before v2 and still count as not-`again` for retention.
Streak, Daily goal, and Retention count Review and Learn log rows identically.

## 6. Interval labels — `formatInterval(minutes)`

Input is a duration in whole minutes (what the next-review hint displays).
Rules, in order, matching the design exactly:

| Condition | Output |
|---|---|
| `minutes < 60` | `Nm` — the exact integer, no rounding (e.g. `10m`) |
| `minutes / 1440 < 1` | `Nh` — `round(minutes / 60)` |
| `minutes / 1440 < 7` | `Nd` — `round(minutes / 1440)` |
| `minutes / 1440 < 30` | `Nw` — `round(minutes / (1440 × 7))` |
| `minutes / 1440 < 365` | `Nmo` — `round(minutes / (1440 × 30))` |
| else | `N.Ny` — `(minutes / 1440 / 365)` with **one decimal**, always shown (e.g. `1.0y`) |

Examples: `10 → "10m"`, `1440 → "1d"`, `10080 → "1w"` (7 d exactly: `d < 7` is
false, so weeks), `21600 → "2w"` (15 d: `d < 30`, so weeks — `round(2.14) = 2`),
`43200 → "1mo"` (30 d exactly: `d < 30` is false, months),
`52560 → "1mo"` (36.5 d rounds to 1 month), `525600 → "1.0y"`
(365 d exactly → years, one decimal).

## 7. Creation, seed and migration

New cards start with `level 1`, `isWarning false`, `state new`,
`intervalDays 0`.

The bundled seed `shared/seed/seed-data.json` ships **empty at version 2** —
`decks` and `cards` are `[]`, and the legacy `communityDecks` block (with its
fabricated metrics) is removed — so a fresh install seeds nothing and starts
without decks. Study content is not bundled with the app: it comes from the
course catalog imported through the Library screen (§7.4 in
`docs/design-guidelines.md`, contract in `docs/catalog-spec.md`).

First launch still runs the seeder once, guarded by a persisted `seedVersion`
so relaunches never duplicate data. On an install that still holds the
retired pre-catalog seed v1 content, that one run performs the v1→v2 cleanup:
the mock decks `es`, `ja`, `de`, `ielts` and `food` are deleted with all of
their cards, and the mock community "Added" flags `c1`–`c6` are removed.
User-created and catalog-imported decks, their cards and **all review logs**
are preserved. (If the seed file ever ships cards again, its review-state
cards get `dueAt: 0` replaced with the launch time so they are due
immediately; `state: "new"` cards are due immediately by definition.)

Catalog lessons added from the Community tab (see `docs/catalog-spec.md`)
create `new` cards with `dueAt = addedAtMs − (n − 1) + i` for the i-th of n
cards, not `0`, so previously overdue reviews keep sorting first (§3) while the
lesson keeps its order and is due immediately.

**Migration from the previous scheduler.** Existing cards keep their `dueAt`,
`lapses` and `intervalDays`; `learning` becomes `review`. The level is computed
from the state and interval **before** `learning` is converted, and no migrated
card is flagged:

| Previous state | Previous `intervalDays` | `level` |
|---|---|---|
| `new` | any | 1 |
| `learning` | any | 1 |
| `review` | ≥ 30 | 5 |
| `review` | 14 – 29 | 4 |
| `review` | 7 – 13 | 3 |
| `review` | 3 – 6 | 2 |
| `review` | < 3 | 1 |

## 8. Reference implementation

`shared/srs/generate-level-vectors.mjs` is the dependency-free JS reference of
this spec and the generator of `shared/srs/level-vectors.json`. Ports must
reproduce its outputs exactly. The file has these sections, each an array:
`answers` (answer math), `legacy` (migration mapping), `typing` (match
rule), `eligibility`, `hints`, `intervals` (interval labels),
`learnSteps` (§3b rule 3 step selection), `learnQueue` (§3b rules 4–7 queue and
commit simulation), and `learnCommit` (§3b rule 7 `learned(card, now)` math).
One example of each shape:

```json
{ "name": "level 4 + correct",
  "input": { "level": 4, "isWarning": false, "state": "review", "intervalDays": 0, "dueAt": 1700000000000, "lapses": 2 },
  "correct": true, "now": 1700000000000,
  "expected": { "level": 5, "isWarning": false, "state": "review", "intervalDays": 30, "dueAt": 1702592000000, "lapses": 2 } }
{ "state": "review", "intervalDays": 14, "expectedLevel": 4 }
{ "word": "café", "typed": "café", "match": true }
{ "word": "phở", "typingEligible": true }
{ "word": "ice cream", "level": 1, "hint": "i__ c____" }
{ "minutes": 10080, "label": "1w" }
{ "eligible": ["meaningChoice", "wordChoice", "typing"], "steps": ["intro", "meaningChoice", "typing"] }
{ "name": "all correct",
  "words": [{ "word": "w1", "steps": ["intro", "listeningChoice", "typing"] }],
  "actions": ["continue", "correct", "correct"],
  "expected": { "total": 3, "shown": ["w1:intro", "w1:listeningChoice", "w1:typing"], "done": [1, 2, 3], "commits": [{ "word": "w1", "grade": "good" }] } }
{ "name": "new card default",
  "input": { "level": 1, "isWarning": false, "state": "new", "intervalDays": 0, "dueAt": 1700000000000, "lapses": 0 },
  "now": 1700000000000,
  "expected": { "level": 1, "isWarning": false, "state": "review", "intervalDays": 1, "dueAt": 1700086400000, "lapses": 0 } }
```
