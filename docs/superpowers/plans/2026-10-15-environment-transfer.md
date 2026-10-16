# Environment Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Xây app chuyển Table, Column và Cloud flow giữa Dev và Production, có kiểm tra phụ thuộc và tùy chọn chuyển dữ liệu.

**Architecture:** React frontend gọi API Node cùng origin. Backend dùng Microsoft client credentials, Dataverse Web API và Solution export/import; SQLite lưu job/checkpoint. Các adapter Microsoft tách khỏi logic kế hoạch để kiểm thử mà không ghi vào môi trường thật.

**Tech Stack:** TypeScript, React, Vite, Node.js LTS, Fastify, SQLite, Vitest, Zod. Xác minh phiên bản tương thích theo tài liệu chính thức và Node cài sẵn trước khi chọn dependency.

**Spec:** `docs/superpowers/specs/2026-10-15-environment-transfer-design.md`

## Global Constraints

- App nội bộ tiếng Việt gồm ba trang Table, Column và Power Automate (Cloud flow, không phải Power Query Dataflow).
- Dev: https://phuochungdev.crm5.dynamics.com
- Production: https://phuochung1.crm5.dynamics.com
- Checkbox “Chuyển data” mặc định tắt.
- Client secret không được ghi vào tài liệu, mã nguồn, log, trình duyệt hoặc Git.
- Không tự bật flow. Không tự xuất bản endpoint chuyển môi trường công khai.
- Mọi tính năng chưa hỗ trợ phải báo giới hạn trước ghi; không dùng dữ liệu giả như dữ liệu live.
- Chưa có Git repository: kiểm tra AGENTS.md và Git trước thực thi; tạo repository nếu cần để lưu source, không tự cấu hình remote.

## Review Focus

1. Unicode trong tên bảng/flow và nhiều đối tượng trùng tên: chọn bằng logical name/ID, không theo display name (Task 2, 7).
2. Đích thay đổi sau khi xem preview: kiểm tra lại, từ chối kế hoạch cũ trước ghi (Task 3, 4).
3. Mất kết nối ngay sau import được chấp nhận: khôi phục job theo import ID, không nhập lần hai (Task 4).
4. Flow nguồn đang bật: phải ngăn kích hoạt từ lúc nhập, không chỉ tắt sau nhập (Task 6).
5. Quyền metadata đủ nhưng quyền import/data/connector thiếu: phân biệt lỗi, không báo kết nối đủ quyền toàn bộ (Task 1, 5, 6).

## File map và hợp đồng chung

`src/shared/contracts.ts`: Zod schemas và kiểu chia sẻ; `src/server/config.ts`, `auth.ts`, `microsoft/http.ts`: cấu hình/token/HTTP; `src/server/catalog/`: metadata; `src/server/plans/`: so sánh/phụ thuộc; `src/server/solutions/`: gói và import; `src/server/data/`: chuyển dữ liệu; `src/server/flows/`: Cloud flow; `src/server/jobs/`: lưu trữ và worker; `src/server/app.ts`: API; `src/web/`: giao diện; `tests/`: kiểm thử adapter/domain/API. `README.md` và `.env.example` là hướng dẫn khởi chạy, `.gitignore` loại secret/database/artifact.

Kiểu chung: `EnvironmentId = 'dev' | 'production'`; `ComponentRef = {id:string, kind:'table'|'column'|'flow'|'dependency', logicalName:string, displayName:string}`; `TransferRequest = {source:EnvironmentId,target:EnvironmentId,kind:'table'|'column'|'flow',ids:string[],tableId?:string,includeData:boolean}`. `TransferPlan = {id:string,hash:string,expiresAt:string,request:TransferRequest,components:ComponentRef[],dependencies:ComponentRef[],blockers:string[],warnings:string[]}`. `Job = {id:string,planId:string,status:JobStatus,step:string,counts:Record<string,number>,error?:{code:string,message:string},importId?:string}`. `JobStatus` dùng đúng các trạng thái trong spec. Thêm kiểu metadata cụ thể tại task sở hữu, export qua contracts; không dùng `any` để né hợp đồng.

### Task 1: Backend cấu hình, kết nối và app chạy được

**Files:** tạo `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.env.example`, `src/shared/contracts.ts`, `src/server/config.ts`, `src/server/auth.ts`, `src/server/microsoft/http.ts`, `src/server/app.ts`, `tests/connection.test.ts`, `README.md`.

**Interfaces:** `loadConfig(env:NodeJS.ProcessEnv):Config`; `getToken(environment:EnvironmentId):Promise<string>`; `MicrosoftClient.request<T>(environment:EnvironmentId,path:string,options?:RequestOptions):Promise<T>`; `buildApp(deps:AppDependencies):FastifyInstance`. GET `/api/environments` trả URL allowlist và trạng thái WhoAmI, không trả cấu hình secret.

