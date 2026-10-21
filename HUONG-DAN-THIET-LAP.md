# Bật bản chính thức — Google và Supabase

Bản chơi thử hoạt động ngay. Các bước dưới đây bật đăng nhập thật, giới hạn ba lượt theo tài khoản, bảng xếp hạng dùng chung và trang quản trị. Không cần đưa tài khoản hay mật khẩu Google cho người viết web.

## 1. Tạo dự án Supabase

1. Đăng nhập https://supabase.com/dashboard, chọn New project, đặt tên và mật khẩu cơ sở dữ liệu. Lưu mật khẩu ở nơi riêng tư.
2. Chọn vùng phù hợp với người chơi, chờ dự án tạo xong.
3. Trong Settings / API, ghi lại Project URL và khóa **anon public**. Đây là hai giá trị sẽ đi vào `dist/config.js`.
4. Khóa **service_role** hoặc secret key chỉ được dùng trong server. Tuyệt đối không đặt nó trong `dist`, HTML, JavaScript phía trình duyệt, Git hoặc chat. Supabase Edge Functions có sẵn `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong môi trường server.

## 2. Tạo Google OAuth

1. Mở https://console.cloud.google.com, tạo hoặc chọn một project.
2. Vào Google Auth Platform (hoặc APIs & Services / OAuth consent screen), đặt tên ứng dụng, email liên hệ, chọn đối tượng External nếu dùng cho người chơi bên ngoài tổ chức.
3. Chỉ dùng các scope `openid`, `email`, `profile`. Không cần Gmail API hay Drive API.
4. Trong Clients / Create client, chọn Web application.
5. Authorized JavaScript origins: origin chính xác của web, ví dụ `https://ten-game.example.com`, không có đường dẫn. Nếu dùng bản Sites thì lấy origin từ đường dẫn đã triển khai.
6. Authorized redirect URIs: lấy **Callback URL** trong Supabase / Authentication / Providers / Google, dạng `https://PROJECT_REF.supabase.co/auth/v1/callback`.
7. Sao chép client ID và client secret vào Supabase / Authentication / Providers / Google rồi bật provider. Secret chỉ đặt trong Google/Supabase, không đưa vào `config.js`.
8. Trong Authentication / URL Configuration, đặt Site URL là origin web và thêm origin cùng `/` vào Redirect URLs. Có thể thêm `http://localhost:8080/` để kiểm thử.
9. Khi Google app còn ở Testing, thêm tài khoản thử vào Test users. Chuyển app sang Production và hoàn thành yêu cầu của Google trước khi mời người chơi thật.

## 3. Tạo bảng và hàm

Trong Supabase / SQL Editor, mở nội dung `supabase/schema.sql`, dán vào một truy vấn mới và bấm Run **một lần trên dự án mới**. Nếu đã có dữ liệu, cần migration phù hợp, không xóa bảng để chạy lại.

Bốn bảng nội bộ `players`, `attempts`, `organizers`, `campaign_config` bật Row Level Security và không cấp quyền cho trình duyệt. Client chỉ đọc được view `leaderboard`, gồm mã người chơi, tên rút gọn, độ lệch, điểm, thời điểm và hạng; không có email. Chỉ server xác minh JWT và gọi các hàm ghi dữ liệu bằng service role.

Thiết lập thời gian mở/đóng chiến dịch theo giờ Việt Nam; thay các mốc ví dụ sau bằng thời gian của bạn:

```sql
update public.campaign_config
set game_start = '2026-11-01 08:00:00+07',
    game_end = '2026-11-07 23:59:59+07'
where id = true;
```

Mặc định ba lượt cho **cả chiến dịch** (`attempt_scope='total'`). Nếu cần ba lượt mỗi ngày, đổi sang `per_day` trước khi mở chiến dịch; ngày được tính theo `Asia/Ho_Chi_Minh`. Không đổi scope hoặc thông số tính điểm khi đã có người chơi. Frontend hiện cố định mốc 10 giây, quá giờ 3 giây và độ giảm điểm 250 ms; nếu chỉnh các tham số server, cần chỉnh tương ứng `dist/game-core.js` và nội dung thể lệ. `latency_tolerance_ms` mặc định 1000 ms; đây là ngưỡng phát hiện bất thường, không phải điểm thưởng. Điểm chính thức dùng thời gian server nhận thao tác nên độ trễ mạng có thể ảnh hưởng kết quả. Cần đo độ trễ trên mạng người chơi trước khi dùng trao giải.

## 4. Triển khai Edge Functions

Cài Supabase CLI theo https://supabase.com/docs/guides/cli, rồi chạy ở thư mục mã nguồn:

```sh
supabase login
supabase link --project-ref PROJECT_REF
supabase secrets set ALLOWED_ORIGINS=https://ORIGIN_WEB_CUA_BAN
supabase functions deploy start-attempt --no-verify-jwt
supabase functions deploy stop-attempt --no-verify-jwt
supabase functions deploy player-state --no-verify-jwt
supabase functions deploy save-profile --no-verify-jwt
supabase functions deploy admin --no-verify-jwt
```

