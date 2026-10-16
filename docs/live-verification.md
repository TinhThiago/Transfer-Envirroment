# Biên bản kiểm chứng

Ngày: 15/10/2026, múi giờ Asia/Bangkok.

## Đã chạy với Microsoft thật (chỉ đọc)

- Client credentials đã xác thực qua backend, WhoAmI thành công với cả Dev và Production.
- GET catalog Table chiều Dev → Production: 1.019 bảng nguồn, 31 bảng custom unmanaged chưa có ở đích.
- GET bảng chung: 988 bảng có ở cả hai môi trường.
- GET catalog Column của một bảng custom chung: 34 column, 0 column còn thiếu ở đích.
- GET catalog Cloud flow: 59 flow nguồn, 2 flow đạt điều kiện catalog (solution-aware unmanaged chưa có ở đích). Trạng thái Tắt và cấu hình kết nối vẫn phải qua bước preflight riêng.
- POST lập kế hoạch Table đọc metadata/dependencies thành công sau khi sửa validator cho GUID tuần tự Dataverse. Chưa tạo job transfer.
- Kiểm tra cuối sau sửa node nội bộ: một Table thật có planComponents=1, planDependencies=0, planBlockers=[]; cả hai môi trường vẫn kết nối và số transfer job vẫn là 0. Các lần lập kế hoạch chỉ lưu manifest metadata ở máy local, không export/import Solution.
- Trang app local `http://127.0.0.1:3100/` trả HTTP 200 và title đúng.

## Đã kiểm tra bằng code/fixture

Vitest bao gồm cấu hình và giới hạn URL, tách token theo môi trường, 401/403/429, catalog theo logical name/ID, dependency bắc cầu/chu trình/từ chối, stale plan, GUID tuần tự, nhận diện tài sản bảng, SQLite/idempotency/checkpoint, import mơ hồ, data lookup hai pha/trùng GUID, Cloud flow nguồn bật/mapping thiếu, worker recovery/partial và tương tác UI.

Đã bổ sung bốn ca tích hợp đi qua HTTP plan/job, worker thật và Microsoft boundary fixture: Table không data, Table có data, Column và Cloud flow. Đã xác minh loại component, include-subcomponents, đúng một lệnh import và kết quả record/checkpoint.

Lượt rà soát độc lập đã chỉ ra và được sửa bằng ca hồi quy: recovery import bị kẹt, dependency column cùng bảng, hash kế hoạch job, TableType, environment variable override và hàng đợi bị giới hạn bởi lịch sử. Đã nâng bước verify Table để kiểm tra thêm view/form/relationship/key/chart/business rule.

TypeScript và Vite build đã chạy thành công. Phiên bản dependency đã được nâng lên bản vá; npm audit báo 0 vulnerabilities. Bộ kiểm thử cuối gồm 50 ca (15 files), tất cả PASS; kết quả chạy ghi trong nhật ký triển khai.

## Chưa xác minh

**Cập nhật sau phản hồi người dùng:** đã chuyển và verify thành công Table `ph_material_consumption_rate` Production → Dev, không data, cùng lookup/relationship bắt buộc. Chi tiết tại [biên bản sửa Table/Column](fixes/2026-10-15-table-column.md). Các mục “chưa” bên dưới là giới hạn của lượt bàn giao ban đầu; chưa có kiểm chứng live chuyển data hoặc Cloud flow.

- Chưa export/import Solution hoặc tạo/cập nhật bản ghi thật ở Dev/Production. Chưa có thành phần thử nghiệm được người dùng chọn để chạy ghi live.
- Chưa xác minh quyền import/data/connector đầy đủ của application user bằng thao tác ghi. WhoAmI không thay thế các kiểm tra quyền này.
- Chưa chạy Cloud flow import thật hoặc xác minh connection ID thực tế ở đích. Cơ chế bản đầu yêu cầu source flow đang Tắt, dựa trên trạng thái được export/import theo tài liệu Microsoft; không dùng PublishWorkflows=false như bảo đảm cho Cloud flow.
- Không có browser surface khả dụng trong session; chưa kiểm tra ảnh chụp/layout thực tế trên desktop/mobile. Đã đọc design brief/tokens PH UI và kiểm tra tương tác bằng jsdom.

Không coi các kiểm thử giả lập là bằng chứng chuyển live thành công.
