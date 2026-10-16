# Nhật ký triển khai

Plan: `docs/superpowers/plans/2026-10-15-environment-transfer.md`. User duyệt thiết kế, đặc tả, kế hoạch và chọn thực thi trực tiếp.

## Quyết định thực thi

- Tạo nhánh feature/environment-transfer tại thư mục trống được yêu cầu thay vì lồng checkout khác: không có nhánh/source cũ cần bảo vệ. Nếu cần đổi bố trí sau này có thể di chuyển checkout.
- Duy trì ledger tương đương trên PowerShell thay vì helper Bash không portable; chi phí là không có tự động hóa bookkeeping của helper.
- Dùng npm.cmd vì ExecutionPolicy chặn npm.ps1; dùng phiên bản thư viện đã vá sau khi npm audit phát hiện phiên bản đề xuất ban đầu có lỗ hổng.
- Chặn Cloud flow nguồn đang bật trước import. Tài liệu Microsoft xác nhận PublishWorkflows không áp dụng cho Cloud flow; không sửa/tắt flow nguồn tự động. Giới hạn là người dùng phải tắt nguồn hoặc chuẩn bị gói có trạng thái phù hợp trước.
- Thông tin Microsoft client secret chỉ nạp vào runtime qua stdin ẩn; không lưu vào source hoặc file cấu hình. Khởi động lại cần nhập lại.
- Quy trình kiểm chứng ghi live chờ thành phần thử nghiệm được chọn. Không tự chuyển bảng Production để kiểm thử.

## Tiến trình và bằng chứng

1. Cấu hình/HTTP client: 5 ca RED khi module chưa có → GREEN.
2. Catalog: 4 ca RED → GREEN.
3. Planner/dependency graph: 4 ca RED → GREEN; sau đó thêm GUID tuần tự thực tế và kiểm thử lỗi → GREEN.
4. SQLite/Solution/worker: kiểm thử idempotency, checkpoint, unknown import, recovery và partial. Sửa hồi quy idempotency tại HTTP boundary và không coi progress=100 là thành công nếu kết quả không rõ.
5. Data: kiểm thử hai pha lookup vòng, checkpoint và xung đột bản ghi ngoài job; preflight loại unsupported.
6. Flow: kiểm thử source flow active, mapping thiếu; dependency không có parent table được sửa theo hồi quy.
7. UI: 3 ca tương tác ban đầu → GREEN, sau đó kiểm thử phản hồi plan cũ khi chuyển trang tái hiện lỗi → sửa bằng selection revision → GREEN.
8. Build/typecheck và các GET Microsoft live đã chạy; kiểm chứng chi tiết ở `live-verification.md`.

Tại checkpoint trước rà soát độc lập: 36 kiểm thử xanh; thêm ca tài sản con của view/relationship RED → GREEN. Chưa có thao tác ghi môi trường Microsoft. Nhánh đã được commit cục bộ, chưa có remote, merge hoặc public deployment.

## Rà soát độc lập và một lượt sửa

Reviewer riêng chỉ đọc toàn bộ source, plan và spec, không sửa file hoặc truy cập runtime credentials. Sáu phát hiện Important được kiểm tra lại trên code và tái hiện bằng test trước khi sửa:

- Import mất phản hồi: `continues polling a lost import response by its saved ImportJobId` RED → GREEN. Có ImportJobId thì tiếp tục poll, không gửi lại import. Lỗi đọc trạng thái không giải phóng khóa đích khi import chưa rõ kết quả. Thêm tiếp tục job partial đã nhập schema thành công.
- Column phân đoạn: `does not suppress a missing sibling column required by a segmented column` RED → GREEN. Column cùng bảng chỉ được bỏ qua khi chuyển nguyên bảng; sibling còn thiếu được hỏi để thêm.
- Manifest job: `freezes an approved plan after enqueue and retains the accepted hash in the job` RED → GREEN. Store khóa plan đã tiêu thụ, job giữ hash bất biến và worker không tự lấy hash mới.
- Elastic: `requests table type so elastic tables cannot be mistaken for Standard` RED → GREEN. Metadata query lấy TableType thật.
- Environment variable: `uses only supported connection overrides and applies environment values to inactive destination flows after import` RED → GREEN. Bỏ definition override chưa được hỗ trợ; cập nhật current value ở đích sau khi xác minh flow tắt, rồi kiểm tra effective Value.
- Hàng đợi: `keeps old unresolved work in the worker queue beyond the newest 200 history entries` RED → GREEN. Worker dùng toàn bộ unfinished jobs, độc lập lịch sử 200 entries.

