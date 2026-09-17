import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools as TanStackQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import NotFoundPage from "./components/not-found";
import { createKernelQueryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultPendingComponent: () => <Loader />,
	defaultNotFoundComponent: NotFoundPage,
	context: {},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

// Module scope: the QueryClient (and its cache) must survive re-renders.
const queryClient = createKernelQueryClient();

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
			{/* Production-excluded by the devtools package itself. */}
			<TanStackQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>,
	);
}
