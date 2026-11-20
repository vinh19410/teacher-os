import { createFileRoute } from "@tanstack/react-router";
import { resolvePostAuthRedirect } from "@teacher-os/auth/role";
import { useEffect } from "react";
import Loader from "@/components/loader";
import { authClient, getSessionUserRole } from "@/lib/auth-client";
import { redirectReplace } from "@/lib/navigation";

export const Route = createFileRoute("/")({
	validateSearch: (
		search: Record<string, unknown>,
	): { returnUrl?: string; error?: string; error_description?: string } => ({
		returnUrl:
			typeof search.returnUrl === "string" ? search.returnUrl : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
		error_description:
			typeof search.error_description === "string"
				? search.error_description
				: undefined,
	}),
	component: IndexRoute,
});

function IndexRoute() {
	const navigate = Route.useNavigate();
	const { returnUrl, error, error_description } = Route.useSearch();
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (isPending) return;
		if (session?.user) {
			const role = getSessionUserRole(session);
			redirectReplace(resolvePostAuthRedirect(role, returnUrl));
			return;
		}
		void navigate({
			to: "/login",
			search: { returnUrl, error, error_description },
			replace: true,
		});
	}, [isPending, session, returnUrl, error, error_description, navigate]);

	return <Loader />;
}
