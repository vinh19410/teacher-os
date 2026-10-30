# Sign up and open dashboard

Sign-up lets a new teacher create an email/password account from the login page, land on the org-scoped dashboard after bootstrap, and see the teaching navigation shell.

## Sub-features

- `signup-open` opens the Create account tab on `/login`.
- `signup-submit` creates the account and redirects to `/dashboard`.
- `signup-shell` shows teacher nav (`Lớp học`, `Lịch dạy`) proving kernel bootstrap succeeded.

## How to get to it (user POV)

- Open `http://localhost:8101/login` (or the active `VERIFY_WEB_URL`) while signed out; the default tab is Create account.
- Choose the `Create account` tab if Sign in is selected.

## Driving it with verify-teacher-os

Preconditions:

- Stack is healthy (`doctor.sh` → `HEALTHY`) at the launched web URL.
- No session cookies yet in the browser context.
- Disposable DB is the one from this launch (`apps/e2e/local.db`).

- **Open sign-up.** Go to `/login`. Run `node .cursor/skills/verify-teacher-os/scripts/drive.mjs signup`. The page exposes `#su-name`, `#su-email`, `#su-password` and a button named `Create account`.
- **Submit.** The helper fills name/email/password and clicks `Create account`. Within 30s the URL matches `/dashboard`.
- **Confirm shell.** A link named `Lớp học` is visible in the sidebar (kernel snapshot loaded). Evidence is written under `evidence/signup/` (`dashboard.png`, `dashboard.aria.txt`, `result.json` with the email used).
- **Proof.** Open `evidence/signup/dashboard.png` and the ARIA snapshot: product shell visible, URL is dashboard, `result.json` contains the generated `@test.local` email.

## Gotchas

- Cold Vite on first boot can push the redirect past a 5s timeout — waits must allow up to 30s for `/dashboard`.
- Using `127.0.0.1` instead of `localhost` breaks auth/CORS even if the page loads.
- Google OAuth is not part of this verification path (e2e boot uses dummy Google credentials).
- A second `signup` in the same DB creates another teacher/org; that is fine, but do not assume a single-tenant DB.
