// Cấu hình trò chơi "Tới Giờ Lên Đèn" (BẢO TÀNG: ĐÊM)
//
// - Chế độ chơi thử (Offline Demo): demoMode: true (không cần Supabase URL/Key)
// - Chế độ chính thức (Online Live): demoMode: false (cần điền thông tin Supabase bên dưới)
window.GAME_CONFIG = {
  supabaseUrl: 'https://uycwdmiglegpysuzbqxq.supabase.co',      // Ví dụ: 'https://xyzcompany.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5Y3dkbWlnbGVncHlzdXpicXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTQ2MzIsImV4cCI6MjEwODEzMDYzMn0.hjk7hU9xGhW4LdGnPYJnAEg07cgkQZRj47ap8lp9wyc',  // Khóa anon public từ Supabase Dashboard (Settings -> API)
  demoMode: false        // Đổi thành false khi muốn chạy chính thức lưu vào Supabase
};
