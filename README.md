# PS Rice — ระบบจัดการงานพนักงาน

เว็บแอปสำหรับบริหารงานประจำวันของ **PS Rice Wholesale** ครอบคลุมการลงเวลา มอบหมายและตรวจงาน จัดกะ คำขอพนักงาน และสรุปค่าแรง ออกแบบให้พนักงานใช้งานบนมือถือได้สะดวก และให้ผู้จัดการดูภาพรวมการดำเนินงานผ่านเดสก์ท็อปหรือมือถือ

## ความสามารถหลัก

### สำหรับพนักงาน

- เช็กอินและเช็กเอาต์ด้วยตำแหน่ง GPS, geofence ของสาขา และภาพถ่าย
- ดูกะและงานประจำวัน พร้อมติดตามสถานะงานและ milestone
- ส่งงานด้วยข้อความ รูปภาพ วิดีโอ หรือ checklist ตามหลักฐานที่กำหนด
- ดูค่าตอบแทนจากการเข้างานและงาน ทั้งแบบเหมาจ่ายและคิดตามจำนวนหน่วย
- ส่งคำขอลา เบิกเงินล่วงหน้า และเบิกค่าใช้จ่ายพร้อมไฟล์แนบ
- ดูประวัติการลงเวลา การแจ้งเตือน โปรไฟล์ เอกสาร และข้อมูลบัญชีธนาคาร

### สำหรับผู้จัดการและแอดมิน

- ดูแดชบอร์ดพนักงานที่กำลังทำงาน งานเกินกำหนด และรายการรอตรวจ
- สร้าง template งาน มอบหมายงานครั้งเดียวหรืองานประจำ และจัดลำดับงาน
- ตรวจหลักฐาน อนุมัติหรือส่งงานกลับแก้ไข และกำหนดจำนวนที่อนุมัติ
- จัดการพนักงาน สาขา ขอบเขต geofence กะ และตารางงาน
- ตรวจคำขอพนักงานและคำขอสมัครใช้งาน
- สรุปค่าแรง OT โบนัส รายการหัก เงินเบิก และค่าใช้จ่ายที่อนุมัติ
- ดูรายงานและส่งออกข้อมูลเป็นไฟล์ Excel
- แอดมินสามารถสลับไปดูระบบในมุมของพนักงานได้

## บทบาทผู้ใช้

| Role | พื้นที่หลัก | ขอบเขตการใช้งาน |
| --- | --- | --- |
| `employee` | `/employee` | งาน กะ ลงเวลา คำขอ และข้อมูลของตนเอง |
| `manager` | `/manager` | บริหารงานและพนักงานภายในสาขาที่รับผิดชอบ |
| `admin` | `/manager` และโหมดพนักงาน | จัดการระบบและสลับมุมมองผู้ใช้งานได้ |

## เทคโนโลยี

