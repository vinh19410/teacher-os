import { createFileRoute } from "@tanstack/react-router";
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

function SettingsRoute() {
	const [tab, setTab] = useState("account");
	const [name, setName] = useState("Trần Mai Lan");
	const [phone, setPhone] = useState("0901 234 567");
	const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh (GMT+7)");
	const [unitPrice, setUnitPrice] = useState("400.000đ");

	const [tplReminder, setTplReminder] = useState(
		"Chào phụ huynh, mai ({{date}}) học viên {{student_name}} có buổi học lúc {{time}} hình thức {{mode}}. Link: {{zoom_link}}. Nhắc em chuẩn bị bài nhé ạ.",
	);
	const [tplDebt, setTplDebt] = useState(
		"Phụ huynh ơi, học phí gói của {{student_name}} còn nợ {{amount}}. Giáo viên gửi QR MoMo {{qr_link}}. Nhờ phụ huynh thanh toán giúp ạ.",
	);
	const [tplReport, setTplReport] = useState(
		"Tuần này {{student_name}} học {{sessions}} buổi, chuyên cần {{attendance}}. Band gần nhất: {{latest_band}}. Việc ở nhà: {{homework}}. Chi tiết: {{report_link}}",
	);

	const [absenceNotice, setAbsenceNotice] = useState("2 giờ trước buổi học");
	const [absenceDeduct, setAbsenceDeduct] = useState("Có, trừ 1 buổi");
	const [absenceMax, setAbsenceMax] = useState("2");
	const [remindSchedule, setRemindSchedule] = useState("T−24h và T−1h");
	const [remindDebt, setRemindDebt] = useState("Sau 3 ngày và 7 ngày");
	const [remindPkg, setRemindPkg] = useState("Khi còn 3 buổi");
	const [remindChannel, setRemindChannel] = useState(
		"Zalo trước, email dự phòng",
	);

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
						<SectionLabel>Thông tin giáo viên</SectionLabel>
						<div className="flex flex-col gap-4">
							<Field label="Họ tên">
								<Input value={name} onChange={(e) => setName(e.target.value)} />
							</Field>
							<Field label="Email (Google)">
								<Input
									value="lantran@gmail.com"
									disabled
									className="opacity-60"
								/>
							</Field>
							<Field label="SĐT / Zalo">
								<Input
									value={phone}
									onChange={(e) => setPhone(e.target.value)}
								/>
							</Field>
							<Field label="Múi giờ">
								<Select
									value={timezone}
									onChange={(e) => setTimezone(e.target.value)}
								>
									<option>Asia/Ho_Chi_Minh (GMT+7)</option>
								</Select>
							</Field>
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
									value={unitPrice}
									onChange={(e) => setUnitPrice(e.target.value)}
								/>
							</Field>
							<Button variant="secondary" size="sm" className="self-start">
								Quản lý thanh toán
							</Button>
						</div>
					</Card>
				</div>
			)}

			{tab === "templates" && (
				<div className="flex flex-col gap-4">
					<Card variant="white">
						<SectionLabel>Mẫu nhắc lịch (T−24h)</SectionLabel>
						<Textarea
							value={tplReminder}
							onChange={(e) => setTplReminder(e.target.value)}
							className="min-h-25"
						/>
					</Card>
					<Card variant="white">
						<SectionLabel>Mẫu nhắc nợ (quá hạn 3 ngày)</SectionLabel>
						<Textarea
							value={tplDebt}
							onChange={(e) => setTplDebt(e.target.value)}
							className="min-h-25"
						/>
					</Card>
					<Card variant="white">
						<SectionLabel>Mẫu báo cáo tuần</SectionLabel>
						<Textarea
							value={tplReport}
							onChange={(e) => setTplReport(e.target.value)}
							className="min-h-25"
						/>
					</Card>
				</div>
			)}

			{tab === "rules" && (
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Card variant="white">
						<SectionLabel>Quy tắc vắng học</SectionLabel>
						<div className="flex flex-col gap-4">
							<Field label="Vắng có phép — báo trước">
								<Select
									value={absenceNotice}
									onChange={(e) => setAbsenceNotice(e.target.value)}
								>
									<option>2 giờ trước buổi học</option>
									<option>24 giờ trước</option>
								</Select>
							</Field>
							<Field label="Vắng không phép — trừ buổi?">
								<Select
									value={absenceDeduct}
									onChange={(e) => setAbsenceDeduct(e.target.value)}
								>
									<option>Có, trừ 1 buổi</option>
									<option>Không trừ</option>
								</Select>
							</Field>
							<Field label="Số buổi vắng tối đa trước nhắc rủi ro">
								<Input
									type="number"
									value={absenceMax}
									onChange={(e) => setAbsenceMax(e.target.value)}
								/>
							</Field>
						</div>
					</Card>
					<Card variant="white">
						<SectionLabel>Quy tắc nhắc nhở</SectionLabel>
						<div className="flex flex-col gap-4">
							<Field label="Nhắc lịch trước buổi">
								<Select
									value={remindSchedule}
									onChange={(e) => setRemindSchedule(e.target.value)}
								>
									<option>T−24h và T−1h</option>
									<option>Chỉ T−24h</option>
								</Select>
							</Field>
							<Field label="Nhắc nợ quá hạn">
								<Select
									value={remindDebt}
									onChange={(e) => setRemindDebt(e.target.value)}
								>
									<option>Sau 3 ngày và 7 ngày</option>
									<option>Sau 7 ngày</option>
								</Select>
							</Field>
							<Field label="Nhắc sắp hết gói">
								<Select
									value={remindPkg}
									onChange={(e) => setRemindPkg(e.target.value)}
								>
									<option>Khi còn 3 buổi</option>
									<option>Khi còn 2 buổi</option>
								</Select>
							</Field>
							<Field label="Kênh ưu tiên">
								<Select
									value={remindChannel}
									onChange={(e) => setRemindChannel(e.target.value)}
								>
									<option>Zalo trước, email dự phòng</option>
									<option>Chỉ Zalo</option>
								</Select>
							</Field>
						</div>
					</Card>
				</div>
			)}

			{tab === "data" && (
				<Card variant="white">
					<SectionLabel>Sao lưu và xuất dữ liệu</SectionLabel>
					<div className="flex flex-col gap-4">
						<p className="text-muted-fg text-sm">
							Toàn bộ dữ liệu thuộc về cô. Xuất bất cứ lúc nào, kể cả khi hủy
							gói. Đây là bản demo — dữ liệu hiển thị là dữ liệu mẫu, chưa có
							xuất file thật.
						</p>
						<div className="flex flex-wrap gap-3">
							<Button variant="secondary" size="sm">
								Xuất CSV buổi học + thu tiền
							</Button>
							<Button variant="secondary" size="sm">
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
			)}
		</div>
	);
}
