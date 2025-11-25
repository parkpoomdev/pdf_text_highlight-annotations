# PDF Comment & Export Workspace

แอปนี้รวมเครื่องมือเพิ่มคอมเมนต์และจัดเตรียมหน้าสำหรับพิมพ์ในสไตล์ A4 หนึ่งหน้าแสดง 3 สไลด์ พร้อมช่องจดบันทึกที่วางข้างกัน



## Tab Guide

- **PDF Comment** – อัปโหลด PDF, เลือกข้อความบนหน้า แล้วกด “Add Comment” เพื่อเก็บคลิปหรือคำถามพร้อมตอบกลับใต้คอมเมนต์นั้น
<img width="1294" height="879" alt="image" src="https://github.com/user-attachments/assets/066fde56-78d4-4f80-b963-bdb5264fbdf1" />
- **Text Reply** – มุมมองสำหรับร่างคำตอบจากไฮไลต์ที่คัดไว้แล้ว ดู “Text Reply” เพื่อสร้างเนื้อหาเพิ่มเติมใน iframe เดียวกัน
<img width="1291" height="696" alt="image" src="https://github.com/user-attachments/assets/d536955f-9c00-49fc-8da3-7d31ea98c8d2" />
- **Paste Image** – วางภาพจากคลิปบอร์ด (Ctrl+V) แล้วกดเลือกโฟลเดอร์เพื่อบันทึกอัตโนมัติ เหมาะสำหรับแคปหน้าจอเร็วๆ
<img width="1275" height="756" alt="image" src="https://github.com/user-attachments/assets/e9c59c6c-3733-402a-82a8-505c41507aaa" />
- **Export Layout** – แสดงแต่ละชุดสไลด์สามหน้า (PDF preview) พร้อม comment card รูปสี่เหลี่ยม ซึ่งพร้อมส่งออกเป็น PDF A4 โดยคลิก “Export as PDF”
<img width="905" height="842" alt="image" src="https://github.com/user-attachments/assets/4ba42451-9e05-45f2-87f9-524b4477dacd" />


## Quick Start

1. คลิก **Upload PDF** ในแท็บ PDF Comment แล้วเลือกไฟล์ที่ต้องการ
2. ไฮไลต์ที่ต้องการ และกด “Add Comment” เพื่อสร้างบันทึกกำกับ
3. ไปที่แท็บ **Export Layout** เพื่อดูแต่ละชุดที่สร้างขึ้น (สามหน้า + ช่องคอมเมนต์)
4. กด **Export as PDF** เพื่อดาวน์โหลดไฟล์ A4 ที่รวมทุกสเปรดพร้อมคอมเมนต์ไว้เรียบร้อย

## Export Workflow

- ทุกชุดในแท็บ Export Layout จะถูกแปะในรูปแบบ A4 ที่มี 3 สไลด์และช่องคอมเมนต์ขวาเดียวกัน
- ฟังก์ชันดาวน์โหลดใช้ `html2canvas`/`jsPDF` อัปสเกลเนื้อหาก่อนสร้างเป็น PDF
- เมื่อโหลดเสร็จ ผู้ใช้สามารถเปิดไฟล์นั้นด้วย PDF viewer แล้วพิมพ์หรือแก้ไขเพิ่มเติมก่อนพิมพ์จริง

## Notes

- รันแอปโดยเปิด `index.html` หรือใช้ `python -m http.server` / `npx http-server . -p 5500` เพื่อหลีกเลี่ยงปัญหา worker ของ PDF.js
- ทุกข้อมูลจะอยู่ในหน่วยความจำ: ปิดแท็บหรือรีเฟรชแล้วข้อมูลคอมเมนต์จะหาย
- ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อดึง CDN ของ Tailwind, PDF.js, html2canvas และ jsPDF
