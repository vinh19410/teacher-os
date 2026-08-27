# Research: better-auth capabilities for Profile Management Page

Date: 2026-08-27
Installed version: **better-auth 1.6.27** (pnpm catalog, `pnpm-workspace.yaml` line 15; resolved in `pnpm-lock.yaml` as `better-auth@1.6.27`)
Repo auth config: `/Users/vinhtran/Documents/project/personal/teacher-os/packages/auth/src/index.ts` — `betterAuth()` with drizzleAdapter(sqlite), `trustedOrigins: [corsOrigin]`, `socialProviders.google`, `emailAndPassword.enabled`, no `account.*` config, no `session.cookieCache`.
Client: `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/lib/auth-client.ts` — `createAuthClient` from `better-auth/react`, `baseURL = <server>/api/auth`, no plugins.

Method: verified against BOTH the official docs (better-auth.com) AND the installed 1.6.27 source in `node_modules/.pnpm/better-auth@1.6.27_*/node_modules/better-auth/dist/`. Where docs and source disagree, source wins (noted).

Confidence legend:
- **source-verified** = read directly in installed 1.6.27 dist code
- **docs-verified** = confirmed on better-auth.com docs
- **inferred** = reasonable conclusion from above, not directly stated

---

## 1. updateUser — change name / avatar

Client call:
```ts
await authClient.updateUser({
  name: "New Name",
  image: "https://example.com/avatar.jpg", // or a data:/blob: URL, see below
});
```
Server route: `POST /api/auth/update-user` (operationId `updateUser`). Server-side equivalent: `auth.api.updateUser({ body: { name, image }, headers })`.

Source behavior (1.6.27, `dist/api/routes/update-user.mjs`):
- Body schema is `z.record(z.string(), z.any())` — **no zod validation on name/image types**.
- `email` in body → 400 `EMAIL_CAN_NOT_BE_UPDATED` (email changes go through `changeEmail`).
- If body contains no `name`, no `image`, and no plugin additional fields → 400 "No fields to update".
- Uses plain `sessionMiddleware` — **no password re-auth required** (unlike `deleteUser`/`changePassword` which use `sensitiveSessionMiddleware`).
- On success: persists via drizzle adapter, **re-issues the session cookie** with updated user, returns `{ status: true }` (does NOT return the user object — client refetches session instead, see §7).
- `image` accepts **any string** — data URLs, blob URLs, relative paths all pass through. No URL validation anywhere in the route (the `format: "uri"` appears only in OpenAPI metadata, not enforced). Docs likewise document no validation.
  - Practical implication: for avatar upload you can pass a `data:` URL directly, but D1 row + cookie size limits make storing large data URLs in the `user.image` column a bad idea. Upload to R2/KV and store the URL.
- Name has no length/format check either — add your own client-side validation.

Confidence: source-verified (all of the above); docs-verified (call signature, no validation documented). Doc: https://www.better-auth.com/docs/concepts/users-accounts

## 2. listAccounts — detect Google link

Client call:
```ts
const { data: accounts, error } = await authClient.listAccounts();
// accounts?.find((a) => a.providerId === "google") -> connected
```
Server route: `GET /api/auth/list-accounts` (session required; 401 otherwise).

Response shape (1.6.27, `dist/api/routes/account.mjs` + `parseAccountOutput`):
```ts
Array<{
  id: string;            // local account row id (used for unlink)
  userId: string;
  accountId: string;     // provider-side id (Google sub)
  providerId: string;    // "google" | "credential"
  scopes: string[];      // parsed from scope column
  createdAt: string;     // ISO date
  updatedAt: string;
}>
```
- Tokens (`accessToken`/`refreshToken`/`idToken`), expiries and `password` are **stripped** from the response (`parseAccountOutput` removes them).
- Note: the field is `providerId`, **not** `provider`. (The local skill reference `oauth-providers.md` shows `a.providerId === "github"` — consistent — but its `session.user.accounts` claim is wrong for 1.x, see below.)

Can you get providers from the session instead? **No.** `session.user` contains only user-table fields (id, name, email, image, emailVerified, createdAt, updatedAt + plugin fields). Accounts are not joined into the session; there is no built-in flag like `linkedProviders`. Options:
1. Call `listAccounts()` from the profile page (simple, recommended — one extra request).
2. Write a tiny custom plugin adding a session field (e.g. `session.user.accountProviders`) — more work, unnecessary for one page.
(There is a community `last-login-method` plugin, irrelevant here.)

