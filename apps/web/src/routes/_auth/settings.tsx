import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouteContext,
} from "@tanstack/react-router";
import type {
	WorkspaceSettings,
	WorkspaceSettingsUpdate,
} from "@teacher-os/api/contracts";
import { workspaceSettingsSchema } from "@teacher-os/api/contracts";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs } from "@/components/ui/tabs";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";
import {
	getApiBaseUrl,
	saveWorkspaceSettings,
	workspaceSettingsQueryKey,
	workspaceSettingsQueryOptions,
} from "@/lib/repos/settings";

const SETTINGS_TAB_IDS = ["account", "templates", "rules", "data"] as const;
export type SettingsTab = (typeof SETTINGS_TAB_IDS)[number];

/**
 * Issue #119: the active tab lives in the URL (`?tab=`) so reload and back
 * keep the position. Passthrough validation — an unknown or missing tab
 * never throws, it just falls back to the default (same pattern as
 * login/profile/schedule).
 */
export function validateSettingsSearch(search: Record<string, unknown>): {
	tab?: SettingsTab;
} {
	const tab = search.tab;
	return typeof tab === "string" &&
		(SETTINGS_TAB_IDS as readonly string[]).includes(tab)
		? { tab: tab as SettingsTab }
		: {};
}

export const Route = createFileRoute("/_auth/settings")({
	validateSearch: validateSettingsSearch,
	component: SettingsRoute,
});

export function SettingsPage({
	session,
	initialSettings,
	onSave,
	tab: controlledTab,
	onTabChange,
}: {
	session?: {
		data?: {
			user?: { name?: string | null; email?: string | null } | null;
		} | null;
	} | null;
	initialSettings?: WorkspaceSettings;
	onSave?: (settings: WorkspaceSettingsUpdate) => Promise<void>;
	/** Issue #119: when provided the active tab is URL-controlled. */
	tab?: string;
	onTabChange?: (tab: string) => void;
}) {
	const [internalTab, setInternalTab] = useState("account");
	const tab = controlledTab ?? internalTab;
	const [form, setForm] = useState<WorkspaceSettings>(
		() => initialSettings ?? workspaceSettingsSchema.parse({}),
	);
	const [saving, setSaving] = useState(false);
	const [savedTab, setSavedTab] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (initialSettings) {
			setForm(initialSettings);
		}
	}, [initialSettings]);

	const handleSave = async (
		tabName: string,
		update: WorkspaceSettingsUpdate,
	) => {
		if (!onSave) return;
		setSaving(true);
		setError(null);
		setSavedTab(null);
		try {
			await onSave(update);
			setSavedTab(tabName);
			setTimeout(() => setSavedTab(null), 3000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Lỗi lưu cài đặt");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			<PageHead
				title="Cài đặt"
				lead="Múi giờ VN · Tiền VND · Giao diện tiếng Việt."
			/>
			<Tabs
				tabs={[
					{ id: "account", label: "Tài khoản" },
					{ id: "templates", label: "Mẫu tin Zalo" },
					{ id: "rules", label: "Quy tắc" },
					{ id: "data", label: "Dữ liệu" },
				]}
				active={tab}
				onChange={(t) => {
					if (onTabChange) onTabChange(t);
					else setInternalTab(t);
					setError(null);
				}}
			/>

			{error && (
				<div className="mb-4 rounded-md bg-danger-bg p-3 text-danger text-sm">
					{error}
				</div>
			)}

			{tab === "account" && (
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Card variant="white">
						<SectionLabel>Tài khoản</SectionLabel>
						<div className="flex flex-col gap-4">
							<Field label="Họ tên">
								<Input value={session?.data?.user?.name ?? ""} disabled />
							</Field>
							<Field label="Email">
								<Input
									value={session?.data?.user?.email ?? ""}
									disabled
									className="opacity-60"
								/>
							</Field>
							<Link
								to="/profile"
								className="self-start px-2 font-medium text-accent-blue text-sm hover:text-accent-active focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							>
								Chỉnh sửa tại Hồ sơ →
							</Link>
						</div>
					</Card>
					<Card variant="white">
						<SectionLabel>Gói dịch vụ</SectionLabel>
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between">
								<div>
									<strong>Pro</strong>{" "}
									<Badge variant="accent" className="ml-1.5">
										Đang dùng
									</Badge>
								</div>
								<span className="font-mono text-meta text-xs">
									99.000đ/tháng
								</span>
							</div>
							<p className="text-muted-fg text-sm">
								{[
									"Không giới hạn học viên",
									"Zalo OA",
									...(PARENT_REPORTS_ENABLED ? ["Báo cáo phụ huynh"] : []),
									"Xuất hóa đơn điện tử.",
								].join(" · ")}
							</p>
							<Field label="Đơn giá mặc định / buổi">
								<Input
									value={form.defaultUnitPrice}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											defaultUnitPrice: e.target.value,
										}))
									}
								/>
							</Field>
							<div className="flex items-center gap-3">
								<Button
									variant="primary"
									size="sm"
									disabled={saving}
									onClick={() =>
										handleSave("account", {
											defaultUnitPrice: form.defaultUnitPrice,
										})
									}
								>
									{saving ? "Đang lưu..." : "Lưu đơn giá"}
								</Button>
								{savedTab === "account" && (
									<span className="font-medium text-accent-green text-xs">
										✓ Đã lưu đơn giá
									</span>
								)}
							</div>
							<div className="flex items-center gap-2 self-start pt-2">
								<Button variant="secondary" size="sm" disabled>
									Quản lý thanh toán
								</Button>
								<Badge variant="muted">Sắp ra mắt</Badge>
							</div>
						</div>
					</Card>
				</div>
			)}

			{tab === "templates" && (
				<TemplatesTab
					form={form}
					onChange={setForm}
					saving={saving}
					saved={savedTab === "templates"}
					onSave={() =>
						handleSave("templates", {
							tplReminder: form.tplReminder,
							tplDebt: form.tplDebt,
							tplReport: form.tplReport,
						})
					}
				/>
			)}
			{tab === "rules" && (
				<RulesTab
					form={form}
					onChange={setForm}
					saving={saving}
					saved={savedTab === "rules"}
					onSave={() =>
						handleSave("rules", {
							absenceNoticeHours: form.absenceNoticeHours,
							unexcusedDeduct: form.unexcusedDeduct,
							maxAbsencesBeforeAlert: form.maxAbsencesBeforeAlert,
							reminderSchedule: form.reminderSchedule,
							overdueDebtReminder: form.overdueDebtReminder,
							packageEndReminder: form.packageEndReminder,
							preferredChannel: form.preferredChannel,
						})
					}
				/>
			)}
			{tab === "data" && <DataTab />}
		</div>
	);
}

