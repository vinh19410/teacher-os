import {
	createFileRoute,
	redirect,
	useNavigate,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BankLinkPanel } from "@/components/payments/bank-link-panel";
import {
	AvatarSection,
	type ProfileUser,
} from "@/components/profile/avatar-section";
import { GoogleLinkCard } from "@/components/profile/google-link-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/profile")({
	// Raw passthrough like the schedule route: better-auth appends
	// `?error=<code>` to errorCallbackURL and this maps it to a toast below.
	validateSearch: (search: Record<string, unknown>): { error?: string } => ({
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: ProfileRoute,
});

function oauthErrorMessage(code: string): string {
	if (code === "email_doesn't_match") {
		return "Email Google không khớp email của tài khoản hiện tại.";
	}
	if (code === "account_already_linked_to_different_user") {
		return "Tài khoản Google này đã liên kết với người dùng khác.";
	}
	return "Không thể kết nối Google. Vui lòng thử lại.";
}

function ProfileRoute() {
	const { session } = useRouteContext({ from: "/_auth" });
	const navigate = useNavigate();
	const { error: oauthError } = Route.useSearch();

	useEffect(() => {
		if (!oauthError) return;
		toast.error(oauthErrorMessage(oauthError));
		// URL path only — `_auth` is a pathless layout route, so "/profile"
		// is the registered path (a routeId like "/_auth/profile" 404s here).
		void navigate({ to: "/profile", search: {}, replace: true });
	}, [oauthError, navigate]);

	// Hard invariant shared with the sidebar/dashboard: inside _auth a session
	// must exist; a missing session means the guard chain is broken. Kept below
	// the hooks so hook order can never depend on session state.
	if (!session?.data?.user) {
		throw redirect({ to: "/login" });
	}
	const user = session.data.user;

	return (
		<div>
			<PageHead
				title="Hồ sơ"
				lead="Tên hiển thị, ảnh đại diện, liên kết Google và tài khoản ngân hàng nhận học phí qua mã QR tự đối soát."
			/>
			<div className="grid gap-5 max-lg:flex max-lg:flex-col lg:grid-cols-[1.4fr_1fr]">
				<div className="flex flex-col gap-5">
					<ProfileForm user={user} />
					<AvatarSection user={user} />
					<GoogleLinkCard />
				</div>
				<div className="self-start">
					<BankLinkPanel />
				</div>
			</div>
		</div>
	);
}

function ProfileForm({ user }: { user: ProfileUser }) {
	const router = useRouter();
	const [name, setName] = useState(user.name ?? "");
	const [saving, setSaving] = useState(false);

	// Stay in sync with the authoritative session: a rename from another tab
	// (or a session refresh after an avatar upload) must not get silently
	// overwritten here by an older draft.
	useEffect(() => {
		setName(user.name ?? "");
	}, [user.name]);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (saving) return;
		const trimmed = name.trim();
		if (trimmed.length < 2 || trimmed.length > 100) {
			toast.error("Tên hiển thị phải từ 2 đến 100 ký tự.");
			return;
		}
		setSaving(true);
		try {
			const { error } = await authClient.updateUser({ name: trimmed });
			// The better-auth client resolves with an error instead of throwing —
			// no success toast unless the update actually landed.
			if (error) {
				toast.error(
					error.message || error.statusText || "Không lưu được tên hiển thị.",
				);
				return;
			}
			toast.success("Đã cập nhật tên hiển thị");
			// Sidebar/dashboard read the session through the _auth route context —
			// invalidate re-runs its beforeLoad so they pick up the new name live.
			await router.invalidate();
		} finally {
			setSaving(false);
		}
	}

	return (
		<Card variant="white">
			<SectionLabel>Thông tin cá nhân</SectionLabel>
			<form noValidate onSubmit={submit} className="flex flex-col gap-4">
				<Field label="Tên hiển thị">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						data-testid="profile-name-input"
					/>
				</Field>
				<Field label="Email">
					<Input value={user.email} disabled className="opacity-60" />
				</Field>
				<Button
					variant="secondary"
					size="sm"
					type="submit"
					disabled={saving}
					className="self-start"
					data-testid="profile-name-submit"
				>
					{saving ? "Đang lưu…" : "Lưu thay đổi"}
				</Button>
			</form>
		</Card>
	);
}