- [ ] Viết `connection.test.ts`: secret thiếu phải lỗi cấu hình; URL không thuộc allowlist bị từ chối; token cache riêng resource; 401 khác 403; HTTP 429 tôn trọng Retry-After; response/log không chứa token. Metadata đọc được không gán cờ có quyền import.
- [ ] Tạo dependency/test configuration tối thiểu, chạy `npm test -- tests/connection.test.ts`; xác nhận fail do module chưa có.
- [ ] Cài adapter và API theo interfaces; fetch có timeout/retry hữu hạn, chỉ retry thao tác idempotent. Dùng Node LTS tương thích SQLite; bind `127.0.0.1` mặc định. Thêm `npm run dev`, `npm run build`, `npm run typecheck`, `npm test` và README chạy local.
- [ ] Chạy lại test và typecheck; xác nhận PASS, kiểm tra `.env.example` chỉ chứa placeholder. Commit `feat: add secure local backend and environment checks`.

### Task 2: Catalog Table, Column và Cloud flow

**Files:** tạo `src/server/catalog/tables.ts`, `columns.ts`, `flows.ts`, `tests/catalog.test.ts`; mở rộng contracts và app.

**Interfaces:** `listTables(env:EnvironmentId):Promise<TableMetadata[]>`; `listColumns(env:EnvironmentId,tableId:string):Promise<ColumnMetadata[]>`; `listFlows(env:EnvironmentId):Promise<FlowMetadata[]>`. Metadata chứa ID, logical/display name, managed/custom flags, loại thành phần và capability/block reason.

- [ ] Viết test: bảng system/managed không chọn được; bảng tồn tại theo logical name bị loại; bảng cùng display name vẫn độc lập; tên Unicode giữ nguyên; bảng chung mới cho chọn column; primary/read-only/managed column bị chặn; flow ngoài Solution có lý do không chuyển; đọc đủ nextLink.
- [ ] Chạy `npm test -- tests/catalog.test.ts`, xác nhận FAIL.
- [ ] Cài đọc EntityDefinitions, Attributes, workflow metadata bằng API được Microsoft hỗ trợ; xác minh endpoint/query theo docs chính thức. Thêm GET `/api/catalog/tables`, `/columns`, `/flows`, validate query environment/table ID. Không suy ra IsManaged của toàn bộ tài sản con chỉ từ bảng.
- [ ] Chạy test PASS, typecheck; commit `feat: compare environment component catalogs`.

### Task 3: Kế hoạch và dependency graph

**Files:** tạo `src/server/plans/dependencies.ts`, `planner.ts`, `store.ts`, `tests/planner.test.ts`.

**Interfaces:** `createPlan(request:TransferRequest):Promise<TransferPlan>`; `resolveDependencies(planId:string,acceptedIds:string[]):Promise<TransferPlan>`; `validatePlan(planId:string,hash:string):Promise<TransferPlan>`. Dependency reader dùng Microsoft dependency APIs, phân biệt bảng với dependency ngoài bảng.

- [ ] Viết test: A→B→C thiếu thì đề xuất cả B/C; chu trình A↔B không lặp; system/managed đã có không đưa vào gói; thiếu system/managed bắt buộc thì blocker; từ chối B loại A khỏi kế hoạch; bảng độc lập còn lại phải duyệt lại; column lookup/choice/công thức thiếu dependency bị chặn; source=target, ID không thuộc catalog và plan hết hạn bị từ chối; đích xuất hiện thành phần sau preview khiến validatePlan trả `STALE_PLAN`.
- [ ] Chạy `npm test -- tests/planner.test.ts`, xác nhận FAIL.
- [ ] Cài graph traversal có tập visited, canonical manifest/hash và thời hạn 15 phút. Backend lưu manifest, không nhận component manifest thay thế từ client. API POST `/api/plans`, `/api/plans/:id/dependencies` trả kế hoạch cập nhật.
- [ ] Chạy test PASS; commit `feat: plan transfers with explicit dependency decisions`.

### Task 4: Solution và job bền vững

**Files:** tạo `src/server/solutions/package.ts`, `import.ts`, `cleanup.ts`, `src/server/jobs/store.ts`, `worker.ts`, `tests/jobs.test.ts`, `tests/solutions.test.ts`.

**Interfaces:** `buildSolution(plan:TransferPlan):Promise<SolutionArtifact>`; `startImport(artifact:SolutionArtifact,target:EnvironmentId):Promise<{importId:string}>`; `readImport(target:EnvironmentId,importId:string):Promise<ImportResult>`; `createJob(planId:string,hash:string,idempotencyKey:string):Promise<Job>`; `getJob(id:string):Promise<Job>`; `cancelJob(id:string):Promise<Job>`. Artifact chỉ backend truy cập, không chứa credentials.