- [Next.js](https://nextjs.org/) 16 (App Router) และ React 19
- TypeScript และ Tailwind CSS 4
- [Supabase](https://supabase.com/) สำหรับ Auth, PostgreSQL, Storage และ Realtime
- Zustand สำหรับ client-side state management
- Recharts สำหรับกราฟ และ SheetJS (`xlsx`) สำหรับส่งออก Excel
- Vercel สำหรับ hosting และงานตามกำหนดเวลา

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมี

- Node.js รุ่นที่รองรับ Next.js 16 และ npm
- โปรเจกต์ Supabase พร้อมฐานข้อมูลและ Storage buckets ที่ระบบต้องใช้
- Supabase CLI หากต้องการจัดการ migration จากเครื่อง local

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. ตั้งค่า environment variables

สร้างไฟล์ `.env.local` ที่ root ของโปรเจกต์:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-random-secret
```

| ตัวแปร | ใช้สำหรับ | การเปิดเผย |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของ Supabase project | ใช้ใน browser ได้ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key สำหรับ client | ใช้ใน browser ได้และต้องทำงานร่วมกับ RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | API ฝั่ง server, จัดการผู้ใช้ และสร้างงานประจำวัน | **ห้ามส่งไปยัง client หรือ commit ลง Git** |
| `CRON_SECRET` | ป้องกัน endpoint งานอัตโนมัติใต้ `/api/cron/*` | ต้องกำหนดใน production |

### 3. เตรียมฐานข้อมูล

ไฟล์ migration หลักอยู่ใน `supabase/migrations/` หากเชื่อม Supabase project ไว้แล้ว สามารถนำ migration ที่ยังไม่ถูกใช้งานขึ้นฐานข้อมูลด้วย:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

> ตรวจสอบ target project และสำรองข้อมูลก่อนรัน `db push` กับฐานข้อมูล production ไฟล์ `supabase/*.sql` ที่อยู่นอกโฟลเดอร์ `migrations/` เป็น legacy/manual migration notes และไม่ใช่ canonical migration flow

รายละเอียดการจัดโครงสร้างและข้อควรติดตามด้านฐานข้อมูลอยู่ที่ [`supabase/DB_STRUCTURE_REVIEW.md`](supabase/DB_STRUCTURE_REVIEW.md)

### 4. รัน development server

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) ระบบจะพาไปหน้าเข้าสู่ระบบโดยอัตโนมัติ

ฟีเจอร์เช็กอินต้องได้รับสิทธิ์ **Location** และ **Camera** จาก browser การทดสอบนอก `localhost` ควรใช้ HTTPS เพื่อให้ browser APIs เหล่านี้ทำงานได้ตามปกติ

## คำสั่งที่ใช้บ่อย

| คำสั่ง | รายละเอียด |
| --- | --- |
| `npm run dev` | เปิด development server |
| `npm run build` | สร้าง production build |
| `npm run start` | เปิด production server จาก build ที่สร้างแล้ว |
| `npm run lint` | ตรวจโค้ดด้วย ESLint |
| `npm run verify:storage-retention` | ทดสอบกติกาเก็บรูป 5/30 วันกับ Supabase แล้วล้างข้อมูลทดสอบ |
| `CLEANUP_ENDPOINT=<url> CRON_SECRET=<secret> npm run verify:storage-cleanup` | ทดสอบ Cron ลบไฟล์จริงแบบ E2E แล้วล้างข้อมูลทดสอบ |

โปรเจกต์ยังไม่มี automated test script ใน `package.json` ดังนั้นก่อนส่งงานควรรันทั้ง `npm run lint` และ `npm run build`

## งานประจำวันอัตโนมัติ

Vercel Cron เรียก `GET /api/cron/daily-tasks` ตามค่าใน `vercel.json` เวลา `17:00 UTC` ของทุกวัน หรือเที่ยงคืนตามเวลาไทย (`Asia/Bangkok`) เพื่อ:

- ปิดและล้างงานเก่าที่ยังไม่ได้ส่งตามเงื่อนไขของระบบ
- สร้างงานเช็กอินประจำวันให้พนักงานที่ active
- สร้างงานจาก template แบบรายวันและรายสัปดาห์
- ใช้อัตรารางวัลเช็กอินส่วนกลางหรือค่าที่กำหนดแยกตามสาขา

ใน production ต้องกำหนด `CRON_SECRET`; endpoint จะตรวจ header `Authorization: Bearer <CRON_SECRET>` ทุกครั้ง

## การจัดการพื้นที่ Storage

รูปภาพจะถูกย่อและบีบอัดใน browser ก่อนอัปโหลด โดยใช้ขนาดตามประเภทงาน เช่น รูปเช็กอินและหลักฐานงานไม่เกิน 1,280 px, รูปโปรไฟล์ไม่เกิน 768 px และเอกสารไม่เกิน 2,000 px เพื่อลด Storage และ bandwidth โดยไม่กระทบความชัดเจนที่จำเป็น

Vercel Cron เรียก `GET /api/cron/storage-cleanup` เวลา `17:30 UTC` ของทุกวัน หรือ `00:30` เวลาไทย เพื่อจัดการ retention ดังนี้:

- รูปเช็กอิน/เช็กเอาต์: ลบหลังอัปโหลดครบ 30 วัน และคงข้อมูลเวลา GPS และสถานะการลงเวลาไว้
- หลักฐานงาน: เริ่มนับ 5 วันหลังผู้ตรวจอนุมัติหรือไม่อนุมัติงาน จากนั้นลบทั้งไฟล์และรายการอ้างอิงไฟล์
- รูปโปรไฟล์ เอกสารพนักงาน และไฟล์แนบคำขอ: เก็บถาวร; เมื่ออัปโหลดรูปโปรไฟล์หรือเอกสารเวอร์ชันใหม่ ระบบจะลบเฉพาะเวอร์ชันเก่าหลังบันทึกข้อมูลใหม่สำเร็จ

ตาราง `storage_cleanup_jobs` ทำหน้าที่เป็นคิวและ audit log ของการลบ รองรับ retry สูงสุด 5 ครั้ง และ RPC สำหรับดึงงานถึงกำหนดเปิดให้ใช้เฉพาะ `service_role` เท่านั้น

## โครงสร้างโปรเจกต์

```text
src/
├── app/
│   ├── api/          # Route handlers ฝั่ง server
│   ├── employee/     # หน้าสำหรับพนักงาน
│   ├── manager/      # หน้าสำหรับผู้จัดการและแอดมิน
│   ├── login/        # เข้าสู่ระบบ
│   └── register/     # ส่งคำขอสมัครใช้งาน
├── components/
│   ├── layout/       # Header, Sidebar, BottomNav และ navigation
│   ├── providers/    # Auth initialization
│   ├── tasks/        # UI ที่ใช้กับงานและค่าตอบแทน
│   └── ui/           # Shared UI primitives
├── lib/              # Supabase client, types และ business logic
└── store/            # Zustand stores แยกตาม domain

supabase/
├── migrations/       # Canonical database migrations
├── sql/              # SQL utility/manual scripts
├── config.toml       # Local Supabase configuration
└── DB_STRUCTURE_REVIEW.md
```

## การ deploy บน Vercel

1. เชื่อม repository กับ Vercel
2. เพิ่ม environment variables ทั้งสี่รายการใน Project Settings
3. ตรวจว่า Supabase Auth URL configuration อนุญาต production domain
4. นำ migration ล่าสุดขึ้น Supabase ก่อน deploy โค้ดที่พึ่งพา schema ใหม่
5. Deploy แล้วทดสอบ login, Storage upload, check-in และ cron endpoint

`vercel.json` มี cron schedule ทั้งงานประจำวันและการล้าง Storage อยู่แล้ว จึงไม่ต้องสร้าง schedule ซ้ำใน dashboard

## หมายเหตุด้านความปลอดภัย

- ระบบพึ่งพา Supabase Row Level Security (RLS) ในการจำกัดข้อมูลตามเจ้าของ บทบาท และสาขา
- ห้ามใช้ `SUPABASE_SERVICE_ROLE_KEY` ใน Client Component หรือตั้งชื่อตัวแปรด้วย prefix `NEXT_PUBLIC_`
- ข้อมูลพนักงาน เงินเดือน เอกสาร และหลักฐานการทำงานเป็นข้อมูลอ่อนไหว ควรทบทวน RLS และ Storage policies ทุกครั้งที่เพิ่ม table หรือ bucket
- การเปลี่ยน schema ใหม่ควรสร้าง migration ใน `supabase/migrations/` แทนการแก้ production database โดยไม่มีไฟล์ติดตาม

## เอกสารเพิ่มเติม

- [`supabase/DB_STRUCTURE_REVIEW.md`](supabase/DB_STRUCTURE_REVIEW.md) — แนวทาง migration, RLS และประเด็นฐานข้อมูล
- [`docs/superpowers/specs/2026-06-28-operational-core-ux-redesign-design.md`](docs/superpowers/specs/2026-06-28-operational-core-ux-redesign-design.md) — หลักการ UX/UI ของระบบ
- [`docs/superpowers/plans/2026-06-28-employee-payroll-ledger.md`](docs/superpowers/plans/2026-06-28-employee-payroll-ledger.md) — แนวทาง payroll ledger

โปรเจกต์นี้เป็นซอฟต์แวร์ภายในของ PS Rice Wholesale และตั้งค่าเป็น private package (`"private": true`)