Confidence: source-verified (shape + stripping); docs-verified (usage pattern `accounts?.find((a) => a.providerId === "google")`). Docs: https://www.better-auth.com/docs/concepts/users-accounts

## 3. linkSocial — connect Google from profile page

Client call:
```ts
const { data, error } = await authClient.linkSocial({
  provider: "google",
  callbackURL: "/profile",           // where to land after success
  errorCallbackURL: "/profile?linkError=1", // optional
  // disableRedirect: true,          // optional: get { url } back and redirect yourself (popup flows)
});
// default: browser is redirected to Google immediately (server sets Location header; response { url, redirect: true })
```
Server route: `POST /api/auth/link-social` (`requireHeaders: true`, session middleware). Full flow (1.6.27 source):
1. Client POSTs with session cookie → server generates OAuth `state` embedding `{ userId, email, link: true, callbackURL }` (state stored in DB — repo has a database, so `storeStateStrategy` defaults to `"database"`; PKCE codeVerifier included).
2. Server returns Google authorization URL (`redirectURI = <baseURL>/api/auth/callback/google`) + `Location` header; browser redirects to Google.
3. Google redirects to `GET /api/auth/callback/google?code=...&state=...`.
4. Callback validates state, exchanges code, decodes the Google ID token (`getUserInfo`: `id: sub, name, email, image: picture, emailVerified: email_verified`).
5. Link-mode checks (callback.mjs):
   - Provider must be in `trustedProviders` OR provider reports `emailVerified` → Google always passes (`email_verified: true` in ID token).
   - **Google email must equal the session user's email** unless `account.accountLinking.allowDifferentEmails === true` → else redirect with error `email_doesn't_match`.
   - If that Google identity is already linked to a DIFFERENT user → error `account_already_linked_to_different_user`.
   - If already linked to the SAME user → tokens refreshed, treated as success (idempotent; this is how re-consent for extra scopes works, needs >= 1.2.7).
6. Success: `createAccount({ userId: <same user>, providerId: "google", accountId: <sub>, accessToken, refreshToken, idToken, scope })` → **new row in the `account` table for the same `userId`** (merge confirmed — no new user row, no new session). Then `applyUpdateUserInfoOnLink` (no-op unless `updateUserInfoOnLink: true`) and redirect to `callbackURL`.

**Credential/password requirement: NO (in 1.6.27).** Verified by full source read of `link-social` route and callback link branch — there is no credential-account or password check. (Historical note: very old better-auth versions (<1.0) required a credential; some old tutorials still claim this. Old docs URL `/docs/guides/oauth-account-linking` now 404s — content moved to `/docs/concepts/users-accounts` + `/docs/concepts/oauth`.)
- Google-only users (signed in via Google): `linkSocial({ provider: "google" })` is idempotent success (account already exists); they would never see an "unauthorized" error for their own provider.
- Credential users (signed in with email/password): link works fine — no password prompt.
- Only auth requirement: a valid session (401 `UNAUTHORIZED` without one).

**callbackURL constraint: must be a trusted origin OR a relative path.** `originCheckMiddleware` (applied to all non-GET routes) validates `callbackURL`/`errorCallbackURL` against `isTrustedOrigin(url, { allowRelativePaths: true })`. Trusted origins = baseURL origin + `trustedOrigins` config. In this repo: server baseURL origin + `corsOrigin` (the web app). So `callbackURL: "/profile"` (relative) or an absolute URL on the web origin both work; anything else → 403 `INVALID_CALLBACK_URL` ("Invalid callbackURL"). Docs: https://www.better-auth.com/docs/reference/options (trustedOrigins) and error reference `invalid_callback_url`.

Confidence: source-verified (route body schema, callback branch, origin checks, no credential check); docs-verified (call shape, scopes re-link, 1.2.7 note). Docs: https://www.better-auth.com/docs/concepts/oauth , https://www.better-auth.com/docs/concepts/users-accounts

## 4. Automatic account linking on sign-in (implicit linking)

Default behavior (1.6.27 `dist/oauth2/link-account.mjs`, `handleOAuthUserInfo`): a credential user signing in with Google using the same email gets auto-linked **only if all pass**:
- Provider is in `account.accountLinking.trustedProviders` OR provider says email verified → Google passes (ID token `email_verified: true`).
- `account.accountLinking.enabled !== false` (default **true**).
- `account.accountLinking.disableImplicitLinking !== true` (default **false**).
- **`requireLocalEmailVerified` defaults to `true`** (source: `accountLinking?.requireLocalEmailVerified ?? true`): the LOCAL user row must already have `emailVerified: true`, otherwise linking is refused with error `account not linked` (redirect error code `account_not_linked`). This blocks the pre-register takeover vector. Type docs in the installed package mark it `@deprecated — will become unconditional` next minor. **The public options reference page does not document this flag** — docs-vs-source gap.
  - Repo impact: no `emailVerification` is configured, so credential signups have `emailVerified=false` → **same-email Google sign-in will NOT auto-link; it errors with `account_not_linked`** and redirects to the error URL. The user must use the explicit "Connect Google" button (`linkSocial`) instead — which is exactly the feature being planned. Good news: explicit `linkSocial` is NOT subject to `requireLocalEmailVerified` (callback link branch doesn't check it).
- `allowDifferentEmails` default **false** (also guards implicit linking to different-email rows; warning: enabling risks account takeover).
- On successful implicit link: if provider email is verified and local isn't (and emails match), local `emailVerified` is upgraded to `true`.

Other defaults: `trustedProviders` — no documented default; at runtime `getTrustedProviders()` returns **`[]` when unconfigured** (verified `dist/context/helpers.mjs`); Google still links because it always reports verified email. `updateAccountOnSignIn` default **true** (account tokens refreshed each sign-in — account row only). `updateUserInfoOnLink` default **false**.

Confidence: source-verified (all defaults read from code + installed type docs); docs-verified for enabled/disableImplicitLinking/updateUserInfoOnLink defaults. Docs: https://www.better-auth.com/docs/concepts/users-accounts , https://www.better-auth.com/docs/reference/options

## 5. Security notes for linkSocial / this feature

- **CSRF/origin**: every non-GET route (incl. `/link-social`, `/update-user`) runs `validateOrigin` — requests with cookies must carry an `Origin`/`Referer` matching trustedOrigins, else 403 `INVALID_ORIGIN`. The browser client sends Origin automatically; this repo's `trustedOrigins: [corsOrigin]` is required for the profile page to work cross-origin (already set).
- **callbackURL allow-list**: see §3 — 403 `INVALID_CALLBACK_URL` for untrusted absolute URLs; relative paths always allowed.
- **OAuth state + PKCE**: state (with embedded userId/email + `link: true`) stored in DB; callback validates it; PKCE verifier bound into code exchange. Cross-site forced-linking is thereby prevented (attacker can't forge a link for a victim).
- **Email-match enforcement**: linking a Google identity whose email differs from session email → `email_doesn't_match` (unless the risky `allowDifferentEmails: true`).
- **One-provider-one-owner**: Google identity already owned by another user → `account_already_linked_to_different_user` (Google-side "already linked" surfaces as this).
- **unlinkAccount gotcha** (if you later add "Disconnect"): uses `freshSessionMiddleware` (session must be fresher than `session.freshAge`, default 24h — re-auth may be needed) and refuses to unlink the LAST remaining account (`FAILED_TO_UNLINK_LAST_ACCOUNT`) unless `allowUnlinkingAll: true`.
- Known gotchas: none version-specific found for 1.6.27 linking; historical issues (`Social account already linked` on scope re-consent) fixed in 1.2.7+. Keep `allowDifferentEmails` off. Local skill note about tightened security paths in recent releases (single-use tokens etc.) reviewed — none affect this flow.

