# Đặc tả app chuyển đổi môi trường Power Platform

Ngày: 15/10/2026. Trạng thái: chờ người dùng duyệt bản đặc tả.

## 1. Mục tiêu và phạm vi đã thống nhất

App nội bộ tiếng Việt gồm ba trang Table, Column và Power Automate (Cloud flow, không phải Power Query Dataflow). Chuyển được cả Dev → Production và Production → Dev. Người dùng lựa chọn thành phần, xem kết quả kiểm tra trước khi chạy và theo dõi công việc đến khi hoàn tất hoặc có lỗi rõ ràng.

Dev: https://phuochungdev.crm5.dynamics.com

Production: https://phuochung1.crm5.dynamics.com

Tenant và client ID lấy từ cấu hình backend đã cung cấp trong phiên. Client secret không được ghi vào tài liệu, mã nguồn, log, trình duyệt hoặc Git. Cung cấp qua biến môi trường của tiến trình backend. File cấu hình mẫu chỉ chứa placeholder.

UI tham chiếu: https://ph-ui-library.khoitran.chatgpt.site/#data. Chưa kiểm tra trực quan được trang mẫu; phải đọc/quan sát mẫu trước khi chốt giao diện, không tuyên bố đã khớp mẫu khi chưa đối chiếu.

## 2. Phương án và kiến trúc

Chọn web app có backend riêng thay vì gọi Microsoft trực tiếp từ trình duyệt (lộ secret) hoặc chỉ làm giao diện mô phỏng (không thực hiện chuyển đổi). Cấu hình Dataverse chuyển qua unmanaged Solution export/import để giữ cấu trúc thành phần và kiểm tra phụ thuộc; không dựng lại từng form/view thủ công.

Đề xuất triển khai React + TypeScript cho frontend, Node.js + TypeScript cho API và worker; SQLite lưu job, tiến trình và checkpoint trên cùng máy chủ. Chạy local trước, backend bind loopback mặc định. Nếu triển khai ra mạng phải có lớp đăng nhập và giới hạn người được phép sử dụng trước khi mở truy cập. Không tự xuất bản endpoint chuyển môi trường công khai.

Các module: cấu hình/xác thực; Dataverse client; đọc metadata và so sánh; phân tích phụ thuộc; đóng gói và nhập Solution; chuyển dữ liệu; Cloud flow và ánh xạ; hàng đợi job; giao diện. Microsoft token chỉ lưu trong bộ nhớ, phân tách theo resource/environment.

## 3. Luồng giao diện chung

Sidebar chứa ba trang. Mỗi trang có bộ chọn nguồn/đích, nút đổi chiều, trạng thái kết nối, tìm kiếm, bảng chọn thành phần, bản tóm tắt và nút kiểm tra/chuyển. Nguồn và đích không được trùng nhau. Đổi môi trường hoặc bảng sẽ xóa lựa chọn và kết quả kiểm tra cũ.

Trạng thái tải, rỗng, mất quyền và lỗi đều có thông báo riêng. Tên hiển thị đi cùng logical/schema name để tránh chọn nhầm. Không dùng dữ liệu giả như dữ liệu live khi kết nối thất bại.

Trước khi ghi: hiển thị nguồn, đích, thành phần, phụ thuộc và tùy chọn dữ liệu. Backend kiểm tra lại trạng thái đích ngay trước khi chạy để tránh sử dụng kết quả so sánh cũ. Chỉ một job ghi trên một môi trường đích tại một thời điểm.

## 4. Trang Table

Chỉ cho chọn bảng có IsCustomEntity=true và IsManaged=false ở nguồn, chưa tồn tại theo logical name ở đích. Cho phép chọn nhiều bảng. Bảng không hợp lệ có lý do và không chọn được.

Phân tích đầy đủ dependency graph, khử trùng và xử lý chu trình. Các bảng custom unmanaged phụ thuộc còn thiếu ở đích được hiển thị trong hộp thoại, gồm phụ thuộc bắc cầu. Đồng ý sẽ thêm vào gói; từ chối sẽ không chuyển các bảng đã chọn cần chúng. Các bảng đã chọn độc lập còn lại chỉ tiếp tục khi người dùng duyệt danh sách cập nhật.

Không sao chép bảng system hoặc managed. Theo giả định người dùng, chúng có sẵn ở hai bên; vẫn kiểm tra thành phần bắt buộc cụ thể ở đích. Nếu thiếu thành phần system/managed hoặc thành phần ngoài phạm vi thì chặn phần bị ảnh hưởng và nêu rõ, không bỏ qua dependency lỗi.