Chẩn đoán live bổ sung: dependency loại 6/12 có DependencyType=1, không có bản ghi SolutionComponent ở nguồn và không xuất hiện như dependency của table root trong RetrieveRequiredComponents. Đây là node lifecycle nội bộ, không phải tài sản export độc lập. Test `lets Dataverse manage non-exportable solution-internal nodes while retaining published blockers` RED → GREEN; chỉ bỏ qua node internal không exportable, không bỏ dependency Published. Mã nguồn được đối chiếu loại component thực tế từ SolutionComponent khi có.

Kết quả cuối: `npm.cmd test` 50/50 PASS (15 files), `npm.cmd run build` PASS bao gồm TypeScript, `npm.cmd audit` 0 vulnerabilities. Quét source/build không tìm thấy secret được cung cấp. Các script chẩn đoán tạm và scratch ledger đã được dọn; nhật ký này lưu bền trong Git.

Phát hiện verify tài sản Table được nâng từ Minor lên Important vì có thể báo thành công khi thiếu form/view: `does not report success when a required form or relationship is missing at destination` RED → GREEN. Đã kiểm tra subset các tài sản source ở target, so relationship/key theo schema name và form/view/chart/rule theo ID.

Đã bổ sung đủ bốn transfer API integration fixture scenarios của Task 8; cả bốn qua, không dùng Microsoft thật để ghi.

Final: minor (deferred): thống kê tiến độ data chưa có read/skipped/failed và associated count đầy đủ; UI hiện báo số bản ghi tạo và trạng thái từng bước. Không dùng các counter thiếu để quyết định thành công dữ liệu.

## Phạm vi reviewer chưa kết luận và quyết định giữ giới hạn

- Tương thích export/import live, quyền connector và trạng thái inactive thực tế sau import: chỉ kết luận sau thử nghiệm ghi trên thành phần do người dùng chọn. Chi phí nếu giả định API khác thực tế: job báo lỗi/partial; không tuyên bố đã kiểm chứng live.
- Nội dung gói export đầy đủ: cài DoNotIncludeSubcomponents=false cho Table, verify metadata tài sản ở đích, nhưng chưa kiểm tra ZIP/live import. Chi phí nếu API không mang tài sản như mong đợi: verify báo partial, cần kiểm tra gói Microsoft.
- Giao diện trực quan/responsive: áp dụng tokens và test tương tác, không có browser surface để chụp ảnh. Chi phí nếu bố cục khác mẫu: cần chỉnh CSS sau đối chiếu browser.
- Runtime credential storage: reviewer không truy cập bộ nhớ có secret; tác giả nạp qua stdin ẩn, code chỉ cache trong RAM và đã loại secret khỏi file/log theo thiết kế. Chi phí là phải nhập lại khi server restart.
- Không có base branch/remote trong repository mới; giữ nhánh feature cục bộ, không mở quyết định merge/publish ngoài phạm vi app local đã duyệt.

Handoff: server cuối chạy local tại http://127.0.0.1:3100, cả hai WhoAmI thành công; mẫu Table plan live không blockers/dependencies, job count=0. Không có export/import/data write live. Source nằm trong thư mục người dùng chỉ định, credentials chỉ trong tiến trình hiện tại. Sau restart cần nhập lại secret theo README.
