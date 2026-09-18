---
phase: 1
title: "validateSearch + controlled tab + Tabs a11y + tests"
status: completed
depends: []
files:
  - apps/web/src/routes/_auth/settings.tsx
  - apps/web/src/components/ui/tabs.tsx
  - apps/web/src/components/ui/tabs.test.tsx (new)
  - apps/web/src/routes/_auth/settings.test.tsx (update)
---

# Phase 1: Settings deep-link

## settings.tsx

```tsx
const SETTINGS_TAB_IDS = ["account", "templates", "rules", "data"] as const;
type SettingsTab = (typeof SETTINGS_TAB_IDS)[number];

export function validateSettingsSearch(
	search: Record<string, unknown>,
): { tab?: SettingsTab } {
	const tab = search.tab;
	return typeof tab === "string" &&
		(SETTINGS_TAB_IDS as readonly string[]).includes(tab)
		? { tab: tab as SettingsTab }
		: {};
}

export const Route = createFileRoute("/_auth/settings")({
	validateSearch: validateSettingsSearch,
	component: SettingsRoute,
});

function SettingsRoute() {
	const { session } = useRouteContext({ from: "/_auth" });
	const { tab } = Route.useSearch();
	const navigate = useNavigate();
	return (
		<SettingsPage
			session={session}
			tab={tab ?? "account"}
			onTabChange={(next) =>
				void navigate({
					to: "/settings",
					search: { tab: next },
					replace: true,
				})
			}
		/>
	);
}
```

`SettingsPage` bỏ `useState("account")` → props `{ session, tab = "account", onTabChange }`, `<Tabs active={tab} onChange={(id) => onTabChange?.(id)}>`.

## tabs.tsx

Container `role="tablist"`; button `role="tab"` + `aria-selected={t.id === active}`.

## Tests

- settings.test.tsx thêm:
  - `validateSettingsSearch({tab:"templates"})` → `{tab:"templates"}`; `({tab:"hax"})` → `{}`; `({})` → `{}`; `{tab:123}` → `{}`.
  - `<SettingsPage session tab="templates">` render textarea content (assert `{{student_name}}`, KHÔNG "Đang dùng"); `tab="data"` → có "liên hệ admin" (#174) không có "Đang dùng".
  - SettingsPage không truyền tab → account (giữ test cũ).
- tabs.test.tsx (mới): active=b → aria-selected true trên B/false trên A; role tablist + tab.

## Verification

```bash
cd apps/web
npx vitest run src/routes/_auth/settings.test.tsx src/components/ui/tabs.test.tsx
npx vitest run && npx tsc --noEmit
cd ../.. && pnpm exec biome check . (exit 0, không qua pipe)
```