Confidence: source-verified (origin/CSRF middleware, state handling, unlink constraints); docs-verified (1.2.7 note). Error-code reference: https://www.better-auth.com/docs/reference/errors (e.g. `account_already_linked_to_different_user`, `account_not_linked`, `email_doesn't_match`).

## 6. Google avatar behavior

On Google sign-up/sign-in, better-auth decodes the Google **ID token** and maps (source: `@better-auth/core/dist/social-providers/google.mjs` `getUserInfo`):
```ts
user: { id: user.sub, name: user.name, email: user.email,
        image: user.picture, emailVerified: user.email_verified }
```
- New user via Google → `user.image` = Google `picture` (source-verified).
- **Local avatar changes are NOT overwritten on later Google logins** (1.6.27): the user row is only rewritten on sign-in when `updateUserInfoOnLink === true` (default false) or the legacy `overrideUserInfoOnSignIn` provider option is set. Default sign-in path only refreshes the ACCOUNT row tokens (`updateAccountOnSignIn`, default true), never `user.image`/`user.name`. So a custom avatar survives re-login with Google.
- Caveat: Google's ID-token `picture` claim can be stale/lower-res; it's a `lh3.googleusercontent.com` URL — fine to hot-link.

Confidence: source-verified (mapping + update paths); docs-verified (updateUserInfoOnLink semantics "email/emailVerified never changed", default false).

