CREATE TABLE `workspace_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`default_unit_price` text DEFAULT '400.000đ' NOT NULL,
	`tpl_reminder` text DEFAULT 'Chào phụ huynh, mai ({{date}}) học viên {{student_name}} có buổi học lúc {{time}} hình thức {{mode}}. Link: {{zoom_link}}. Nhắc em chuẩn bị bài nhé ạ.' NOT NULL,
	`tpl_debt` text DEFAULT 'Phụ huynh ơi, học phí gói của {{student_name}} còn nợ {{amount}}. Giáo viên gửi QR MoMo {{qr_link}}. Nhờ phụ huynh thanh toán giúp ạ.' NOT NULL,
	`tpl_report` text DEFAULT 'Tuần này {{student_name}} học {{sessions}} buổi, chuyên cần {{attendance}}. Band gần nhất: {{latest_band}}. Việc ở nhà: {{homework}}. Chi tiết: {{report_link}}' NOT NULL,
	`absence_notice_hours` text DEFAULT '2 giờ trước buổi học' NOT NULL,
	`unexcused_deduct` text DEFAULT 'Có, trừ 1 buổi' NOT NULL,
	`max_absences_before_alert` integer DEFAULT 2 NOT NULL,
	`reminder_schedule` text DEFAULT 'T−24h và T−1h' NOT NULL,
	`overdue_debt_reminder` text DEFAULT 'Sau 3 ngày và 7 ngày' NOT NULL,
	`package_end_reminder` text DEFAULT 'Khi còn 3 buổi' NOT NULL,
	`preferred_channel` text DEFAULT 'Zalo trước, email dự phòng' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
