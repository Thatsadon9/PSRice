# PS Rice Database Structure Review

วันที่ review: 2026-06-28

## Canonical Migration Flow

- ใช้ `supabase/migrations/` เป็นแหล่ง migration หลักที่ replay ได้
- ไฟล์ SQL ที่อยู่ตรง `supabase/*.sql` เป็น legacy/manual migration notes จากช่วง MVP
- การเปลี่ยน schema ใหม่ควรสร้างด้วย `supabase migration new <name>` ก่อนเสมอ
- หลังแก้ DB ให้รัน `supabase db lint --local` หรือ `supabase db advisors --local` เมื่อ local Supabase พร้อมใช้งาน

## ปัญหาหลักที่พบ

- หลาย table เปิด RLS แต่ policy ยังเป็น `USING (true)` ทำให้ anon/authenticated อ่านหรือเขียนได้กว้างเกินไป
- มี `GRANT ALL` ให้ `anon` และ `authenticated` หลาย table/function ซึ่งไม่เหมาะกับข้อมูลพนักงาน เอกสารส่วนตัว เงินเดือน และ attendance
- Index ยังไม่ครบตาม FK และ query pattern จริง เช่น `tasks`, `notifications`, `task_submissions`, `registration_requests`
- Storage policies ของ `proofs` เคยเปิด public write/update/delete ใน schema dump
- TypeScript มี `review_rating` แล้ว แต่ฐานข้อมูลยังไม่มี column สำหรับ persist ค่า rating

## สิ่งที่ migration `20260628113031_database_structure_hardening.sql` ปรับ

- เพิ่ม private helper functions สำหรับ RLS แบบ role-aware
- ลด grant เหลือ explicit grants ตาม workflow ปัจจุบัน
- แทนที่ MVP public-open policies ด้วย owner/staff/branch-aware policies
- Harden buckets: `avatars`, `proofs`, `employee-documents`
- เพิ่ม indexes สำหรับ FK, dashboard fetch, daily task generation, notification unread, review queues
- เพิ่ม `task_submissions.review_rating`
- เพิ่ม CHECK constraints แบบ `NOT VALID` เพื่อ enforce ข้อมูลใหม่โดยไม่ทำ migration ล้มเพราะ legacy rows

## Follow-Up ที่ควรทำรอบถัดไป

- ย้ายข้อมูลส่วนตัวมาก ๆ เช่น citizen ID และ bank account ออกจาก `public.users` ไป table แยก เช่น `employee_private_profiles`
- เปลี่ยน client stores ที่ fetch `users.select('*')` ให้ใช้ view/API ที่คืนเฉพาะ directory fields
- ทำ server routes สำหรับ mutation สำคัญ เช่น branch/user/task template management เพื่อลดการเขียนตรงจาก client
- Deduplicate legacy SQL files หรือ squash migration เมื่อ production schema นิ่งแล้ว
