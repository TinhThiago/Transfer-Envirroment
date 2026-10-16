# GitHub Pages độc lập — đăng nhập Microsoft

Workflow Pages hiện chạy hoàn toàn trong trình duyệt: không cần backend, VITE_API_BASE_URL hay client secret. Local/backend cũ vẫn có thể dùng riêng bằng VITE_RUNTIME_MODE=backend.

## 1. Deploy giao diện

1. Đẩy code mới lên GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. Chạy workflow **Deploy frontend to GitHub Pages** hoặc push vào nhánh mặc định.
4. Mở URL Pages được ghi trong kết quả deploy. Trang chưa cấu hình Microsoft vẫn mở được và hiển thị hướng dẫn đăng nhập.

Workflow tự lấy base_path nên dùng được với `/TEN-REPOSITORY/`, user Pages hoặc domain riêng. File `auth-callback.html` được build cùng frontend. Workflow không còn bước Validate backend URL.

## 2. Cấu hình Microsoft Entra một lần

App mặc định dùng tenant/client ID đã có trong dự án. Có thể đổi qua GitHub Actions **Variables** `VITE_MICROSOFT_TENANT_ID` và `VITE_MICROSOFT_CLIENT_ID` nếu muốn dùng app registration riêng. Đây là ID công khai, không phải secret; không đặt secret vào bất kỳ biến VITE_ nào.

1. Mở ứng dụng Pages, sao chép **Redirect URI** ở màn hình đăng nhập. Địa chỉ có dạng `https://YOUR-USER.github.io/TEN-REPOSITORY/auth-callback.html`.
2. Vào Entra ID → App registrations → chọn app khớp Client ID được hiển thị.
3. Authentication → Add a platform → **Single-page application (SPA)** → dán đúng Redirect URI. Giữ dấu gạch, tên repo và chữ hoa/thường đúng với URL app. Không chọn platform Web cho URI này. Không cần bật implicit grant.
4. API permissions → Add a permission → APIs my organization uses → **Dataverse** (hoặc tên Dynamics CRM hiển thị trong tenant) → **Delegated permissions** → **user_impersonation**.
5. Thực hiện consent/admin consent nếu chính sách tenant yêu cầu. Người quản trị app/tenant phải làm phần này nếu tài khoản của bạn không đủ quyền.
6. Tài khoản Microsoft dùng đăng nhập phải có quyền phù hợp ở cả hai môi trường: đọc metadata/dependency, tạo/export Solution ở nguồn, import/publish tại đích; chuyển data cần quyền Read/Create/Write/Append/Append To cho bảng liên quan. Quyền application user của bản backend không tự chuyển sang tài khoản của bạn.

Không cần cung cấp mật khẩu hay client secret cho trang. Đăng nhập diễn ra qua popup Microsoft bằng Authorization Code + PKCE/MSAL. Callback chỉ xử lý phản hồi đăng nhập, không chạy app chuyển đổi.

## 3. Đăng nhập và sử dụng

- Bấm **Đăng nhập Microsoft**; cho phép popup của trang.
- Nếu một môi trường cần consent hoặc phiên hết hạn, bấm **Cấp quyền Dev** / **Cấp quyền Production** ở thanh phía trên. App không tự mở popup khi polling. Sau cấp quyền, giao diện tải lại trạng thái kết nối.
- Job dừng vì cần đăng nhập có nút **Tiếp tục sau đăng nhập**, chỉ cho tiếp tục khi không còn thao tác ghi chưa rõ kết quả.
- Thực hiện kiểm tra kế hoạch trước khi chuyển. Cloud flow nguồn được giữ nguyên, đích được chuẩn bị Off; có thể chọn **Cấu hình connection sau** và hoàn tất trong Solution đích.
- Nút **Mở Solution đích** đọc đúng Solution ID trong môi trường đích rồi mở Power Apps.

## 4. Giới hạn vận hành

**Giữ tab mở khi chuyển.** Không có server worker chạy nền. Import đã được Microsoft nhận có thể vẫn chạy sau khi đóng tab; mở lại cùng trình duyệt/tài khoản để app tra ImportJobId cũ, không gửi lại import.

Lịch sử, manifest và checkpoint GUID nằm trong IndexedDB của trình duyệt, phân tách theo tenant/tài khoản. Token do MSAL quản lý trong phiên; không lưu token, ZIP, payload bản ghi hoặc giá trị biến người dùng nhập vào lịch sử. Các giá trị nhập cấu hình nằm trong bộ nhớ phiên; reload có thể cần cấu hình lại.

Đóng/reload giữa một thao tác ghi chưa rõ kết quả sẽ yêu cầu đối chiếu. Không tự gửi lại thao tác tạo bản ghi/import vì có thể gây trùng. Xóa dữ liệu trang hoặc chuyển máy sẽ không có checkpoint/lịch sử cũ. Không tự nhập lịch sử SQLite của bản backend.

App cần IndexedDB, Web Locks và HTTPS (hoặc localhost để phát triển). Khóa chỉ phối hợp các tab cùng browser/origin; không có khóa toàn cục giữa nhiều máy/tài khoản bên ngoài browser này. Chỉ vận hành một tiến trình chuyển vào cùng đích tại một thời điểm.

## 5. Build và kiểm tra

`npm test` kiểm thử bằng Microsoft boundary giả lập. `npm run build` mặc định build local/backend; Pages workflow đặt VITE_RUNTIME_MODE=browser.

Ví dụ build Pages trong một PowerShell tạm, không khởi động server:

```powershell
$env:VITE_RUNTIME_MODE='browser'
$env:VITE_BASE_PATH='/Transfer-Enviroment/'
npm.cmd run build
```

Không đặt VITE_API_BASE_URL. Xóa các biến tạm hoặc mở terminal mới để build lại backend. Nếu muốn chạy dev browser sau này, dùng VITE_RUNTIME_MODE=browser và đăng ký thêm Redirect URI localhost tương ứng; không dùng URI localhost cho bản Pages.

Build/test thành công không đồng nghĩa Entra hoặc quyền user đã được kiểm chứng live. Chỉ kiểm tra WhoAmI/catalog sau khi đăng nhập; không tự chọn dữ liệu Production làm thử nghiệm.

Tài liệu Microsoft: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/quick-start-js-spa và https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge