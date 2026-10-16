# GitHub Pages + backend HTTPS

GitHub Pages phục vụ giao diện. Dataverse, secret và worker vẫn chạy trên backend Node.js 24 riêng. Các thay đổi này chưa tạo repository hay triển khai dịch vụ bên ngoài.

## 1. Backend

Chạy một instance backend với ổ đĩa bền vững cho SQLite. Có thể dùng Dockerfile trong repository hoặc `npm ci` rồi `npm start`. Không dùng serverless có filesystem tạm hoặc tắt tiến trình giữa job.

Ví dụ biến môi trường trên máy chủ (thay domain và secret):

```dotenv
HOST=0.0.0.0
PORT=3100
DATABASE_PATH=/data/transfer.db
ALLOWED_HOSTS=api.example.com
CORS_ORIGINS=https://YOUR-USER.github.io
MICROSOFT_TENANT_ID=<tenant-id>
MICROSOFT_CLIENT_ID=<client-id>
MICROSOFT_CLIENT_SECRET=<secret-tren-may-chu>
```

`CORS_ORIGINS` chỉ có origin, không có `/TEN-REPOSITORY/` và không có dấu `/` cuối; có thể phân cách nhiều origin bằng dấu phẩy. Reverse proxy phải giữ Host đúng với ALLOWED_HOSTS. Khi dùng domain riêng cho Pages, thêm origin đó vào danh sách.

Backend hiện dùng chung quyền application user và chưa có đăng nhập/phân quyền người dùng. **Đặt toàn bộ backend sau cổng truy cập có xác thực, chỉ cho tài khoản được phép vào; không công khai API ẩn danh. CORS không thay thế xác thực.** Proxy cần cho phép OPTIONS preflight từ origin đã chọn, còn GET/POST phải kiểm tra phiên. Frontend gửi cookie với `credentials: include`; cấu hình phiên proxy phù hợp với truy cập khác origin và chính sách cookie của trình duyệt. Đăng nhập backend qua tab riêng trước khi dùng Pages. Hãy xác minh cơ chế này trên trình duyệt trước khi vận hành.

Nếu dùng Docker: gắn volume tại `/data`, chỉ mở cổng container tới reverse proxy HTTPS đã xác thực. Không đưa MICROSOFT_CLIENT_SECRET vào biến `VITE_*`, Dockerfile, GitHub Pages hay file commit. Cấu hình DPAPI Windows trên máy local không mang sang máy chủ khác được.

## 2. GitHub repository

1. Đẩy code lên repository của bạn.
2. Settings → Secrets and variables → Actions → **Variables**, tạo `VITE_API_BASE_URL=https://api.example.com` (địa chỉ backend, không thêm `/api`).
3. Settings → Pages → Source: **GitHub Actions**.
4. Push vào nhánh mặc định hoặc chạy workflow **Deploy frontend to GitHub Pages** trong tab Actions.

Workflow tự lấy `base_path` từ cấu hình Pages: `/TEN-REPOSITORY/` cho project Pages, `/` cho user Pages/domain riêng. Không cần ghi cứng tên Transfer-Envirroment trong source. Chỉ thư mục `dist` được upload; source backend, SQLite và secret không thuộc artifact Pages. Workflow dừng rõ ràng nếu thiếu backend HTTPS.

## 3. Local và kiểm tra

Không đặt VITE_API_BASE_URL khi dùng local cùng backend hiện tại. `npm run dev` dùng `/` và proxy `/api` tới localhost:3100; `npm run build` mặc định cũng dùng `/`.

Để xem trước cấu hình Pages trong một shell tạm:

```powershell
$env:VITE_BASE_PATH='/Transfer-Envirroment/'
$env:VITE_API_BASE_URL='https://api.example.com'
npm.cmd run build
```

Đây chỉ là URL ví dụ; thay bằng backend thật. Xóa hai biến trên hoặc mở terminal mới để build lại bản local. Vite tự đọc `.env.local` cho frontend nếu bạn chọn lưu các biến VITE_ ở đó; backend vẫn nhận biến môi trường tiến trình hoặc secret mã hóa Windows.

Sau deploy, kiểm tra assets tải từ đúng thư mục repo, kết nối Dev/Production hiển thị đúng, request OPTIONS và GET/POST đi tới backend HTTPS, và nút Mở Solution đích mở đúng Solution. Không cần chạy chuyển Production để kiểm tra hosting.

Tài liệu: https://vite.dev/guide/static-deploy.html và https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
