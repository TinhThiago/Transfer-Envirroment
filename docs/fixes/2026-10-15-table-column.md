# Sửa chuyển Table và bộ chọn Column

## Table

Job người dùng báo lỗi: `ade88e20-17c1-40e4-aa17-d0c371eada29`, bảng `ph_material_consumption_rate` (Định mức tiêu hao vật tư), Production → Dev, không data.

Đã tái hiện phản hồi Microsoft tại Source AddSolutionComponent: `Component ... of Type 1 cannot be added with subcomponents and without the component properties`. Nguyên nhân gửi `IncludedComponentSettingsValues: []` đồng thời include subcomponents. Đã bỏ trường rỗng để giữ properties theo mặc định.

Trong kiểm chứng tiếp theo, ImportSolutionAsync từ chối collection `ComponentParameters: []` với lỗi `Custom state is not set for entity type crmbaseentity`. Chỉ gửi collection này khi có override thật. Lỗi HTTP 4xx rõ ràng được đánh dấu rejected và giữ lỗi gốc thay vì rơi vào vòng poll import chưa tồn tại; timeout/kết quả mơ hồ vẫn được theo dõi an toàn.

Table import đã thành công nhưng kiểm chứng phát hiện thiếu incoming relationship `ph_material_requirement_ph_consumption_rate`: lookup `ph_consumption_rate` thuộc bảng liên quan `ph_material_requirement` đã tồn tại ở đích. Đã bổ sung đóng gói tường minh các relationship và custom unmanaged lookup đi cùng, không chuyển toàn bộ bảng liên quan đã có.

## Kiểm chứng live

- Job hoàn tất: `339f56bd-34af-4d25-84f8-6b4719ce9a67`, status **succeeded**.
- Import cấu trúc ban đầu: `fa320db2-2b33-4e68-b90c-5b3041208a2f`.
- Import bổ sung chỉ lookup + relationship: `91ced728-63bc-4f59-90f3-9bda3a53356b`.
- Worker xác minh table/column và view/form/relationship/key/chart/business rule rồi publish ở Dev.
- Không chuyển data; created/patched/associated đều 0.
- Đã kiểm chứng đóng gói/export Table bằng logic mới với Microsoft thật, bao gồm quan hệ còn thiếu.

## Column

Dropdown chỉ lấy bảng custom unmanaged ở nguồn, đồng thời có logical name tương ứng tại đích. Trước lần chuyển đã kiểm tra chiều Dev → Production: 115 bảng, 0 bảng system/managed lọt vào. Sau khi bảng mới chuyển xong: 116 bảng chung custom unmanaged, vẫn 0 bảng không hợp lệ.

Bộ chọn có ô lọc ngay trong dropdown, tìm tên hiển thị hoặc logical name; hỗ trợ tên tiếng Việt không dấu, Enter để chọn, Escape để đóng, và thông báo không có kết quả. Thay bảng vẫn xóa column selection/kế hoạch cũ.

## Kiểm thử

Đã bổ sung hồi quy cho payload properties, override rỗng, import rejected, incoming lookup/relationship, filter API và hành vi dropdown. Toàn bộ 58 ca PASS, TypeScript/Vite build PASS. Backend cuối đã khởi động lại; hai môi trường kết nối, UI HTTP 200, job succeeded và eligible column còn thiếu của bảng vừa chuyển là 0. Script chẩn đoán tạm đã được xóa, không lưu secret vào file.

Tham khảo: [Microsoft về IncludedComponentSettingsValues](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.addsolutioncomponentrequest.includedcomponentsettingsvalues?view=dataverse-sdk-latest).
