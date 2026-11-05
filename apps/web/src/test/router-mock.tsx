/**
 * Minimal @tanstack/react-router stand-in for rendering route components in
 * unit tests. Use it from a test file as:
 *
 *   vi.mock("@tanstack/react-router", async () =>
 *     (await import("@/test/router-mock")).routerMock(),
 *   );
 *
 * and drive params/search through `routerState`; navigations land in
 * `routerState.navigate` (a vi.fn).
 */
import type { ReactNode } from "react";
import { vi } from "vitest";

export const routerState = {
	params: {} as Record<string, string>,
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	routeContext: {} as Record<string, unknown>,
};

export function resetRouterState() {
	routerState.params = {};
	routerState.search = {};
	routerState.navigate = vi.fn();
	routerState.routeContext = {};
}

function hrefFor(
	to: string,
	params?: Record<string, string>,
	search?: unknown,
): string {
	const path = to.replace(
		/\$(\w+)/g,
		(_, key: string) => params?.[key] ?? `$${key}`,
	);
	// Object search renders as a query string; a function (search updater)
	// clears it, which is what every current caller uses it for.
	if (!search || typeof search !== "object") return path;
	const query = new URLSearchParams(
		Object.entries(search as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => [k, String(v)]),
	).toString();
	return query ? `${path}?${query}` : path;
}

function Link({
	to,
	params,
	search,
	children,
	activeProps: _activeProps,
	...rest
}: {
	to: string;
	params?: Record<string, string>;
	search?: unknown;
	activeProps?: unknown;
	children?: ReactNode;
} & Record<string, unknown>) {
	return (
		<a href={hrefFor(to, params, search)} {...rest}>
			{children}
		</a>
	);
}

export function routerMock() {
	return {
		createFileRoute: () => (options: Record<string, unknown>) =>
			Object.assign(options, {
				options,
				useParams: () => routerState.params,
				useSearch: () => routerState.search,
				useNavigate: () => routerState.navigate,
				useRouteContext: () => routerState.routeContext,
			}),
		useNavigate: () => routerState.navigate,
		useParams: () => routerState.params,
		useSearch: () => routerState.search,
		useRouteContext: () => routerState.routeContext,
		useRouter: () => ({ invalidate: vi.fn(), navigate: routerState.navigate }),
		notFound: () => new Error("not-found"),
		redirect: (opts: unknown) => opts,
		isRedirect: (opts: unknown) =>
			Boolean(
				opts &&
					typeof opts === "object" &&
					("to" in opts || "isRedirect" in opts),
			),
		Link,
	};
}