export function TemplatesTab({
	form,
	onChange,
	onSave,
	saving,
	saved,
}: {
	form?: WorkspaceSettings;
	onChange?: React.Dispatch<React.SetStateAction<WorkspaceSettings>>;
	onSave?: () => void;
	saving?: boolean;
	saved?: boolean;
}) {
	const current = form ?? workspaceSettingsSchema.parse({});
	return (
		<div className="flex flex-col gap-4">
			<Card variant="white">
				<SectionLabel>Mẫu nhắc lịch (T−24h)</SectionLabel>
				<Textarea
					value={current.tplReminder}
					onChange={(e) =>
						onChange?.((prev) => ({ ...prev, tplReminder: e.target.value }))
					}
					className="min-h-25"
				/>
			</Card>
			<Card variant="white">
				<SectionLabel>Mẫu nhắc nợ (quá hạn 3 ngày)</SectionLabel>
				<Textarea
					value={current.tplDebt}
					onChange={(e) =>
						onChange?.((prev) => ({ ...prev, tplDebt: e.target.value }))
					}
					className="min-h-25"
				/>
			</Card>
			{PARENT_REPORTS_ENABLED && (
				<Card variant="white">
					<SectionLabel>Mẫu báo cáo tuần</SectionLabel>
					<Textarea
						value={current.tplReport}
						onChange={(e) =>
							onChange?.((prev) => ({ ...prev, tplReport: e.target.value }))
						}
						className="min-h-25"
					/>
				</Card>
			)}
			{onSave && (
				<div className="flex items-center gap-3">
					<Button
						variant="primary"
						size="sm"
						disabled={saving}
						onClick={onSave}
					>
						{saving ? "Đang lưu..." : "Lưu mẫu tin"}
					</Button>
					{saved && (
						<span className="font-medium text-accent-green text-xs">
							✓ Đã lưu mẫu tin Zalo
						</span>
					)}
				</div>
			)}
		</div>
	);
}

