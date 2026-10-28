/**
 * Seed state cho các TC gắn tag `(seed: tên)` trong Preconditions.
 * Mỗi hàm tạo tài khoản Giáo viên độc lập mới qua API (email ngẫu nhiên → không đụng dữ liệu cũ),
 * mở /dashboard để app tự bootstrap org, rồi tạo lớp có lịch qua API lớp (cùng contract
 * apps/e2e/specs/helpers-dated-class.ts). Chỉ dùng API → chạy được trên dev stack bất kỳ.
 *
 * Env: SELFOMY_ALIGNMENT_API (mặc định http://localhost:8000), SELFOMY_ALIGNMENT_BASE (origin web, trong playwright.config).
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { expect, type Page } from '@playwright/test';

const API = process.env.SELFOMY_ALIGNMENT_API ?? 'http://localhost:8000';
const WEB = process.env.SELFOMY_ALIGNMENT_BASE ?? 'http://localhost:8001';
const PASSWORD = 'password-8chars';
const STUDENT_NAMES = ['Nguyễn Minh Anh', 'Trần Hoàng Nam', 'Lê Thu Hà'];

/** File SQLite D1 của dev stack (alchemy dev). Đổi bằng SELFOMY_ALIGNMENT_DB nếu stack đặt chỗ khác. */
function devDbPath(): string {
  if (process.env.SELFOMY_ALIGNMENT_DB) return process.env.SELFOMY_ALIGNMENT_DB;
  const dir = path.resolve(__dirname, '../../../../packages/infra/.alchemy/local/d1/cloudflare-runtime-D1DatabaseObject');
  const file = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (!file) throw new Error(`seed: không thấy file D1 trong ${dir}`);
  return path.join(dir, file);
}