- [ ] Viết test: table package chọn toàn bộ subcomponents có thể export; column package chỉ chọn column đã duyệt và dependency bắt buộc; không xóa container khác; idempotency key trả cùng job; hai job cùng đích được tuần tự hóa; đích thay đổi thì không ghi; restart sau import accepted dùng import ID cũ; timeout kết quả không rõ không tự import lại; cancellation không hứa rollback.
- [ ] Chạy `npm test -- tests/jobs.test.ts tests/solutions.test.ts`, xác nhận FAIL.
- [ ] Cài SQLite migrations, manifest/checkpoint persistence và worker polling. Dùng Solution API đã kiểm chứng, publisher/container riêng theo job; lưu import ID trước bước tiếp theo. Trường hợp không lấy được ID phải đối chiếu operation tracking trước retry. GET/POST `/api/jobs`, GET `/api/jobs/:id`, POST `/api/jobs/:id/cancel`. Verify metadata đích trước succeeded; cleanup chỉ container tạm của app.
- [ ] Chạy tests PASS và build; commit `feat: execute durable solution transfer jobs`.

### Task 5: Sao chép dữ liệu với lookup và checkpoint

**Files:** tạo `src/server/data/capabilities.ts`, `references.ts`, `copy.ts`, `tests/data-copy.test.ts`; tích hợp worker và kế hoạch.

**Interfaces:** `inspectData(plan:TransferPlan):Promise<DataPreflight>`; `resolveReferences(planId:string,mappings:ReferenceMapping[]):Promise<DataPreflight>`; `copyData(jobId:string,plan:TransferPlan):Promise<DataCopyResult>`. DataPreflight liệt kê supported, blocker, unresolved references và counts; ReferenceMapping chứa source/target table ID và record GUID được validate.

- [ ] Viết test: includeData=false không gọi record API; phân trang đủ; hai lookup vòng được gán sau tạo; N:N tạo đúng liên kết; user/team GUID khác phải ánh xạ; không âm thầm bỏ lookup; read-only/calculated không ghi; file/image/virtual/activity chưa có adapter chặn trước import khi bật data; restart không tạo bản ghi trùng; lỗi 403 dữ liệu sau schema import cho trạng thái partial; existing target record ngoài job không bị ghi đè.
- [ ] Chạy `npm test -- tests/data-copy.test.ts`, xác nhận FAIL.
- [ ] Cài copy hai pha và association, batch hữu hạn, checkpoint từng kết quả, phân loại retry. UI preflight phải chỉ rõ phạm vi unsupported. API POST `/api/plans/:id/references` cập nhật hash/kế hoạch cần duyệt lại. Không ghi đè dữ liệu bên ngoài job.
- [ ] Chạy test PASS; commit `feat: copy supported table data with resumable reference mapping`.

### Task 6: Chuyển Cloud flow và ánh xạ kết nối

**Files:** tạo `src/server/flows/preflight.ts`, `mappings.ts`, `transfer.ts`, `tests/flow-transfer.test.ts`; mở rộng planner/worker.

**Interfaces:** `inspectFlow(plan:TransferPlan):Promise<FlowPreflight>`; `saveFlowMappings(planId:string,mappings:FlowMappings):Promise<TransferPlan>`; `prepareInactiveFlowArtifact(plan:TransferPlan):Promise<SolutionArtifact>`; `verifyInactiveFlows(jobId:string,plan:TransferPlan):Promise<void>`.

- [ ] Viết test: flow ngoài Solution bị chặn; cùng display name khác ID không tính là flow đã có; cùng component ID ở đích không overwrite; child flow/custom connector thiếu phải blocker hoặc dependency đã duyệt; chưa ánh xạ connection/variable thì không import; app user thiếu quyền connector trả lỗi cụ thể; flow nguồn đang bật không được sửa/tắt và artifact đích phải bảo đảm import inactive; không có cơ chế được hỗ trợ thì trả `SAFE_FLOW_IMPORT_UNAVAILABLE` trước import.
- [ ] Chạy `npm test -- tests/flow-transfer.test.ts`, xác nhận FAIL.
- [ ] Tra cứu và thử cơ chế supported để chuẩn bị artifact inactive cùng import settings; không mặc định rằng Dataverse workflow statecode tương đương tắt Cloud flow. Nếu chưa chứng minh được cơ chế ngăn kích hoạt thì giữ blocker rõ ràng, báo giới hạn trong README. Cài connection reference/environment variable mapping, kiểm tra trạng thái đích sau import. Không hứa tự đăng nhập connector bằng app secret.
- [ ] Chạy test PASS; ghi rõ cơ chế đã xác minh hoặc blocker còn lại; commit `feat: transfer solution cloud flows with destination mappings`.