export function RulesTab({
	form,
	onChange,
	onSave,
	saving,
	saved,
}: {
	form?: WorkspaceSettings;
	onChange?: React.Dispatch<React.SetStateAction<WorkspaceSettings>>;
	onSave?: () => void;
	saving?: boolean;
	saved?: boolean;
}) {
	const current = form ?? workspaceSettingsSchema.parse({});
	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
				<Card variant="white">
					<SectionLabel>Quy tắc vắng học</SectionLabel>
					<div className="flex flex-col gap-4">
						<Field label="Vắng có phép — báo trước">
							<Select
								value={current.absenceNoticeHours}
								onChange={(e) =>
									onChange?.((prev) => ({
										...prev,
										absenceNoticeHours: e.target.value,
									}))
								}
							>
								<option value="2 giờ trước buổi học">
									2 giờ trước buổi học
								</option>
								<option value="24 giờ trước">24 giờ trước</option>
							</Select>
						</Field>
						<Field label="Vắng không phép — trừ buổi?">
							<Select
								value={current.unexcusedDeduct}
								onChange={(e) =>
									onChange?.((prev) => ({
										...prev,
										unexcusedDeduct: e.target.value,
									}))
								}
							>
								<option value="Có, trừ 1 buổi">Có, trừ 1 buổi</option>
								<option value="Không trừ">Không trừ</option>
							</Select>
						</Field>
						<Field label="Số buổi vắng tối đa trước nhắc rủi ro">
							<Input
								type="number"
								value={current.maxAbsencesBeforeAlert}
								onChange={(e) =>
									onChange?.((prev) => ({
										...prev,
										maxAbsencesBeforeAlert: Number(e.target.value) || 0,
									}))
								}
							/>
						</Field>
					</div>
				</Card>
				<Card variant="white">
					<SectionLabel>Quy tắc nhắc nhở</SectionLabel>
					<div className="flex flex-col gap-4">
						<Field label="Nhắc lịch trước buổi">
							<Select
								value={current.reminderSchedule}
								onChange={(e) =>
									onChange?.((prev) => ({
										...prev,
										reminderSchedule: e.target.value,
									}))
								}
							>
								<option value="T−24h và T−1h">T−24h và T−1h</option>
								<option value="Chỉ T−24h">Chỉ T−24h</option>
							</Select>
						</Field>
						<Field label="Nhắc nợ quá hạn">
							<Select
								value={current.overdueDebtReminder}
								onChange={(e) =>
									onChange?.((prev) => ({
										...prev,
										overdueDebtReminder: e.target.value,
									}))
								}
							>
								<option value="Sau 3 ngày và 7 ngày">
									Sau 3 ngày và 7 ngày
								</option>
								<option value="Sau 7 ngày">Sau 7 ngày</option>
							</Select>
						</Field>
						<Field label="Nhắc sắp hết gói">
							<Select
								value={current.packageEndReminder}
								onChange={(e) =>
									onChange?.((prev) => ({
										...prev,
										packageEndReminder: e.target.value,
									}))
								}
							>
								<option value="Khi còn 3 buổi">Khi còn 3 buổi</option>
								<option value="Khi còn 2 buổi">Khi còn 2 buổi</option>
							</Select>
						</Field>
						<Field label="Kênh ưu tiên">
							<Select
								value={current.preferredChannel}
								onChange={(e) =>
									onChange?.((prev) => ({
										...prev,
										preferredChannel: e.target.value,
									}))
								}
							>
								<option value="Zalo trước, email dự phòng">
									Zalo trước, email dự phòng
								</option>
								<option value="Chỉ Zalo">Chỉ Zalo</option>
							</Select>
						</Field>
					</div>
				</Card>
			</div>
			{onSave && (
				<div className="flex items-center gap-3">
					<Button
						variant="primary"
						size="sm"
						disabled={saving}
						onClick={onSave}
					>
						{saving ? "Đang lưu..." : "Lưu quy tắc"}
					</Button>
					{saved && (
						<span className="font-medium text-accent-green text-xs">
							✓ Đã lưu quy tắc
						</span>
					)}
				</div>
			)}
		</div>
	);
}

export function DataTab() {
	return (
		<Card variant="white">
			<SectionLabel>Sao lưu và xuất dữ liệu</SectionLabel>
			<div className="flex flex-col gap-4">
				<p className="text-muted-fg text-sm">
					Toàn bộ dữ liệu thuộc về cô. Xuất bất cứ lúc nào, kể cả khi hủy gói.
				</p>
				<p className="text-muted-fg text-xs">
					Chưa mở — xuất file đang ra mắt.
				</p>
				<div className="flex flex-wrap gap-3">
					<Button variant="secondary" size="sm" disabled>
						Xuất CSV buổi học + thu tiền
					</Button>
					<Button variant="secondary" size="sm" disabled>
						Xuất toàn bộ (JSON)
					</Button>
				</div>
				<p className="text-muted-fg text-xs">
					Muốn xóa tài khoản? Giai đoạn pilot vui lòng liên hệ admin của bạn.
				</p>
			</div>
		</Card>
	);
}

function SettingsRoute() {
	const { session } = useRouteContext({ from: "/_auth" });
	const { tab } = Route.useSearch();
	const navigate = useNavigate();
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const { data: settings } = useQuery(workspaceSettingsQueryOptions(baseUrl));

	const handleSave = async (payload: WorkspaceSettingsUpdate) => {
		await saveWorkspaceSettings(baseUrl, payload);
		await queryClient.invalidateQueries({
			queryKey: workspaceSettingsQueryKey,
		});
	};

	return (
		<SettingsPage
			session={session}
			initialSettings={settings}
			onSave={handleSave}
			tab={tab ?? "account"}
			// replace: rapid tab switches must not flood browser history.
			onTabChange={(next) =>
				void navigate({
					to: "/settings",
					// Re-validate so the URL can only ever carry a whitelisted id.
					search: validateSettingsSearch({ tab: next }),
					replace: true,
				})
			}
		/>
	);
}