/** Chèn học viên thẳng vào org của giáo viên (cùng cách apps/e2e seedStudent; không có API tạo học viên). */
async function insertStudents(teacherEmail: string, names: string[]): Promise<string[]> {
  const client = createClient({ url: `file:${devDbPath()}` });
  await client.execute('PRAGMA busy_timeout = 5000;');
  try {
    const org = await client.execute({
      sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
            WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
      args: [teacherEmail],
    });
    const orgId = org.rows[0]?.id;
    if (!orgId) throw new Error(`seed: chưa có org cho ${teacherEmail}`);
    const ids: string[] = [];
    for (const name of names) {
      const id = crypto.randomUUID();
      const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      await client.execute({
        sql: `INSERT INTO student (id, org_id, name, phone, email, zalo, parent_name, parent_phone, onboarding_completed_at, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [id, String(orgId), name, '0901234567', `${slug}.${Date.now()}.${ids.length}@e2e.test`, '0901234567', '', '', null, Date.now()],
      });
      ids.push(id);
    }
    return ids;
  } finally {
    client.close();
  }
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam, lệch n ngày so với hôm nay. */
export function vnDate(offsetDays = 0): string {
  const ms = Date.now() + 7 * 3600_000 + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Thứ trong tuần, 0 = Thứ Hai (cùng quy ước vnWeekdayMon0 của apps/e2e). */
function weekdayMon0(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

async function signUpTeacher(page: Page): Promise<string> {
  const email = `sa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await page.request.post(`${API}/api/auth/sign-up/email`, {
    data: { name: 'Minh Tran', email, password: PASSWORD },
    headers: { 'Content-Type': 'application/json', Origin: WEB },
  });
  if (res.status() !== 200) {
    throw new Error(`seed: sign-up lỗi (${res.status()}): ${await res.text()}`);
  }
  // Org được bootstrap khi app mở lần đầu (signUpViaUi chờ /dashboard).
  // Phiên đăng nhập đôi khi chưa kịp nhận ngay → bị đẩy về /login; thử lại vài lần.
  for (let i = 0; i < 4; i += 1) {
    await page.goto(`${WEB}/dashboard`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    if (/\/dashboard/.test(page.url())) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  return email;
}

/** POST qua API, thử lại khi worker dev đang reload (502/503/ECONNREFUSED). */
async function post(page: Page, url: string, data: unknown) {
  let last: Error | undefined;
  for (let i = 0; i < 8; i++) {
    try {
      const res = await page.request.post(url, {
        data,
        headers: { 'Content-Type': 'application/json', Origin: WEB },
      });
      if (![500, 502, 503].includes(res.status())) return res;
      last = new Error(`HTTP ${res.status()}`);
    } catch (e) {
      last = e as Error;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`seed: ${url} không phản hồi sau nhiều lần thử (${last?.message})`);
}

async function createClass(
  page: Page,
  email: string,
  o: { name: string; date: string; start: string; end: string },
): Promise<void> {
  const res = await post(page, `${API}/api/classes`, {
      name: o.name,
      type: 'ielts',
      level: '',
      skills: ['Writing'],
      mode: 'Online',
      templateId: '',
      schedule: { days: [weekdayMon0(o.date)], start: o.start, end: o.end },
      sessionsTotal: 4,
      startDate: o.date,
  });
  if (res.status() !== 201) {
    throw new Error(`seed: tạo lớp ${o.name} lỗi (${res.status()}): ${await res.text()}`);
  }
  const classId = ((await res.json()) as { id: string }).id;
  // Buổi học chỉ sinh khi có học viên đã kích hoạt: chèn học viên → enroll → accept.
  for (const studentId of await insertStudents(email, STUDENT_NAMES)) {
    const enroll = await post(page, `${API}/api/classes/${classId}/enroll`, { studentId });
    // 409 = lần thử trước thực ra đã ghi được; accept bên dưới lấy enrollment từ snapshot.
    if (![201, 409].includes(enroll.status())) {
      throw new Error(`seed: enroll lỗi (${enroll.status()}): ${await enroll.text()}`);
    }
  }
  const snap = await page.request.get(`${API}/api/kernel`);
  const { enrollments = [] } = (await snap.json()) as {
    enrollments?: Array<{ id: string; classId: string; status?: string }>;
  };
  for (const en of enrollments.filter((e) => e.classId === classId && e.status === 'invited')) {
    const accept = await post(page, `${API}/api/enrollments/${en.id}/accept`, {});
    if (accept.status() !== 200) throw new Error(`seed: accept lỗi (${accept.status()}): ${await accept.text()}`);
  }
}

/** Giáo viên độc lập mới, chưa có lớp. */
export async function teacherOnly(page: Page): Promise<void> {
  await signUpTeacher(page);
}

/** 3 lớp có ca hôm nay, chưa điểm danh. */
export async function teacherToday3(page: Page): Promise<void> {
  const email = await signUpTeacher(page);
  const date = vnDate(0);
  await createClass(page, email, { name: 'IELTS 6.5A', date, start: '18:00', end: '19:30' });
  await createClass(page, email, { name: 'IELTS 5.0B', date, start: '19:30', end: '21:00' });
  await createClass(page, email, { name: 'IELTS 7.0C', date, start: '20:00', end: '21:30' });
}

/** 4 lớp có ca hôm nay, chưa điểm danh (kiểm danh sách cắt ở 3). */
export async function teacherToday4(page: Page): Promise<void> {
  const email = await signUpTeacher(page);
  const date = vnDate(0);
  await createClass(page, email, { name: 'IELTS 6.5A', date, start: '18:00', end: '19:30' });
  await createClass(page, email, { name: 'IELTS 5.0B', date, start: '19:30', end: '21:00' });
  await createClass(page, email, { name: 'IELTS 7.0C', date, start: '20:00', end: '21:30' });
  await createClass(page, email, { name: 'IELTS 4.5D', date, start: '21:00', end: '22:00' });
}

/** 2 lớp có ca ngày 26/10/2026: "IELTS 6.5A" 18:00-19:30 và "IELTS 5.0B" 19:30-21:00. */
export async function teacherDated2(page: Page): Promise<void> {
  const email = await signUpTeacher(page);
  const date = '2026-10-26';
  await createClass(page, email, { name: 'IELTS 6.5A', date, start: '18:00', end: '19:30' });
  await createClass(page, email, { name: 'IELTS 5.0B', date, start: '19:30', end: '21:00' });
}

/** 1 lớp có ca hôm nay, chưa điểm danh. */
export async function teacherToday1(page: Page): Promise<void> {
  const email = await signUpTeacher(page);
  await createClass(page, email, { name: 'IELTS 6.5A', date: vnDate(0), start: '18:00', end: '19:30' });
}

/** 2 lớp có ca hôm nay, chưa điểm danh. */
export async function teacherToday2(page: Page): Promise<void> {
  const email = await signUpTeacher(page);
  const date = vnDate(0);
  await createClass(page, email, { name: 'IELTS 6.5A', date, start: '18:00', end: '19:30' });
  await createClass(page, email, { name: 'IELTS 5.0B', date, start: '19:30', end: '21:00' });
}

/** Org id của giáo viên chủ (cùng truy vấn với insertStudents). */
async function orgIdOf(ownerEmail: string): Promise<string> {
  const client = createClient({ url: `file:${devDbPath()}` });
  await client.execute('PRAGMA busy_timeout = 5000;');
  try {
    const rs = await client.execute({
      sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
            WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
      args: [ownerEmail],
    });
    const id = rs.rows[0]?.id;
    if (!id) throw new Error(`seed: chưa có org cho ${ownerEmail}`);
    return String(id);
  } finally {
    client.close();
  }
}

/**
 * Đăng nhập lại bằng một thành viên mới của org chủ với `membership.role` chỉ định
 * (cùng cách apps/e2e seedOrgMember). Server hiện chưa có mô hình "phân công lớp" nên
 * không seed được phần "phụ trách lớp X": chỉ role được đặt.
 */
async function becomeMember(
  page: Page,
  ownerEmail: string,
  role: 'ta' | 'class_teacher' | 'admin',
): Promise<void> {
  const orgId = await orgIdOf(ownerEmail);
  const email = `sa-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  await page.context().clearCookies();
  const res = await post(page, `${API}/api/auth/sign-up/email`, { name: `Thành viên ${role}`, email, password: PASSWORD });
  if (res.status() !== 200) throw new Error(`seed: sign-up thành viên lỗi (${res.status()}): ${await res.text()}`);
  const client = createClient({ url: `file:${devDbPath()}` });
  await client.execute('PRAGMA busy_timeout = 5000;');
  try {
    const user = await client.execute({ sql: 'SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1', args: [email] });
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error('seed: chưa thấy user thành viên');
    await client.execute({ sql: 'DELETE FROM membership WHERE user_id = ?', args: [userId] });
    await client.execute({
      sql: 'INSERT INTO membership (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [crypto.randomUUID(), orgId, String(userId), role, Date.now()],
    });
  } finally {
    client.close();
  }
  await page.goto(`${WEB}/dashboard`);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function ownerWithClasses(page: Page, day: 'today' | '2026-10-26'): Promise<string> {
  const email = await signUpTeacher(page);
  const date = day === 'today' ? vnDate(0) : day;
  await createClass(page, email, { name: 'IELTS 6.5A', date, start: '18:00', end: '19:30' });
  await createClass(page, email, { name: 'IELTS 5.0B', date, start: '19:30', end: '21:00' });
  return email;
}

/** Trợ giảng; org có 2 lớp có ca hôm nay. */
export async function taToday2(page: Page): Promise<void> {
  await becomeMember(page, await ownerWithClasses(page, 'today'), 'ta');
}
/** Trợ giảng; org có 2 lớp có ca ngày 26/10/2026. */
export async function taDated2(page: Page): Promise<void> {
  await becomeMember(page, await ownerWithClasses(page, '2026-10-26'), 'ta');
}
/** Trợ giảng; org chưa có lớp. */
export async function taOnly(page: Page): Promise<void> {
  await becomeMember(page, await signUpTeacher(page), 'ta');
}
/** Giáo viên đứng lớp; org có 2 lớp có ca hôm nay. */
export async function classTeacherToday2(page: Page): Promise<void> {
  await becomeMember(page, await ownerWithClasses(page, 'today'), 'class_teacher');
}
/** Giáo viên đứng lớp; org có 2 lớp có ca ngày 26/10/2026. */
export async function classTeacherDated2(page: Page): Promise<void> {
  await becomeMember(page, await ownerWithClasses(page, '2026-10-26'), 'class_teacher');
}
/** Quản lý/Giáo vụ (role admin); org chưa có lớp. */
export async function adminOnly(page: Page): Promise<void> {
  await becomeMember(page, await signUpTeacher(page), 'admin');
}
