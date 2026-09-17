import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs } from "@/components/ui/tabs";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsRoute,
});

/**
 * Placeholder values for controls whose persistence isn't built yet (#167).
 * They stay visible so a teacher can read the current defaults; the controls
 * themselves are disabled until a kernel settings surface exists — never
 * render an editable-looking form that silently discards input.
 */
const DEFAULT_UNIT_PRICE = "400.000đ";
const DEFAULT_TPL_REMINDER =
	"Chào phụ huynh, mai ({{date}}) học viên {{student_name}} có buổi học lúc {{time}} hình thức {{mode}}. Link: {{zoom_link}}. Nhắc em chuẩn bị bài nhé ạ.";
const DEFAULT_TPL_DEBT =
	"Phụ huynh ơi, học phí gói của {{student_name}} còn nợ {{amount}}. Giáo viên gửi QR MoMo {{qr_link}}. Nhờ phụ huynh thanh toán giúp ạ.";
const DEFAULT_TPL_REPORT =
	"Tuần này {{student_name}} học {{sessions}} buổi, chuyên cần {{attendance}}. Band gần nhất: {{latest_band}}. Việc ở nhà: {{homework}}. Chi tiết: {{report_link}}";

function NotYetOpenNote() {
	return (
		<p className="text-muted-fg text-xs">
			Chưa mở — sẽ lưu khi tính năng ra mắt.
		</p>
	);
}

export function SettingsPage({
	session,
}: {
	session?: {
		data?: {
			user?: { name?: string | null; email?: string | null } | null;
		} | null;
	} | null;
}) {
	const [tab, setTab] = useState("account");

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
				onChange={setTab}
			/>

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
								Không giới hạn học viên · Zalo OA · Báo cáo phụ huynh · Xuất hóa
								đơn điện tử.
							</p>
							<Field label="Đơn giá mặc định / buổi">
								<Input
									value={DEFAULT_UNIT_PRICE}
									disabled
									className="opacity-60"
								/>
							</Field>
							<NotYetOpenNote />
							<div className="flex items-center gap-2 self-start">
								<Button variant="secondary" size="sm" disabled>
									Quản lý thanh toán
								</Button>
								<Badge variant="muted">Sắp ra mắt</Badge>
							</div>
						</div>
					</Card>
				</div>
			)}

			{tab === "templates" && <TemplatesTab />}
			{tab === "rules" && <RulesTab />}
			{tab === "data" && <DataTab />}
		</div>
	);
}

export function TemplatesTab() {
	return (
		<div className="flex flex-col gap-4">
			<Card variant="white">
				<SectionLabel>Mẫu nhắc lịch (T−24h)</SectionLabel>
				<Textarea
					value={DEFAULT_TPL_REMINDER}
					disabled
					className="min-h-25 opacity-60"
				/>
			</Card>
			<Card variant="white">
				<SectionLabel>Mẫu nhắc nợ (quá hạn 3 ngày)</SectionLabel>
				<Textarea
					value={DEFAULT_TPL_DEBT}
					disabled
					className="min-h-25 opacity-60"
				/>
			</Card>
			<Card variant="white">
				<SectionLabel>Mẫu báo cáo tuần</SectionLabel>
				<Textarea
					value={DEFAULT_TPL_REPORT}
					disabled
					className="min-h-25 opacity-60"
				/>
			</Card>
			<NotYetOpenNote />
		</div>
	);
}

export function RulesTab() {
	return (
		<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
			<Card variant="white">
				<SectionLabel>Quy tắc vắng học</SectionLabel>
				<div className="flex flex-col gap-4">
					<Field label="Vắng có phép — báo trước">
						<Select disabled className="opacity-60">
							<option>2 giờ trước buổi học</option>
							<option>24 giờ trước</option>
						</Select>
					</Field>
					<Field label="Vắng không phép — trừ buổi?">
						<Select disabled className="opacity-60">
							<option>Có, trừ 1 buổi</option>
							<option>Không trừ</option>
						</Select>
					</Field>
					<Field label="Số buổi vắng tối đa trước nhắc rủi ro">
						<Input type="number" value="2" disabled className="opacity-60" />
					</Field>
				</div>
			</Card>
			<Card variant="white">
				<SectionLabel>Quy tắc nhắc nhở</SectionLabel>
				<div className="flex flex-col gap-4">
					<Field label="Nhắc lịch trước buổi">
						<Select disabled className="opacity-60">
							<option>T−24h và T−1h</option>
							<option>Chỉ T−24h</option>
						</Select>
					</Field>
					<Field label="Nhắc nợ quá hạn">
						<Select disabled className="opacity-60">
							<option>Sau 3 ngày và 7 ngày</option>
							<option>Sau 7 ngày</option>
						</Select>
					</Field>
					<Field label="Nhắc sắp hết gói">
						<Select disabled className="opacity-60">
							<option>Khi còn 3 buổi</option>
							<option>Khi còn 2 buổi</option>
						</Select>
					</Field>
					<Field label="Kênh ưu tiên">
						<Select disabled className="opacity-60">
							<option>Zalo trước, email dự phòng</option>
							<option>Chỉ Zalo</option>
						</Select>
					</Field>
				</div>
			</Card>
			<NotYetOpenNote />
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
					<Button
						variant="secondary"
						size="sm"
						className="border-danger-soft text-danger"
					>
						Xóa tài khoản
					</Button>
				</div>
			</div>
		</Card>
	);
}

function SettingsRoute() {
	const { session } = useRouteContext({ from: "/_auth" });
	return <SettingsPage session={session} />;
}
