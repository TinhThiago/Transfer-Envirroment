# GitHub Pages với đăng nhập Microsoft, không backend

## Mục tiêu đã chọn

Người dùng chọn chỉ dùng GitHub Pages và đăng nhập bằng tài khoản Microsoft, không dùng client secret hay dịch vụ backend. Giữ ba trang Table, Column, Power Automate cùng các điều kiện chuyển hiện có. Không khởi động lại app local đã được yêu cầu dừng; không chạy chuyển thật trong quá trình phát triển.

Đây là thay đổi kiến trúc, chưa phải thay đổi chỉ thêm nút đăng nhập. Tài liệu này để duyệt thiết kế trước khi viết kế hoạch triển khai.

## Xác thực và điều kiện Entra

- Sử dụng MSAL Browser với Authorization Code + PKCE, single tenant. Tenant/client ID hiện tại là cấu hình công khai, có thể giữ nếu app registration được bổ sung platform SPA và quyền delegated phù hợp.
- Người quản trị cần thêm SPA Redirect URI đúng URL callback của Pages, thêm Dataverse delegated `user_impersonation` và consent nếu chính sách tenant yêu cầu. Không tạo, nhúng hoặc dùng client secret trên Pages.
- URL Pages chưa có không ngăn build/deploy. App tính địa chỉ callback từ origin và base path hiện tại, hiển thị địa chỉ để sao chép vào Entra. Callback là một file tĩnh được build cùng app, không cần server rewrite. Cách xử lý callback theo phiên bản MSAL được chọn lúc triển khai.
- Đăng nhập/đăng xuất và tài khoản đang dùng hiển thị rõ. Lấy token riêng cho resource Dev và Production, thử silent trước; khi cần tương tác thì hiển thị hành động đăng nhập/cấp quyền để người dùng bấm. Không tự mở popup từ vòng polling.
- Tài khoản đăng nhập phải có quyền export ở nguồn, import/publish ở đích và quyền dữ liệu khi chuyển data. Quyền của application user trước đây không tự áp dụng cho tài khoản người dùng. Trước khi lập kế hoạch, kiểm tra WhoAmI ở cả hai môi trường; báo rõ thiếu quyền/consent hoặc lỗi CORS.
- Token và mật khẩu không thuộc manifest, lịch sử job, log hay cấu hình build. Dùng cơ chế cache session của MSAL; không tự ghi token vào IndexedDB.

## Cấu trúc ứng dụng

- Tách logic dùng chung của catalog, dependency, planner, Solution, flow và data khỏi phụ thuộc Node. Không bundle Fastify, SQLite, filesystem, DPAPI hay client_credentials vào frontend.
- Browser Microsoft client nhận access token từ MSAL, giữ allowlist hai Dataverse origin, kiểm tra nextLink, xử lý 401/403/429 và nguyên tắc không tự gửi lại thao tác ghi khi mất phản hồi.
- Dùng Web Crypto cho GUID/hash và Uint8Array/base64 cho ZIP thay Node crypto/Buffer. Tiếp tục chuẩn bị artifact Cloud flow Off và bỏ binding/current value nguồn trong chế độ cấu hình connection sau.
- Browser runtime cung cấp các tác vụ tương đương API hiện có cho giao diện. UI không fetch `/api` hay VITE_API_BASE_URL trong chế độ Pages độc lập. Bản backend/local hiện có được giữ tách biệt để không mất khả năng sử dụng cũ.
- Lưu kế hoạch, lịch sử job, ImportJobId/AsyncOperationId và checkpoint GUID trong IndexedDB. Không chuyển tự động SQLite cũ lên trình duyệt. Phân tách dữ liệu theo tenant và tài khoản đăng nhập; không lưu payload bản ghi, ZIP, token hay giá trị environment variable người dùng nhập.
- Nút Mở Solution đích dùng token trình duyệt tra solutionid tại đích rồi tạo deep link Power Apps. Không gọi route redirect của backend.

## Thực thi và khôi phục

- Điều phối job trong tab đang mở. Khóa theo môi trường đích giữa các tab cùng origin bằng Web Locks cùng trạng thái IndexedDB. Nếu trình duyệt không đáp ứng điều kiện lưu trữ/khóa cần thiết, báo lỗi trước khi cho chuyển.
- Không có worker chạy nền khi đóng tab. Nếu ImportSolutionAsync đã được Microsoft nhận, tác vụ phía Microsoft có thể tiếp tục; app lưu ID trước và tra lại kết quả sau khi mở trang/đăng nhập. Không gửi lại import vì chưa nhìn thấy kết quả.
- Reload/đóng tab giữa một thao tác ghi chưa xác định kết quả phải chuyển sang cần đối chiếu, không tự tạo lại Solution/import/bản ghi. Checkpoint phải được lưu bền vững trước khi chuyển sang bước tiếp theo. Job mất thông tin cấu hình session cần người dùng nhập lại hoặc lập kế hoạch mới; không đoán giá trị.
- Bảo toàn ranh giới hủy, immutable plan hash, kiểm tra lại dependency trước import, publish trước verify, chờ metadata cập nhật và xác minh flow Off.
- Cảnh báo khi rời tab đang làm việc. IndexedDB thuộc trình duyệt hiện tại; xóa dữ liệu trang hoặc dùng máy khác sẽ không có lịch sử/checkpoint. Không có khóa toàn cục giữa nhiều máy; chỉ vận hành một tiến trình chuyển tới cùng môi trường đích.

## Deploy và trải nghiệm

- Workflow Pages độc lập không yêu cầu VITE_API_BASE_URL, backend URL hay Microsoft secret. Tự dùng base_path của Pages, giữ đường dẫn callback/assets đúng cho project Pages và domain riêng.
- Trang chưa đăng nhập hiển thị nút Đăng nhập Microsoft, hướng dẫn Entra và Redirect URI. Không gọi catalog/transfer trước khi có phiên; không hiển thị dữ liệu mẫu thay lỗi.
- Giữ các yêu cầu hiện hành: custom unmanaged, kiểm tra tồn tại đích, dependency, nhiều table/column, data mặc định tắt, flow nguồn giữ nguyên và đích Off, cấu hình connection sau, nút đóng thành công và lịch sử.

## Kiểm chứng và giới hạn bàn giao

- Test MSAL/token provider bằng fixture: token đúng resource, chờ user interaction, logout/account isolation; test transport không gửi token sang origin ngoài allowlist.
- Test adapter IndexedDB và khôi phục import không gửi lại; dữ liệu có checkpoint; khóa hai tab; không replay khi mất phản hồi.
- Chạy các kịch bản tích hợp Table/Column/Flow/data hiện có với Microsoft boundary giả lập trên browser runtime. Kiểm tra artifact Off, deferred connections và mở Solution đích.
- Build Pages và local; xác nhận frontend độc lập không chứa Node imports, backend secret hay request tới `/api`. Kiểm tra callback và assets dưới base path repository.
- Đăng nhập và quyền thực tế chỉ có thể nghiệm thu sau khi người quản trị cấu hình SPA/consent. Chỉ làm kiểm tra đọc WhoAmI/catalog khi có phiên và được cho phép; không tự chọn thành phần hoặc chạy export/import/data để thử.
- Microsoft xác nhận SPA/CORS dùng Dataverse Web API; điều đó không thay thế việc kiểm chứng toàn bộ tính năng chuyển đổi với tài khoản thực tế và chính sách tenant.

## Nguồn kỹ thuật

- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/oauth-cross-origin-resource-sharing-connect-single-page-application
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/quick-start-js-spa
- https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code
