import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	MCP_TOKEN_ERROR_CODES,
	MCP_TOKEN_MAX_ACTIVE,
	type McpTokenCreate,
	type McpTokenSummary,
} from "@teacher-os/api/mcp-token-contracts";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import {
	buildClaudeDesktopConfigJson,
	createMcpTokenRequest,
	McpTokenRequestError,
	mcpTokensQueryKey,
	mcpTokensQueryOptions,
	revokeMcpTokenRequest,
} from "@/lib/repos/mcp-tokens";

type ExpiryOption = "30" | "90" | "365" | "never";

function parseExpiryOption(
	value: ExpiryOption,
): McpTokenCreate["expiresInDays"] {
	if (value === "30") return 30;
	if (value === "90") return 90;
	if (value === "365") return 365;
	return null;
}

function formatDateVi(iso: string): string {
	return new Date(iso).toLocaleString("vi-VN", {
		dateStyle: "short",
		timeStyle: "short",
	});
}

function maskToken(tokenPrefix: string): string {
	return `${tokenPrefix}${"•".repeat(20)}`;
}

function isTokenExpired(token: McpTokenSummary, nowMs: number): boolean {
	if (!token.expiresAt) return false;
	return new Date(token.expiresAt).getTime() <= nowMs;
}

export function McpTokenCard() {
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const { data, isLoading, error, refetch } = useQuery(
		mcpTokensQueryOptions(baseUrl),
	);

	const [deviceName, setDeviceName] = useState("");
	const [expiry, setExpiry] = useState<ExpiryOption>("90");
	const [creating, setCreating] = useState(false);
	const [createdSecret, setCreatedSecret] = useState<{
		token: McpTokenSummary;
		rawToken: string;
	} | null>(null);
	const [revealed, setRevealed] = useState(false);
	const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [liveStatus, setLiveStatus] = useState("");

	const tokens = data?.tokens ?? [];
	const maxActive = data?.maxActiveTokens ?? MCP_TOKEN_MAX_ACTIVE;
	const nowMs = Date.now();
	const activeCount = useMemo(
		() =>
			tokens.filter((item) => !item.revokedAt && !isTokenExpired(item, nowMs))
				.length,
		[tokens, nowMs],
	);
	const atLimit = activeCount >= maxActive;

	async function handleCreate(event: FormEvent) {
		event.preventDefault();
		if (creating || atLimit) return;
		const trimmed = deviceName.trim();
		if (!trimmed || trimmed.length > 80) {
			toast.error("Tên thiết bị phải từ 1 đến 80 ký tự.");
			return;
		}
		setCreating(true);
		try {
			const res = await createMcpTokenRequest(
				{
					name: trimmed,
					expiresInDays: parseExpiryOption(expiry),
				},
				baseUrl,
			);
			setCreatedSecret(res);
			setRevealed(false);
			setDeviceName("");
			setLiveStatus(`Đã tạo mã kết nối ${res.token.name}.`);
			toast.success("Đã tạo mã kết nối Claude Desktop");
			await queryClient.invalidateQueries({ queryKey: mcpTokensQueryKey });
		} catch (err) {
			if (
				err instanceof McpTokenRequestError &&
				err.code === MCP_TOKEN_ERROR_CODES.LIMIT_REACHED
			) {
				toast.error(
					`Đã đạt tối đa ${maxActive} mã đang hoạt động. Hãy thu hồi bớt mã cũ trước khi tạo thêm.`,
				);
			} else {
				toast.error("Không tạo được mã kết nối. Vui lòng thử lại.");
			}
		} finally {
			setCreating(false);
		}
	}

	async function handleRevoke(tokenId: string) {
		if (revokingId) return;
		setRevokingId(tokenId);
		try {
			await revokeMcpTokenRequest(tokenId, baseUrl);
			setConfirmRevokeId(null);
			if (createdSecret?.token.id === tokenId) {
				setCreatedSecret(null);
			}
			setLiveStatus("Đã thu hồi mã kết nối.");
			toast.success("Đã thu hồi mã kết nối");
			await queryClient.invalidateQueries({ queryKey: mcpTokensQueryKey });
		} catch {
			toast.error("Không thu hồi được mã kết nối. Vui lòng thử lại.");
		} finally {
			setRevokingId(null);
		}
	}

	async function copyText(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			setLiveStatus(`Đã sao chép ${label}.`);
			toast.success(`Đã sao chép ${label}`);
		} catch {
			toast.error("Trình duyệt không cho phép sao chép tự động.");
		}
	}

	const displayedToken = createdSecret
		? revealed
			? createdSecret.rawToken
			: maskToken(createdSecret.token.tokenPrefix)
		: "";
	const displayedConfigJson = createdSecret
		? buildClaudeDesktopConfigJson(baseUrl, displayedToken)
		: "";
	const realConfigJson = createdSecret
		? buildClaudeDesktopConfigJson(baseUrl, createdSecret.rawToken)
		: "";

	return (
		<Card variant="white" className="flex min-w-0 flex-col gap-4">
			<div>
				<div className="mb-1 flex flex-wrap items-center justify-between gap-2">
					<span className="font-medium text-primary text-sm">
						Claude Desktop (MCP)
					</span>
					<Badge variant="outline">
						{activeCount}/{maxActive} mã
					</Badge>
				</div>
				<SectionLabel>Kết nối Claude Desktop (MCP)</SectionLabel>
				<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
					Tạo mã truy cập cá nhân để soạn đề 6 kỹ năng vào Ngân hàng đề và ghép
					Full Test trực tiếp từ Claude Desktop.
				</p>
			</div>

			<div aria-live="polite" className="sr-only">
				{liveStatus}
			</div>

			<form
				noValidate
				onSubmit={handleCreate}
				className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
			>
				<div className="grid gap-3 sm:grid-cols-[1fr_140px]">
					<Field label="Tên thiết bị">
						<Input
							value={deviceName}
							onChange={(e) => setDeviceName(e.target.value)}
							maxLength={80}
							placeholder="VD: MacBook Cô Mỹ"
							data-testid="mcp-token-name-input"
						/>
					</Field>
					<Field label="Thời hạn">
						<Select
							value={expiry}
							onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
							data-testid="mcp-token-expiry-select"
						>
							<option value="30">30 ngày</option>
							<option value="90">90 ngày</option>
							<option value="365">1 năm</option>
							<option value="never">Không hết hạn</option>
						</Select>
					</Field>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<Button
						type="submit"
						size="sm"
						disabled={creating || atLimit}
						data-testid="mcp-token-create-btn"
					>
						{creating ? "Đang tạo…" : "Tạo mã kết nối"}
					</Button>
					{atLimit && (
						<span className="text-muted-foreground text-xs">
							Đã đạt giới hạn {maxActive} mã — hãy thu hồi bớt mã cũ.
						</span>
					)}
				</div>
			</form>

			{createdSecret && (
				<div
					className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3"
					data-testid="mcp-token-reveal-panel"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="font-semibold text-xs">
							Mã mới tạo (chỉ hiển thị một lần duy nhất)
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setRevealed((prev) => !prev)}
							data-testid="mcp-token-toggle-reveal"
						>
							{revealed ? "Ẩn mã" : "Hiện mã"}
						</Button>
					</div>

					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<code
							className="min-w-0 flex-1 overflow-x-auto rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs"
							data-testid="mcp-token-secret-value"
						>
							{displayedToken}
						</code>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void copyText(createdSecret.rawToken, "mã MCP")}
							data-testid="mcp-token-copy-raw"
						>
							Sao chép mã
						</Button>
					</div>

					<div className="flex min-w-0 flex-col gap-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="font-medium text-xs">
								Cấu hình <code>claude_desktop_config.json</code>
							</span>
							<Button
								variant="secondary"
								size="sm"
								onClick={() =>
									void copyText(realConfigJson, "cấu hình Claude Desktop")
								}
								data-testid="mcp-token-copy-json"
							>
								Sao chép cấu hình JSON
							</Button>
						</div>
						<pre
							className="w-full max-w-full overflow-x-auto rounded-md border border-input bg-background p-2.5 font-mono text-[11px] leading-relaxed"
							data-testid="mcp-token-config-preview"
						>
							{displayedConfigJson}
						</pre>
					</div>

					<ol className="list-decimal space-y-1 pl-4 text-muted-foreground text-xs leading-relaxed">
						<li>
							Cài sẵn Node.js ≥ 20 trên máy, rồi mở{" "}
							<strong>Claude → Settings → Developer → Edit Config</strong>{" "}
							(macOS:{" "}
							<code className="break-all">
								~/Library/Application Support/Claude/claude_desktop_config.json
							</code>
							; Windows:{" "}
							<code className="break-all">
								%APPDATA%\Claude\claude_desktop_config.json
							</code>
							).
						</li>
						<li>Dán đoạn cấu hình JSON vừa sao chép ở trên và lưu lại.</li>
						<li>
							Khởi động lại Claude Desktop rồi thử prompt tạo bài tập IELTS.
						</li>
					</ol>

					<Button
						variant="outline"
						size="sm"
						className="self-start"
						onClick={() => {
							setCreatedSecret(null);
							setRevealed(false);
						}}
						data-testid="mcp-token-dismiss-secret"
					>
						Đã lưu, đóng khung này
					</Button>
				</div>
			)}

			<div className="flex flex-col gap-2">
				<div className="font-medium text-muted-foreground text-xs">
					Mã đang lưu ({tokens.length})
				</div>
				{isLoading ? (
					<p className="text-muted-foreground text-xs">Đang tải danh sách…</p>
				) : error ? (
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-destructive text-xs">
							Không tải được danh sách mã kết nối.
						</p>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => void refetch()}
						>
							Thử lại
						</Button>
					</div>
				) : tokens.length === 0 ? (
					<p className="text-muted-foreground text-xs">
						Chưa có mã kết nối nào. Tạo mã đầu tiên để kết nối Claude Desktop.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{tokens.map((item) => {
							const expired = isTokenExpired(item, nowMs);
							const confirming = confirmRevokeId === item.id;
							return (
								<li
									key={item.id}
									className="flex flex-col gap-2 rounded-lg border border-border p-3"
									data-testid={`mcp-token-item-${item.id}`}
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="truncate font-semibold text-sm">
													{item.name}
												</span>
												<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
													{item.tokenPrefix}…
												</code>
												{expired && <Badge variant="warn">Đã hết hạn</Badge>}
											</div>
											<div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
												<span>Tạo: {formatDateVi(item.createdAt)}</span>
												<span>
													{item.lastUsedAt
														? `Dùng gần nhất: ${formatDateVi(item.lastUsedAt)}`
														: "Chưa dùng lần nào"}
												</span>
												<span>
													{item.expiresAt
														? `Hết hạn: ${formatDateVi(item.expiresAt)}`
														: "Không hết hạn"}
												</span>
											</div>
										</div>
										{!confirming ? (
											<Button
												variant="outline"
												size="sm"
												onClick={() => setConfirmRevokeId(item.id)}
												data-testid={`mcp-token-revoke-${item.id}`}
											>
												Thu hồi
											</Button>
										) : (
											<div className="flex items-center gap-1.5">
												<Button
													variant="destructive"
													size="sm"
													disabled={revokingId === item.id}
													onClick={() => void handleRevoke(item.id)}
													data-testid={`mcp-token-confirm-revoke-${item.id}`}
												>
													{revokingId === item.id
														? "Đang thu hồi…"
														: "Xác nhận thu hồi"}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={revokingId === item.id}
													onClick={() => setConfirmRevokeId(null)}
												>
													Huỷ
												</Button>
											</div>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</Card>
	);
}
