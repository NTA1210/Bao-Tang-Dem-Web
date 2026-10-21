# Bản bàn giao — Bảo Tàng: Đêm

Đọc `../03-HUONG-DAN/BAN-GIAO.md` trước khi triển khai. Mã giao diện lấy từ phiên bản Sites 3, commit `700b00a25dfe19809cae76bbf1f83aeb3e5aa352`.

Cấu hình `dist/config.js` mặc định là **chơi thử**, tránh ghi lượt vào chiến dịch thật khi người nhận chạy thử. Để dùng chính thức, cấu hình theo tài liệu và mẫu trong `../04-CAU-HINH/`.

## Chạy

- Xem ngay: mở `../01-CHOI-THU-OFFLINE.html` bằng Chrome/Edge trên máy tính.
- Chạy mã nguồn: `python -m http.server 8080 --directory dist` rồi mở http://localhost:8080. Windows có thể dùng `py -3`; macOS/Linux dùng `python3`.
- Kiểm thử logic: có Node.js thì chạy `npm test`, không cần npm install.
- Hosting công khai: chỉ đưa **nội dung thư mục dist** lên hosting tĩnh hỗ trợ HTTPS.

## Cơ sở dữ liệu mới

1. Tạo Supabase riêng và cấu hình Google OAuth.
2. Trên database mới/trống, chạy `supabase/schema.sql`.
3. Chạy tiếp `supabase/migrations/20261012175523_persistent_public_leaderboard.sql`.
4. Triển khai 5 Edge Functions cùng thư mục `_shared`, theo hướng dẫn gốc `HUONG-DAN-THIET-LAP.md`.
5. Cấu hình origin, URL chuyển hướng, thông tin ban tổ chức và lịch sự kiện.

Không chạy lại schema gốc trên database đang có dữ liệu. Các thư mục `design-src/` và `LICH-SU-PHIEN-BAN.md` là tài liệu lịch sử; bản chạy thực tế nằm trong `dist/`.

`.git` và danh tính Sites `.openai/hosting.json` không nằm trong gói di chuyển. Website đang hoạt động vẫn giữ nguyên.
