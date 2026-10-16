# PH Environment Transfer

App web tiếng Việt chuyển Table, Column và Power Automate Cloud flow giữa:

**GitHub Pages không cần backend:** workflow hiện build chế độ `browser`, đăng nhập Microsoft bằng MSAL/PKCE. Không cần `VITE_API_BASE_URL` hay client secret cho Pages. Xem [cấu hình Pages và Microsoft Entra](docs/github-pages.md) trước khi đăng nhập. Phần hướng dẫn secret bên dưới chỉ áp dụng chế độ backend/local cũ.

- Dev: `https://phuochungdev.crm5.dynamics.com`
- Production: `https://phuochung1.crm5.dynamics.com`

Giao diện áp dụng design tokens của [PH UI](https://ph-ui-library.khoitran.chatgpt.site/#data). App chạy trên máy local, backend giữ credentials và chỉ bind `127.0.0.1`.

## Khởi chạy

Cần Node.js 24 LTS trở lên. Trên PowerShell có ExecutionPolicy hạn chế, dùng `npm.cmd` thay cho `npm`.

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run start -- --secret-stdin
```

Nhập client secret khi terminal hiện `Ready for secret on stdin (input hidden).`, nhấn Enter. Với lệnh này secret chỉ ở bộ nhớ tiến trình. Trên Windows, dùng `npm.cmd run start -- --secret-stdin --save-secret` để lưu mã hóa bằng DPAPI của tài khoản Windows hiện tại tại `.runtime/client-secret.dpapi` (đã bỏ qua trong Git). Những lần sau chỉ cần `npm.cmd start`; backend tự khôi phục secret đã lưu. Tenant và client ID mặc định theo app registration đã cung cấp; có thể thay qua biến môi trường. Không dán secret vào lệnh shell, URL hoặc source code.

Mở **http://127.0.0.1:3100**. Giữ terminal chạy. Chỉ phải nhập lại secret khi chưa lưu mã hóa hoặc dùng tài khoản Windows khác. Không có secret thì app vẫn mở và hiển thị hướng dẫn, không hiển thị catalog giả.

Cách khác: cung cấp `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` bằng secret manager/biến môi trường của tiến trình rồi chạy `npm.cmd start`. `.env.example` chỉ minh họa tên biến; app không tự đọc `.env`.

Phát triển: sau khi đã lưu secret mã hóa, terminal 1 chạy `npm.cmd run dev`, terminal 2 chạy `npm.cmd run dev:ui`, mở `http://127.0.0.1:5173`. Backend watch tự đọc lại cấu hình mã hóa khi reload; biến MICROSOFT_CLIENT_SECRET được ưu tiên nếu có.

## Quyền Microsoft

Tạo application user tương ứng app registration trong cả hai môi trường Dataverse. Role cần đọc metadata/dependency/Solution/Cloud flow, tạo và export Solution ở nguồn, import và publish ở đích. Chuyển data cần thêm Read/Create/Write/Append/Append To cho các bảng và quan hệ liên quan.

WhoAmI chỉ xác minh xác thực và truy cập cơ bản, không chứng minh có mọi quyền import/data/connector. Connection của Power Automate phải tồn tại và được chia sẻ/quyền dùng phù hợp ở đích. App không sao chép OAuth credential hoặc tự đăng nhập các connector.

## Sử dụng

1. Chọn môi trường nguồn và đích. Nút ở giữa đổi chiều.
2. **Table:** chọn nhiều bảng custom unmanaged chưa có ở đích. **Chuyển data** mặc định tắt. App đóng gói toàn bộ tài sản bảng có thể export qua unmanaged Solution.
3. **Column:** chọn một bảng custom unmanaged ở nguồn đã có ở cả hai môi trường, rồi chọn các custom unmanaged column còn thiếu ở đích. Ô tìm kiếm ngay trong dropdown lọc theo tên hoặc logical name, hỗ trợ gõ tiếng Việt không dấu. Gói chỉ chứa column đã chọn và dependency đã duyệt.
4. **Power Automate:** chọn Cloud flow solution-aware; flow nguồn có thể đang Bật. App giữ nguyên nguồn, đặt StateCode/StatusCode = 0/1 (Off) trong bản sao gói Solution và kiểm tra flow đích đang Tắt sau import. Gói thiếu thông tin hoặc không xác minh được sẽ bị chặn trước import. Flow đã tồn tại ở đích không bị ghi đè. Cần lập lại kế hoạch cũ đang báo “nguồn phải tắt”.

   Có thể tick **Cấu hình connection sau** ở phần Kết quả kiểm tra, rồi bấm **Lưu và kiểm tra cấu hình**. Khi đó không cần nhập connection ID hay giá trị environment variable trước khi chuyển. App giữ connection reference/định nghĩa biến, bỏ binding connection và current value của nguồn khỏi gói. Sau khi chuyển, flow vẫn Off và lịch sử job liệt kê các mục cần cấu hình/kiểm tra. Mở Solution tại môi trường đích trong Power Automate để gắn connection, kiểm tra cả giá trị mặc định của biến, URL trong flow và chỉ bật khi đã sẵn sàng. Các dependency hoặc biến secret cần xử lý riêng vẫn có thể chặn kế hoạch.
5. Bấm **Kiểm tra chuyển đổi**. Thêm các dependency còn thiếu hoặc từ chối; từ chối sẽ bỏ các lựa chọn cần chúng. Đọc lại danh sách còn lại.
6. Nếu có, nhập GUID đích cho lookup còn thiếu và ánh xạ connection/environment variable. Kiểm tra lại ánh xạ trước khi chuyển.
7. Bấm **Chuyển sang Production/Dev** trong pane kết quả. Chỉ thao tác này tạo job ghi vào đích. Theo dõi tiến trình hoặc mở **Lịch sử chuyển đổi**.

Export sử dụng cấu hình đã publish ở nguồn. App không tự publish thay đổi nguồn. Các dependency ngoài phạm vi không có ở đích sẽ chặn và được liệt kê; không bỏ qua lỗi dependency của Microsoft.

## Chuyển dữ liệu và giới hạn

- Chuyển bản ghi giữ GUID, tạo trước rồi gán lookup và N:N sau để xử lý vòng tham chiếu. Kiểm tra GUID của bản ghi system/user/team ở đích hoặc yêu cầu ánh xạ, không giả định hai bên có cùng ID.
- Chỉ hỗ trợ bảng Standard với các trường dữ liệu thường. File, Image, PartyList, ManagedProperty, activity, virtual và elastic bị chặn trong preflight khi bật data. Không báo đã sao chép toàn bộ cho kiểu chưa hỗ trợ.
- Trường read-only/calculated/rollup do đích tự tính/tạo; không sao chép audit history, lịch sử chạy flow hay credentials connector.
- Bản đầu có giới hạn 50.000 bản ghi mỗi bảng, chạy tuần tự để giữ rõ kết quả/checkpoint. Không phù hợp cho migration dung lượng lớn chưa được kiểm tra riêng.
- Nếu có bản ghi GUID trùng ở đích nhưng không có checkpoint của chính job, app dừng thay vì ghi đè. Nếu lỗi giữa ghi Microsoft và ghi checkpoint, phải đối chiếu bản ghi trước khi tiếp tục.
- Không có rollback transaction xuyên hai môi trường. Cấu hình đã nhập nhưng data lỗi sẽ là **partial**. Hủy chỉ dừng tại ranh giới an toàn; import đã gửi Microsoft vẫn được theo dõi.
- Biến secret của Power Platform cần cấu hình riêng ở đích; app không chuyển chúng. Giá trị environment variable nhập trong UI chỉ lưu bộ nhớ server, không ghi vào SQLite; job flow chưa import bị mất các giá trị này sau restart và cần lập lại kế hoạch.

## Job và khôi phục

SQLite tại `.runtime/transfer.db` lưu job, manifest, import ID và checkpoint GUID, không lưu payload dữ liệu hoặc Microsoft credential. Không xóa database khi đang có job. Khi khởi động lại, app tra import ID cũ thay vì gửi lại import. Một đích chỉ có một job ghi hoặc chờ đối chiếu tại một thời điểm.

`awaiting-input` nghĩa là chưa xác định được kết quả thao tác ghi. Nếu đã có ImportJobId nhưng chưa xác nhận import, worker vẫn tiếp tục tra kết quả chỉ đọc bằng ID cũ và không gửi lại import; job khác cùng đích phải chờ. Dùng ImportJobId/AsyncOperationId trong lịch sử để đối chiếu trong Power Platform. Không sửa database hoặc tự retry import khi kết quả chưa rõ.

Với job `partial` đã xác nhận nhập cấu hình thành công, sửa quyền/lỗi bên ngoài rồi bấm **Thử lại bước còn lại** trong lịch sử. App giữ nguyên import ID và checkpoint, chỉ tiếp tục phần còn lại. Bản ghi đã có ở đích nhưng chưa có checkpoint vẫn cần đối chiếu thủ công; app không tự nhận là bản ghi do mình tạo.

Kế hoạch đã dùng cho job được khóa theo hash đã duyệt; không thể đổi thành phần hoặc ánh xạ trong lúc job chờ/chạy. Lịch sử hiển thị 200 job mới nhất; hàng đợi nội bộ vẫn giữ toàn bộ job chưa hoàn tất để không mất khóa môi trường đích.

Environment variable được cập nhật bằng API Dataverse ở đích sau khi kiểm tra flow nhập vào đang Tắt, rồi đọc lại giá trị có hiệu lực để xác minh. Các biến và connection reference có thể dùng chung với flow khác ở đích; cần kiểm tra phạm vi khi duyệt ánh xạ.

Solution tạm nguồn có tên `phtransfer_<job-id>`. App chỉ dọn container tạm thuộc chính job sau khi thành công, không xóa bảng. Container Solution ở đích được giữ để truy vết. Nếu job lỗi trước cleanup, container nguồn có thể còn lại để điều tra; xóa container unmanaged không phải hoàn tác thành phần đã nhập.

## Kiểm tra

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit
```

Xem [biên bản kiểm chứng](docs/live-verification.md) để phân biệt test giả lập, kiểm tra read-only thật và các phần chưa chạy ghi live. Không tự chọn bảng Production làm dữ liệu thử nghiệm.

App không có đăng nhập nhiều người dùng. Khi chạy remote, backend phải nằm sau cổng truy cập có xác thực và ổ đĩa SQLite bền vững; CORS không phải xác thực. Xem [hướng dẫn GitHub Pages + backend HTTPS](docs/github-pages.md) để cấu hình workflow deploy giao diện, VITE_API_BASE_URL và backend. Mặc định local vẫn giữ nguyên.

## Tham khảo kỹ thuật

- [Solution API](https://learn.microsoft.com/en-us/power-platform/alm/solution-api)
- [Cloud flow API và giới hạn PublishWorkflows](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code)
- [Trạng thái flow sau import](https://learn.microsoft.com/en-us/power-automate/import-flow-solution)
