import { Mail, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ResendInviteButton } from "@/components/students/pending-invite-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	useCancelInvitation,
	usePendingInvitations,
} from "@/lib/repos/invitations";

export interface PendingInvitationsListProps {
	onInviteClick?: () => void;
}

export function PendingInvitationsList({
	onInviteClick,
}: PendingInvitationsListProps) {
	const { data: invitations, isLoading, error } = usePendingInvitations();
	const cancelMutation = useCancelInvitation();

	const pendingInvites = (invitations ?? []).filter(
		(inv) => inv.status === "pending",
	);

	const handleCancel = async (id: string, email: string) => {
		try {
			await cancelMutation.mutateAsync(id);
			toast.success(`Đã thu hồi lời mời tới ${email}`);
		} catch (err: unknown) {
			const errorObj = err as { message?: string };
			toast.error(errorObj.message || "Không thể thu hồi lời mời.");
		}
	};

	if (isLoading) {
		return (
			<div className="flex min-h-[200px] items-center justify-center p-8 text-muted-foreground text-sm">
				Đang tải danh sách lời mời...
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-center text-danger text-sm">
				<p>Không thể tải danh sách lời mời.</p>
			</div>
		);
	}

	if (pendingInvites.length === 0) {
		return (
			<div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-border border-dashed bg-muted/30 p-8 text-center">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<Mail className="h-6 w-6" />
				</div>
				<div className="max-w-[360px]">
					<h3 className="font-semibold text-foreground text-sm">
						Chưa có lời mời nào đang chờ
					</h3>
					<p className="mt-1 text-muted-foreground text-xs">
						Gửi lời mời qua email để học viên nhận thông báo và tham gia vào tổ
						chức của bạn.
					</p>
				</div>
				{onInviteClick && (
					<Button
						variant="primary"
						size="sm"
						onClick={onInviteClick}
						className="mt-2"
					>
						<UserPlus className="h-4 w-4" />
						Mời học viên
					</Button>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted">
				<div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-border border-b bg-muted-raised px-4 py-3 font-semibold text-muted-foreground text-xs">
					<span>Email học viên</span>
					<span className="hidden sm:inline">Trạng thái</span>
					<span>Thao tác</span>
				</div>
				<ul className="divide-y divide-line">
					{pendingInvites.map((inv) => {
						const dateFormatted = new Date(inv.createdAt).toLocaleDateString(
							"vi-VN",
							{
								day: "2-digit",
								month: "2-digit",
								year: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							},
						);
						return (
							<li
								key={inv.id}
								className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 hover:bg-muted-raised/40"
							>
								<div className="flex flex-col">
									<span className="font-medium text-foreground text-sm">
										{inv.email}
									</span>
									<span className="text-muted-foreground text-xs">
										Đã gửi lúc {dateFormatted}
									</span>
								</div>

								<div>
									<Badge variant="warn" dot>
										Đang chờ chấp nhận
									</Badge>
								</div>

								<div className="flex flex-wrap items-center justify-end gap-2">
									<ResendInviteButton
										target={{
											kind: "invitation",
											invitationId: inv.id,
											email: inv.email,
										}}
										compact
									/>
									<Button
										variant="danger"
										size="sm"
										onClick={() => handleCancel(inv.id, inv.email)}
										disabled={cancelMutation.isPending}
									>
										<Trash2 className="h-3.5 w-3.5" />
										<span className="hidden sm:inline">Thu hồi</span>
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
