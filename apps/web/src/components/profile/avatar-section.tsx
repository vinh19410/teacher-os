import { useRouter } from "@tanstack/react-router";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { authClient } from "@/lib/auth-client";
import { fileToAvatarDataUrl, validateAvatarFile } from "@/lib/avatar-image";
import { initialsFromName } from "@/lib/initials";

export interface ProfileUser {
	name: string;
	email: string;
	image?: string | null;
}

export function AvatarSection({ user }: { user: ProfileUser }) {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const [saving, setSaving] = useState(false);

	async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Reset first so re-picking the same file fires change again.
		event.target.value = "";
		if (!file || saving) return;

		const invalid = validateAvatarFile(file);
		if (invalid) {
			toast.error(invalid);
			return;
		}
		setSaving(true);
		try {
			const dataUrl = await fileToAvatarDataUrl(file);
			const { error } = await authClient.updateUser({ image: dataUrl });
			// The better-auth client resolves with an error instead of throwing.
			if (error) {
				toast.error(
					error.message || error.statusText || "Không đổi được ảnh đại diện.",
				);
				return;
			}
			toast.success("Đã cập nhật ảnh đại diện");
			await router.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không đọc được tệp ảnh.",
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Card variant="white">
			<SectionLabel>Ảnh đại diện</SectionLabel>
			<div className="flex items-center gap-4">
				<Avatar
					text={initialsFromName(user.name)}
					src={user.image}
					size="lg"
					imgProps={{ "data-testid": "profile-avatar" }}
				/>
				<div className="flex flex-col items-start gap-2">
					<Button
						variant="secondary"
						size="sm"
						disabled={saving}
						onClick={() => inputRef.current?.click()}
						data-testid="avatar-change-btn"
					>
						{saving ? "Đang xử lý…" : "Đổi ảnh"}
					</Button>
					<input
						ref={inputRef}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="hidden"
						data-testid="avatar-input"
						onChange={onFileChange}
					/>
					<p className="text-muted-foreground text-xs">
						JPEG/PNG/WebP tối đa 10MB — hệ thống nén về ≤64KB trước khi lưu.
					</p>
				</div>
			</div>
		</Card>
	);
}
