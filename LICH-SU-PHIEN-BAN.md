# Bảo Tàng: Đêm — Tới Giờ Lên Đèn

Website từ hai gói source-full.zip và dist-production (1).zip do chủ sở hữu cung cấp. Bản production sử dụng Supabase `kqdugauszqbdhlrbkamm` và đăng nhập Google thật.

## Chạy cục bộ

`npm start` rồi mở http://localhost:8080. Không cần cài dependency hoặc build để chạy bản đã đóng gói. `npm test` kiểm tra cách tính điểm, hết giờ và chọn kết quả tốt nhất.

## Triển khai

Thư mục công khai là `dist/`. Danh tính Sites nằm trong `.openai/hosting.json`. Mã máy chủ nằm trong `supabase/` và không nằm trong gói tài nguyên công khai. Giữ nguyên dự án hiện tại khi cập nhật.

URL: https://bao-tang-dem-len-den.mythic-shore-0253.chatgpt.site/

Supabase Auth cần cho phép URL này trong Redirect URLs. Cả 5 Edge Functions đã được thêm đúng origin này, giữ nguyên danh sách ALLOWED_ORIGINS cũ và kiểm tra tài khoản Google trên máy chủ.

## Thay đổi

- Giữ nguyên thiết kế đen/vàng, ảnh, phông chữ và các màn trò chơi.
- Đóng gói Supabase JS 2.57.4 tại chỗ để không phụ thuộc CDN khi tải trang. File `vendor-package-lock.json` ghi lại dependency của bundle.
- Xử lý lỗi kết nối/đăng nhập và khôi phục nút khi hủy.
- Sửa lệnh kiểm thử để sử dụng các test có trong gói.
- Không thay đổi bảng, dữ liệu người chơi hoặc số lượt trên hệ thống đang hoạt động.

## Giới hạn kiểm chứng

Các kiểm thử trình duyệt cục bộ dùng dữ liệu mô phỏng cho kết nối mạng; kiểm tra Google thật cần người sở hữu đăng nhập trên URL đã triển khai. Không thể suy ra OAuth hoạt động chỉ từ việc các hàm máy chủ đã ACTIVE.

## Cập nhật quy tắc sáng và giao diện

Số ô sáng dựa trực tiếp trên độ lệch tuyệt đối, tính bằng mili giây trong `dist/game-core.js`: ≤50 → 8, ≤100 → 7, ≤200 → 6, ≤350 → 5, ≤500 → 4, ≤750 → 3, ≤1000 → 2, ≤2000 → 1; lớn hơn 2000 hoặc hết giờ → 0. Thể lệ trên web dùng cùng bảng mức nên không lệch với kết quả. Điểm xếp hạng và dữ liệu lịch sử không thay đổi. Kết quả chờ duyệt vẫn mô tả mức sáng theo độ chính xác nhưng được ghi rõ chưa xếp hạng.

Các ô cửa sáng bằng lớp SVG khớp với mặt tiền, có hiệu ứng lần lượt. Giao diện dùng Montserrat Bold 700 tự lưu trữ, hỗ trợ tiếng Việt; nhận diện đen/vàng và biểu tượng được dựng dạng vector theo mẫu chủ sở hữu. Vùng cuộn các màn được đặt bên dưới thanh đầu trang. Đồng hồ bắt đầu ngay sau phản hồi tạo lượt, không đợi thêm yêu cầu tải hồ sơ.

Đã kiểm tra các ranh giới độ lệch, tính đối xứng sớm/muộn, hết giờ và thứ hạng. Kiểm tra Chromium ở 320×568, 390×844 và 1440×1000 dùng phản hồi Supabase mô phỏng: 1,496 giây sáng 1 ô; 0,040 giây sáng 8 ô; trạng thái chờ duyệt, chơi lại và bảng xếp hạng đúng. Đây không phải kiểm thử đăng nhập Google trực tiếp.

## Bảng xếp hạng và quyền truy cập công khai

Website đặt quyền Sites là public: khách truy cập trực tiếp không cần tài khoản ChatGPT. Google chỉ dùng để tham gia trò chơi.

Mỗi email Google có một hồ sơ, được ràng buộc bằng unique index không phân biệt chữ hoa/thường. Tên được phép trùng. Bảng leaderboard_players lưu dữ liệu công khai tối thiểu; trigger đồng bộ tên và kết quả tốt nhất khi hồ sơ/lượt chơi thay đổi. View leaderboard chỉ xếp hạng lượt hợp lệ; leaderboard_directory hiển thị thêm người chờ duyệt hoặc chưa có lượt hợp lệ. Hai view dùng security_invoker; bảng bật RLS và khách chỉ có quyền đọc. Email không được công khai.

Frontend hiển thị tên đầy đủ, cập nhật mỗi 10 giây khi bảng đang mở, khi quay lại tab và sau lượt chơi. Nút Xem thêm tải tiếp mỗi 50 người. Migration đã áp dụng: supabase/migrations/20261012175523_persistent_public_leaderboard.sql; khi thiết lập dự án mới, chạy sau schema gốc.

Đã kiểm tra quyền đọc bằng vai trò anon, không được ghi hay đọc email; trigger cập nhật hạng được kiểm thử trong transaction rồi rollback. Kiểm thử Chromium xác nhận tên trùng thuộc hai hồ sơ riêng, cập nhật định kỳ và phân trang.

Logo chờ tệp ảnh gốc có thể truy cập để sử dụng nguyên tỉ lệ và bố cục; không tái tạo bằng công cụ sinh ảnh.