Gói Solution phải bao gồm toàn bộ tài sản có thể chuyển của bảng: column, relationship, view, form, key, chart, business rule và các thành phần con được Dataverse hỗ trợ. Không hiểu “toàn bộ” là mang theo thành phần managed không thể export hay tùy ý kéo cả ứng dụng/plugin. Phụ thuộc ngoài bảng phải được liệt kê; nếu không được hỗ trợ hoặc chưa có ở đích thì chặn và giải thích.

Solution tạm có tên duy nhất theo job, được ghi nhận để dọn dẹp. Không xóa bảng hay giải pháp do người dùng sở hữu. Chỉ dọn container Solution tạm do app tạo; việc xóa container unmanaged không được dùng như rollback thay đổi đã nhập.

## 5. Chuyển dữ liệu

Checkbox “Chuyển data” mặc định tắt; bật thì chuyển dữ liệu của mọi bảng trong gói đã duyệt, sau khi cấu hình nhập thành công. Đọc đủ trang, ghi theo batch giới hạn, giữ GUID khi được hỗ trợ. Retry chỉ áp dụng cho lỗi tạm thời và tôn trọng Retry-After; trước khi ghi lại phải kiểm tra ID để tránh bản ghi trùng.

Tạo bản ghi và gán lookup thành hai pha để hỗ trợ quan hệ vòng. Sau đó chuyển liên kết N:N được hỗ trợ. Không giả định GUID của user, team, business unit hay bản ghi system giống nhau giữa hai môi trường. Cho phép ánh xạ tham chiếu; dùng định danh duy nhất kiểm chứng được, hoặc yêu cầu lựa chọn rõ ràng. Chặn bước dữ liệu nếu còn tham chiếu bắt buộc chưa giải quyết; lookup tùy chọn cũng không được âm thầm bỏ mất.

Column tính toán, rollup, read-only và trường hệ thống không ghi trực tiếp; báo cáo các trường do đích tự tính/tạo. File, image, activity, bảng ảo và loại bảng đặc biệt phải được kiểm tra khả năng trước khi chạy. Nếu adapter chưa hỗ trợ thì chặn lựa chọn chuyển data cho bảng đó và nêu lý do, không báo đã chuyển toàn bộ dữ liệu.

Theo dõi số đọc/tạo/bỏ qua/thất bại và checkpoint. Có trạng thái thành công một phần khi cấu hình đã nhập nhưng dữ liệu lỗi. Hủy dừng ở ranh giới thao tác an toàn; không hứa hoàn tác transaction xuyên môi trường. Chạy lại tiếp tục theo checkpoint và không ghi đè dữ liệu có sẵn ngoài job.

## 6. Trang Column

Chọn đúng một bảng tồn tại ở cả hai môi trường. Sau đó mới tải danh sách column. Chọn nhiều column custom unmanaged có thể chuyển, tồn tại ở nguồn và chưa có logical name tại đích. Không chọn primary ID, trường tự sinh hoặc thành phần hệ thống không thể chuyển độc lập.

Dùng segmented Solution chỉ chứa column đã chọn và các thành phần phụ thuộc bắt buộc đã được hiển thị/duyệt. Không tự chuyển data, view, form hoặc column ngoài lựa chọn. Lookup/choice/calculated column phải kiểm tra relationship, global choice hoặc dependency của công thức; còn thiếu dependency chưa được phép thêm thì chặn và giải thích.

## 7. Trang Power Automate

Liệt kê Cloud flow nguồn với trạng thái solution-aware, tên và ID. Bản đầu chuyển flow solution-aware; flow ngoài Solution hiển thị hướng dẫn thêm vào Solution trước, không giả vờ chuyển được bằng cùng cơ chế. Cho phép chọn flow cần chuyển và kiểm tra phụ thuộc như child flow, connection reference, environment variable và custom connector.

Flow đã tồn tại ở đích được nhận diện theo định danh thành phần và không ghi đè trong bản đầu; thông báo rõ. Không so khớp chỉ bằng tên hiển thị.

Cho ánh xạ connection reference tới connection có quyền dùng ở đích và nhập giá trị environment variable. Không sao chép OAuth credential hoặc secret của connector. Nếu service principal không thể liệt kê/xác thực connection qua API hỗ trợ, cho nhập ID connection và kiểm tra quyền trong bước import; không tuyên bố client secret Dataverse đủ cho mọi connector.