### Task 7: UI ba trang theo mẫu và luồng kiểm tra/chuyển

**Files:** tạo `src/web/main.tsx`, `App.tsx`, `styles.css`, `api.ts`, `components/EnvironmentPicker.tsx`, `ComponentTable.tsx`, `PlanReview.tsx`, `DependencyDialog.tsx`, `JobProgress.tsx`, `ReferenceMapping.tsx`, `pages/TablesPage.tsx`, `ColumnsPage.tsx`, `FlowsPage.tsx`, `tests/ui.test.tsx`, `index.html`.

**Interfaces:** `api` wrapper typed theo contracts; `EnvironmentPicker` nhận source/target/onChange; `PlanReview` nhận plan/onSubmit; mọi submit dùng plan ID/hash và idempotency key, không gửi secret.

- [ ] Quan sát mẫu UI bằng browser được hỗ trợ, ghi lại màu, typography, table, spacing và states trong `docs/ui-reference.md`. Nếu không truy cập được, báo giới hạn và dùng bố cục tạm được gắn rõ, không tuyên bố khớp mẫu.
- [ ] Viết interaction test: ba trang truy cập được; checkbox data mặc định false; chọn nhiều table; chỉ một table trước khi chọn columns; đổi chiều xóa selection/plan; Unicode và display name trùng vẫn chọn đúng ID; từ chối dependency hiển thị danh sách cập nhật; stale plan bắt kiểm tra lại; lỗi kết nối không hiện catalog giả; flow mapping thiếu khóa nút chuyển.
- [ ] Chạy `npm test -- tests/ui.test.tsx`, xác nhận FAIL.
- [ ] Cài giao diện tiếng Việt, responsive, label bàn phím/focus, loading/empty/error và polling job. Render tên/thông báo như text, không chèn HTML do Microsoft trả về. Show progress và partial failure; cancellation có giải thích phần đã thực hiện.
- [ ] Chạy tests PASS, build/typecheck; kiểm tra browser các trang và responsive. Commit `feat: add Vietnamese transfer workspace and job monitoring`.

### Task 8: Kiểm chứng tổng thể và bàn giao

**Files:** tạo `tests/transfer-api.test.ts`, hoàn thiện `README.md`, `docs/live-verification.md`.

**Interfaces:** giữ nguyên API Tasks 1–7; hướng dẫn cấu hình tenant/client ID/client secret và cấp application user; không chứa giá trị secret thật.

- [ ] Viết API integration test nguồn→đích giả lập cho Table không data, Table có data, Column và Flow; kiểm tra dependencies, stale plan, retry, partial và restart. Assert response/job logs không có credential.
- [ ] Chạy `npm test -- tests/transfer-api.test.ts`; sửa lỗi theo nguyên nhân, không giảm assertion để qua test.
- [ ] Chạy `npm test`, `npm run typecheck`, `npm run build`; chỉ báo pass theo output thật. Quét source/artifact để chắc không có secret/token và kiểm tra `.gitignore` cho database, `.env`, temp solution ZIP.
- [ ] Khởi chạy local và kiểm tra ba trang trong browser; kiểm tra kết nối read-only khi secret đã được đưa vào runtime qua cơ chế kín. Không đưa secret vào shell argument/output/file.
- [ ] Ghi `docs/live-verification.md`: bước nào đã chạy bằng fixture, bước nào đã xác minh live, blocker/quyền còn thiếu. Chỉ ghi thử vào thành phần thử nghiệm được người dùng chọn; không tự chọn dữ liệu production. Có blocker thì nêu rõ phần chưa hoàn thành.
- [ ] Cập nhật README lệnh chạy/khôi phục job/giới hạn và commit `docs: document setup and verified transfer capabilities`; bàn giao đường dẫn local, kết quả kiểm thử và giới hạn thực tế.

## Tự rà soát kế hoạch

Đã đối chiếu đủ các phần của spec: kiến trúc/cấu hình (1), metadata (2), phụ thuộc (3), Solution/job/lỗi (4), dữ liệu (5), Cloud flow (6), UI (7), nghiệm thu (8). Năm mục Review Focus đều có ca kiểm tra ở task sở hữu. Các task dùng cùng TransferPlan/Job và các API hợp đồng chung. Không có bước tự triển khai public hay tự chuyển thành phần production. Các thao tác Microsoft cần khả năng API được kiểm chứng trước ghi; kiểm thử giả lập không được coi là bằng chứng live.
