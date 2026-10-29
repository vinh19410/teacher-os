import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyVocabHref } from "@/lib/legacy-vocab-redirect";

export const Route = createFileRoute("/_auth/vocab/$")({
	beforeLoad: ({ location }) => {
		throw redirect({
			href: legacyVocabHref(location.pathname, location.searchStr),
			replace: true,
		});
	},
});