Flow mới phải ở trạng thái tắt trước khi bàn giao. Không dựa vào mặc định import vì Microsoft có thể khôi phục trạng thái bật của flow nguồn. Triển khai phải chọn và kiểm chứng cơ chế ngăn tự kích hoạt ngay khi import mà không tắt/sửa flow gốc; nếu không bảo đảm được thì chặn chuyển và báo giới hạn. Kiểm tra trạng thái đích sau import và hiển thị liên kết kiểm tra kết nối. App không tự bật flow.

## 8. API, job và xử lý lỗi

API cung cấp kiểm tra kết nối, danh sách bảng/column/flow, so sánh nguồn đích, tạo kế hoạch transfer, tạo job từ kế hoạch đã duyệt và đọc trạng thái job. Môi trường chỉ lấy từ allowlist Dev/Production; không nhận URL tùy ý từ client.

Kế hoạch có ID, hash nội dung và thời hạn; backend không tin danh sách component do frontend gửi lại. Job có idempotency key và lưu manifest, bước đang chạy, import job ID, checkpoint dữ liệu, lỗi đã che thông tin nhạy cảm. Khởi động lại tiến trình phải tra trạng thái import cũ trước khi quyết định thử lại.

Các trạng thái: queued, checking, awaiting-input, exporting, importing, copying-data, verifying, succeeded, partial, failed, cancelled. Lỗi phân biệt: xác thực, thiếu quyền, dependency, xung đột đích, throttling, import thất bại, ánh xạ chưa đủ và dữ liệu lỗi.

Không log token, secret, payload bản ghi hoặc giá trị environment variable nhạy cảm. Log chỉ lưu metadata vận hành cần thiết. Thành công chỉ được ghi sau khi kiểm tra lại thành phần ở đích và, nếu có, kết quả dữ liệu/trạng thái flow.

## 9. Điều kiện kết nối và triển khai

App registration phải có application user trong cả hai Dataverse environment với quyền đọc metadata, export/import Solution và quyền dữ liệu tương ứng. Đọc metadata thành công không đồng nghĩa đã có quyền import hoặc quyền connector.

Kiểm tra read-only kết nối trước. Kiểm thử ghi live chỉ trên thành phần thử nghiệm được người dùng chọn; không tự chọn bảng production để thử. Lệnh khởi chạy, biến môi trường mẫu và hướng dẫn cấp quyền phải có trong README. Secret đã cung cấp không đưa vào repository hay bản đóng gói.

## 10. Kiểm chứng và tiêu chí nghiệm thu

- Kiểm tra bộ lọc bảng/column, so sánh logical name, dependency bắc cầu/chu trình và từ chối phụ thuộc bằng unit test có tình huống lỗi.
- Kiểm tra job idempotency, timeout/import đang chạy, retry 429 và checkpoint sau lỗi bằng integration test với Microsoft adapter giả lập.
- Kiểm tra dữ liệu lookup vòng, phân trang, GUID system khác nhau, N:N và lỗi một phần.
- Kiểm tra flow có dependency, thiếu connection, environment variable chưa đủ và không tự bật sau chuyển.
- Kiểm tra UI ba trang, thay đổi chiều làm mất lựa chọn cũ, chọn nhiều, checkbox data mặc định tắt, hộp thoại dependency và tiến trình/lỗi bằng thao tác trình duyệt.
- Build/typecheck phải qua. Tách rõ kiểm thử giả lập với xác minh Dataverse thực tế; chưa chạy live thì ghi rõ giới hạn.
- Nghiệm thu live: chọn bảng thử thiếu ở đích; kiểm tra column/form/view/relationship; chuyển dữ liệu khi bật; chuyển column vào bảng chung; chuyển solution-aware flow và kiểm tra trạng thái tắt.

## 11. Tài liệu đối chiếu

- Solution API: https://learn.microsoft.com/en-us/power-platform/alm/solution-api
- Solution segmentation: https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-solution
- Import và trạng thái Cloud flow: https://learn.microsoft.com/en-us/power-automate/import-flow-solution
- Environment variables: https://learn.microsoft.com/en-us/power-apps/maker/data-platform/environmentvariables-power-automate

## 12. Kết quả tự rà soát

Đã phân biệt Cloud flow với Dataflow, cấu hình với dữ liệu, thành công với thành công một phần và bảng custom unmanaged với system/managed. Các loại dữ liệu/API chưa hỗ trợ phải bị chặn rõ ràng trước ghi. Chưa sửa môi trường Microsoft và chưa tạo source app. Thư mục hiện chưa có Git repository nên bản đặc tả được lưu trên filesystem, chưa commit.
