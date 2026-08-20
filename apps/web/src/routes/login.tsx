import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/login")({
	// Raw passthrough: the consumers validate before use (validateReturnUrl)
	// so an attacker-supplied `?returnUrl=` can never become an open redirect.
	validateSearch: (
		search: Record<string, unknown>,
	): { returnUrl?: string } => ({
		returnUrl:
			typeof search.returnUrl === "string" ? search.returnUrl : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const [showSignIn, setShowSignIn] = useState(false);

	return showSignIn ? (
		<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
	) : (
		<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
	);
}
