import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { validateReturnUrl } from "@/lib/kernel-load-state";

function GoogleIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 18 18"
			aria-hidden="true"
			className="block h-[18px] w-[18px]"
		>
			<path
				fill="#4285F4"
				d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
			/>
			<path
				fill="#34A853"
				d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
			/>
			<path
				fill="#FBBC05"
				d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32z"
			/>
			<path
				fill="#EA4335"
				d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
			/>
		</svg>
	);
}

export default function GoogleOAuthButton() {
	const [isRedirecting, setIsRedirecting] = useState(false);
	const { returnUrl } = useSearch({ from: "/login" });

	const handleGoogleSignIn = async () => {
		setIsRedirecting(true);
		const { error } = await authClient.signIn.social({
			provider: "google",
			// Must be an absolute URL on a server trustedOrigin: the web app and
			// the API worker live on different origins. The return URL is
			// validated first so a crafted `?returnUrl=` cannot redirect the
			// OAuth callback to a foreign origin.
			callbackURL: `${window.location.origin}${validateReturnUrl(returnUrl)}`,
			// Role-mismatch rejections (plan #260) land back on /login, which
			// reads the ?error= params and toasts the message. No additionalData:
			// the server stamps the app into the OAuth state itself.
			errorCallbackURL: `${window.location.origin}/login`,
		});

		if (error) {
			setIsRedirecting(false);
			toast.error(error.message || error.statusText);
		}
	};

	return (
		<button
			type="button"
			disabled={isRedirecting}
			onClick={handleGoogleSignIn}
			className="mt-[26px] flex h-12 w-full items-center justify-center gap-[10px] rounded-[var(--radius-pill)] border border-line bg-bg font-[510] text-sm tracking-[0.02em] transition-[border-color,background,transform] duration-[150ms] hover:border-fg hover:bg-surface-warm focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
		>
			<GoogleIcon />
			{isRedirecting ? "Redirecting…" : "Continue with Google"}
		</button>
	);
}