Nếu cần localhost khi thử, `ALLOWED_ORIGINS` có thể là danh sách ngăn cách bằng dấu phẩy: `https://ten-game.example.com,http://localhost:8080`. Bỏ localhost trước khi mở chiến dịch. `--no-verify-jwt` tắt bước kiểm tra JWT ở gateway; **mọi function vẫn tự xác minh token bằng `auth.getUser()`**, kiểm tra Google và email đã xác minh. Trang quản trị kiểm tra thêm bảng `organizers`. Không bỏ các bước xác minh trong `_shared/server.ts`.

## 5. Bật cấu hình công khai

Sửa `dist/config.js`:

```js
window.GAME_CONFIG = {
  supabaseUrl: 'https://PROJECT_REF.supabase.co',
  supabaseAnonKey: 'KHOA_ANON_PUBLIC',
  demoMode: false
};
```

Đưa lại bản web lên hosting. Khi dùng Sites, cập nhật và triển khai cùng Site đã tạo. Nếu dùng Netlify, có thể kéo thả thư mục `dist` vào Netlify Deploy. Với Vercel, import repository, chọn Framework Preset Other, không cần build command, Output Directory là `dist`. Sau khi có origin cuối cùng, cập nhật Google OAuth, Supabase Redirect URLs và `ALLOWED_ORIGINS` cho khớp.

Sites hiện được tạo ở chế độ riêng tư cho chủ sở hữu. Muốn mời công chúng cần đổi quyền chia sẻ/publish của Site hoặc dùng hosting công khai; Google OAuth không thay thế lớp truy cập riêng tư của Sites.

## 6. Cấp quyền ban tổ chức

1. Đăng nhập Google trên web một lần để tài khoản có trong Supabase / Authentication / Users.
2. Sao chép UUID của người quản trị, rồi chạy trong SQL Editor:

```sql
insert into public.organizers(id) values ('UUID_NGUOI_QUAN_TRI');
```

3. Mở `ORIGIN_WEB/#admin`. Có thể xem tối đa 500 lượt mới nhất, lọc lượt đáng ngờ, chấp nhận hoặc loại kết quả, xuất bảng xếp hạng CSV kèm email và chốt chiến dịch. Xuất CSV trước khi chốt để xem lại. Chốt sẽ dừng lượt đang chơi và không cho bắt đầu hay duyệt thêm; chỉ dùng khi ban tổ chức đã kiểm tra xong.
4. Cuối mỗi ngày, bấm Xuất CSV và lưu bản sao riêng. Chưa cấu hình lịch sao lưu tự động trong gói này. Xuất CSV gồm người có lượt hợp lệ trên bảng xếp hạng, không gồm người chỉ có lượt quá giờ/đáng ngờ.

## 7. Kiểm thử trước khi mở cho công chúng

- Chưa đăng nhập: xem được top, không bắt đầu lượt chính thức được.
- Tài khoản Google đã xác minh: tên và ảnh hiển thị, còn 3 lượt.
- Hai tab cùng bấm bắt đầu: chỉ một lượt được tạo; SQL khóa theo người chơi.
- Tải lại/đóng trang trong lượt: lượt đã bị trừ. Đợi 13 giây, đăng nhập lại, thấy đúng số lượt.
- Dừng sớm, gần đúng giờ, muộn và để quá giờ: điểm, trạng thái và ô cửa đúng.
- Sau ba lượt, đăng xuất rồi đăng nhập trên thiết bị khác: không có thêm lượt.
- Hai người chơi thấy cùng bảng xếp hạng; email không xuất hiện trong view công khai.
- Tài khoản thường truy cập `#admin` hay gọi function admin: bị từ chối.
- Kết quả có sai lệch server/client vượt ngưỡng: không lên bảng khi chưa duyệt.
- Duyệt bằng ban tổ chức, xuất CSV, chốt chiến dịch, xác minh không ghi thêm kết quả.
- Thử chèn trực tiếp vào `attempts` và gọi RPC bằng anon key: bị từ chối.

Mã server chưa được chạy trên dự án Supabase thật trong lần dựng bản chơi thử. Hoàn tất các kiểm tra này trước khi dùng để trao giải. SQL đảm bảo giới hạn theo tài khoản và điểm dựa trên thời gian server; vẫn có thể tự động hóa thao tác hoặc tạo nhiều tài khoản Google. Ban tổ chức cần quy định xác minh người thắng và thử nghiệm mạng thực tế.

## 8. Quyền riêng tư và kết thúc chiến dịch

Trước khi mở, thay nội dung quyền riêng tư trong `dist/index.html` bằng thông tin ban tổ chức, liên hệ, mục đích, ngày kết thúc và ngày xóa cụ thể. Xin đồng ý trước đăng nhập. Dữ liệu chỉ phục vụ trò chơi và trao giải.

Sau khi hoàn tất trao giải, lưu CSV có quyền truy cập hạn chế theo thời hạn đã công bố; xóa dữ liệu chiến dịch khi đến hạn. Việc xóa cần thực hiện trong Supabase bằng tài khoản ban tổ chức và áp dụng cả bảng `attempts`, `players`, tài khoản Authentication khi phù hợp, bản sao CSV và backup. Không đặt cron xóa tự động trước khi xác nhận chính sách và ngày cụ thể.