## 7. Session shape on client; refetch after updateUser

`authClient.useSession()` (better-auth/react, nanostores-backed atom):
```ts
const { data: session, isPending, isRefetching, error, refetch } = authClient.useSession();
session?.user       // { id, name, email, image, emailVerified, createdAt, updatedAt } (+ plugin fields)
session?.session    // { id, userId, token, expiresAt, createdAt, updatedAt, ipAddress?, userAgent? }
```
(`token` present on server; the client session atom serves the same object via `/get-session`.)
- **Refetch after updateUser: YES.** 1.6.27 client `atomListeners` match `/update-user` → `broadcastSessionUpdate("updateUser")` → session atom refetches AND BroadcastChannel notifies other tabs. Also true for `/sign-in/email`, `/sign-up/email`, `/sign-out`, `/change-email`, `/change-password`, etc. (source: `dist/client/config.mjs`). So `useSession()` re-renders with new name/image automatically after `authClient.updateUser(...)`.
- After `linkSocial` the browser does a full page redirect; on remount `useSession` fetches fresh. `listAccounts` is NOT session-coupled — call it directly on the profile page (it is a plain fetch, no atom).
- Stale-cache caveat: `session.cookieCache` is disabled by default and is NOT enabled in this repo → every `useSession` mount/refetch hits `/get-session` (DB). No staleness issue for the profile page. (If cookieCache is ever enabled, pass `disableCookieCache` or rely on the updateUser broadcast.)
- `session` is `null` when logged out; 401 sets `data: null`.

Confidence: source-verified (atom listeners, session atom normalization, react hook wrapper); docs-verified (cookieCache default disabled, disableCookieCache). Docs: https://www.better-auth.com/docs/concepts/session-management

## 8. Plugins — is default enough?

- **Default is enough** for name/image update + Google link detection + linkSocial. All are core features; no plugin, no schema change, no new migration needed (uses existing `user` + `account` tables).
- `inferAdditionalFields` — only needed when you add custom fields via `user.additionalFields` server-side and want them typed on the client. Repo adds none → skip. (Doc: https://www.better-auth.com/docs/concepts/typescript)
- `customSession` plugin — only if you want extra data (e.g. provider list) injected into every session response; unnecessary for one page (use `listAccounts()`).
- Avatar upload itself is out of better-auth's scope — better-auth stores whatever string you give `image`. Pair with R2/KV presigned upload or a small server route, then `updateUser({ image: url })`. (Architecture decision for the planner, not better-auth.)

Confidence: docs-verified; inferred (R2 note).

---

## Key doc URLs
- Users & accounts (updateUser, listAccounts, linking): https://www.better-auth.com/docs/concepts/users-accounts
- OAuth (linkSocial/linkAccount, scopes, profile mapping): https://www.better-auth.com/docs/concepts/oauth
- Options reference (accountLinking, trustedOrigins): https://www.better-auth.com/docs/reference/options
- Session management (useSession, cookieCache): https://www.better-auth.com/docs/concepts/session-management
- TypeScript / inferAdditionalFields: https://www.better-auth.com/docs/concepts/typescript
- Google provider: https://www.better-auth.com/docs/authentication/google
- Error codes: https://www.better-auth.com/docs/reference/errors
- Note: old `/docs/guides/oauth-account-linking` and `/docs/api-reference/auth-client` URLs 404 (docs restructured).

## Discrepancies found (docs vs installed 1.6.27 source)
1. `requireLocalEmailVerified` (default `true`) exists in source + installed type docs, absent from public options reference — and it blocks implicit Google linking for unverified-local-email users (all credential signups in this repo).
2. Runtime default `trustedProviders` = `[]` when unconfigured (docs imply "trusted providers" concept without stating the empty default; Google unaffected due to verified email).
3. Local skill reference (`~/.agents/skills/ak-better-auth/references/oauth-providers.md`) claims `session.user.accounts` exists — **wrong for 1.x**; use `authClient.listAccounts()`. Same file's `unlinkAccount({ accountId })` matches source (also takes `providerId`).

## Unresolved questions (for planner)
- Avatar storage target (R2 vs KV vs data-URL-in-D1) — repo infra decision, outside better-auth.
- Whether to surface "Disconnect Google" (needs fresh session + last-account guard handling) — scope call.
- If product wants same-email Google sign-in to auto-link for credential users, options are: enable email verification flows, or set `account.accountLinking.requireLocalEmailVerified: false` (deprecated, takeover risk — not recommended).
