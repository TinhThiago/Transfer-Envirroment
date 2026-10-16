# GitHub Pages Microsoft Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy Table, Column và Cloud flow trực tiếp trên GitHub Pages bằng tài khoản Microsoft, không cần backend hay client secret.

**Architecture:** Tách logic chuyển đổi dùng chung khỏi Node; cung cấp Microsoft client nhận delegated token và JobStore IndexedDB cho browser runtime. UI chọn runtime bằng build mode; giữ backend/local riêng. Worker trình duyệt chỉ chạy khi tab mở và không replay thao tác ghi chưa xác định kết quả.

**Tech Stack:** TypeScript, React, Vite, MSAL Browser, Web Crypto, IndexedDB, Web Locks, fflate, Vitest; giữ Fastify/SQLite cho chế độ backend.

**Spec:** `docs/superpowers/specs/2026-10-16-github-pages-microsoft-login.md` (đã duyệt).

## Global Constraints

- Không khởi động lại app local đã được yêu cầu dừng; không chạy chuyển thật trong quá trình phát triển.
- Không tạo, nhúng hoặc dùng client secret trên Pages.
- Tenant/client ID hiện tại là cấu hình công khai; cần SPA Redirect URI và Dataverse delegated `user_impersonation`/consent trong Entra.
- Token và mật khẩu không thuộc manifest, lịch sử job, log hay cấu hình build; không tự ghi token vào IndexedDB.
- Không lưu payload bản ghi, ZIP hay giá trị environment variable người dùng nhập trong IndexedDB.
- Bảo toàn immutable plan, dependency, custom unmanaged, data mặc định tắt, publish/verify, flow nguồn giữ nguyên và đích Off, deferred connection configuration.
- Không có khóa toàn cục giữa nhiều máy; chỉ vận hành một tiến trình chuyển tới cùng môi trường đích.

## Review Focus

1. Popup bị chặn hoặc consent hết hạn khi polling: chỉ báo cần tương tác, không tự mở popup (Task 2).
2. Token đúng tenant nhưng sai resource môi trường/nextLink khác origin: không truyền credential sai nơi (Tasks 1–2).
3. Tab đóng sau POST nhưng trước checkpoint: đối chiếu thủ công hoặc poll ID đã lưu, không replay (Tasks 3–4).
4. Đổi tài khoản/hai tab cùng đích: cách ly lịch sử và giữ khóa trong phạm vi browser (Tasks 3–4).
5. Base path có tên repo/domain riêng: callback, assets và Solution link đúng, không gọi backend (Tasks 5–6).

## File map và interfaces chung

- `src/core/ports.ts`: `Awaitable<T> = T | Promise<T>`, `MicrosoftPort` có `request<T>(env,path,options?):Promise<T>` và `all<T>(env,path):Promise<T[]>`; `JobStorePort` tương ứng các phương thức hiện có của JobStore nhưng trả Awaitable. Không import Node.
- `src/core/`: chuyển các service catalog, plans, solutions, flows, data và jobs từ `src/server/` sang đây; giữ shim re-export ở đường dẫn cũ để giảm thay đổi import/test của backend.
- `src/browser/auth.ts`: `BrowserAuth` gồm `initialize():Promise<void>`, `signIn(env):Promise<void>`, `signOut():Promise<void>`, `getToken(env):Promise<string>`, `getAccount():BrowserAccount|null`, `redirectUri:string`. `BrowserAccount` gồm `id`, `tenantId`, `username`.
- `src/browser/store.ts`: `openBrowserStore(namespace:string):Promise<BrowserJobStore>`, implement JobStorePort, thêm `close():void` và recovery journal của Task 3.
- `src/browser/runtime.ts`: `BrowserRuntime.request<T>(path:string,body?:unknown):Promise<T>`, `start():void`, `stop():Promise<void>`, `openSolution(jobId:string):Promise<string>`.
- `src/web/runtime.ts`: chọn implementation browser/backend, cung cấp `request<T>`, `openSolution(jobId)`, auth state/actions cho UI. Backend mode tiếp tục dùng HTTP helper hiện tại.

---

### Task 1: Core dùng được trong browser và giữ tương thích backend

**Files:** Create `src/core/ports.ts`, `src/core/environments.ts`, `src/core/errors.ts`, `src/core/microsoft/client.ts`, `src/core/binary.ts`; move service tương ứng vào `src/core/{catalog,plans,solutions,flows,data,jobs}/`; modify shims trong `src/server/`, `src/server/app.ts`, tests service hiện có.

**Interfaces:** `DataverseClient(tokenProvider:(env)=>Promise<string>,fetcher?,sleep?) implements MicrosoftPort`; mọi store access đi qua JobStorePort. Planner `get`, `put`, `createPlan`, `resolveDependencies`, `validatePlan` trả Promise<TransferPlan>. Worker `tick():Promise<void>` chờ mọi lần lưu/checkpoint trước bước ghi tiếp theo.

- [ ] RED: thêm `tests/core-browser.test.ts`: import core không cần node:crypto/Buffer; GUID hợp lệ; SHA-256 manifest đổi khi mode/dependency đổi; ZIP Off/deferred cho kết quả tương đương fixture cũ. Test transport chặn nextLink ngoại origin trước khi gọi tokenProvider.
- [ ] Chạy `npm.cmd test -- tests/core-browser.test.ts` và xác nhận FAIL do thiếu core/browser primitives.
- [ ] Tách HTTP request/paging khỏi client_credentials; server wrapper chỉ cung cấp token. Dùng crypto.randomUUID/subtle.digest và Uint8Array/base64. Di chuyển service, đổi client/store sang ports; await Planner và store ở app/worker/data. JobStore SQLite vẫn được phép trả giá trị đồng bộ theo Awaitable.
- [ ] Chạy `npm.cmd test` và `npm.cmd run typecheck`; toàn bộ fixture Table/Column/Flow/data và các test cũ phải PASS. Giữ segmentation chỉ cho Table và payload polymorphic rỗng được bỏ như bản hiện tại.
- [ ] Commit riêng core portability và test liên quan.

### Task 2: Đăng nhập Microsoft và token theo môi trường

**Files:** Create `src/browser/auth.ts`, `src/browser/auth-config.ts`, `auth-callback.html`, `src/browser/auth-callback.ts`, `tests/browser-auth.test.ts`; modify `package.json`, lockfile, `vite.config.ts`, `src/web/env.d.ts`.

**Interfaces:** BrowserAuth ở file map; `AUTH_INTERACTION_REQUIRED` phân biệt với 401/403; `redirectUri` là URL callback cùng origin + Vite BASE_URL. Public config `VITE_MICROSOFT_TENANT_ID`, `VITE_MICROSOFT_CLIENT_ID` có mặc định ID đã có; không có secret.

- [ ] RED: test injected MSAL fixture: getToken Dev/Production dùng scope đúng resource; silent trả token thì không popup; interaction_required không tự gọi popup; signIn chỉ chạy từ hành động user; signOut xóa account; callback nằm dưới `/Transfer-Enviroment/` khi có base đó.
- [ ] Chạy `npm.cmd test -- tests/browser-auth.test.ts`, xác nhận FAIL trước implementation.
- [ ] Tra tài liệu chính thức MSAL Browser hiện hành, cài bản stable và khóa lockfile. Implement PKCE public client, session cache, account selection và callback/redirect bridge theo phiên bản đó. Build callback bằng Vite multi-page input (không để source TS trực tiếp trong public HTML). Không thay đổi Entra tenant qua API.
- [ ] Chạy auth tests + build callback; xác nhận không có client_secret/token trong bundle cấu hình. Hiển thị hướng dẫn user_impersonation/consent và Redirect URI nếu Entra chưa cấu hình.
- [ ] Commit auth và callback.

### Task 3: IndexedDB bền vững, cách ly account và recovery journal

**Files:** Create `src/browser/store.ts`, `src/browser/recovery.ts`, `tests/browser-store.test.ts`; add fake IndexedDB library cho tests; modify JobStorePort nếu cần journal methods; implement cùng journal semantics trong adapter backend để core dùng thống nhất.

**Interfaces:** namespace = tenantId + account.id; tất cả mutation trả Promise chỉ resolve sau transaction commit. Journal `beginWrite(jobId,operationKey):Promise<void>`, `completeWrite(jobId,operationKey):Promise<void>`, `pendingWrites(jobId):Promise<string[]>`. operationKey chứa tên bước/record GUID, không chứa payload/token.

- [ ] RED: lưu rồi reopen thấy job/importId/checkpoint; namespace khác không thấy dữ liệu; consumed plan không đổi hash; lặp idempotency key không tạo job mới. Kiểm tra raw stored JSON không có flowMappings, token, ZIP/payload hay environment variable value.
- [ ] RED: reopen với pending write không được đánh dấu thành công; có ImportJobId thì chỉ được theo dõi, thiếu ID thì cần đối chiếu. Transaction abort không được resolve như đã lưu.
- [ ] Chạy `npm.cmd test -- tests/browser-store.test.ts`, xác nhận FAIL.
- [ ] Implement IDB object stores plans/jobs/checkpoints/journal, giao dịch durable; session-only flowMappings nằm trong runtime memory. Await journal trước mọi POST/PATCH/DELETE có ảnh hưởng trạng thái; không trông chờ beforeunload để lưu checkpoint.
- [ ] Chạy store tests + backend store tests; xác nhận PASS và không có migration tự động từ SQLite.
- [ ] Commit storage và recovery.

### Task 4: Browser runtime và worker an toàn khi tab đóng

**Files:** Create `src/browser/runtime.ts`, `src/browser/locks.ts`, `tests/browser-runtime.test.ts`, `tests/browser-transfer.test.ts`; modify core Worker/Data/Solution để dùng recovery journal trước các thao tác ghi.

**Interfaces:** BrowserRuntime ở file map, dùng BrowserAuth + BrowserJobStore + DataverseClient + core services. Endpoint-shaped dispatcher dùng requestSchema/guidSchema, giữ các tác vụ catalog, plans/dependencies/mappings, jobs/cancel/retry tương đương HTTP app. Web Locks tên tenant + target env, không theo account, tránh hai account cùng browser ghi đích đồng thời.

- [ ] RED: kịch bản fixture Table/no-data, Table/data, Column, Flow/Off/deferred đạt cùng kết quả baseline; caller không gọi fetch('/api'). Tạo job vẫn revalidate plan/dependency.
- [ ] RED: lost import response poll importId cũ không submit lần hai; pending record POST không tự replay; completed checkpoint bỏ qua record đã tạo; interaction_required dừng tại ranh giới và không popup; hai runtime cùng đích chỉ một được ghi; thiếu IndexedDB/Web Locks phải chặn trước write.
- [ ] Chạy `npm.cmd test -- tests/browser-runtime.test.ts tests/browser-transfer.test.ts`, xác nhận FAIL.
- [ ] Implement dispatcher và per-target lock; journal/recovery conservatively yêu cầu đối chiếu khi kết quả ghi không rõ. Worker theo tab; chỉ polling/read recovery sau đăng nhập, không tự chạy lại queued/write khi reopen. `stop` không hủy import Microsoft đã nhận; đăng xuất ngăn thao tác tiếp theo. `openSolution` tra ID tại đích và trả URL maker, không dùng backend redirect.
- [ ] Chạy runtime tests cùng data/worker tests; xác nhận PASS, source flow không bị tắt và destination Off được kiểm tra.
- [ ] Commit runtime/worker.

### Task 5: Giao diện đăng nhập, cấu hình và trạng thái tab

**Files:** Create `src/web/runtime.ts`, `src/web/components/MicrosoftSignIn.tsx`, `tests/browser-ui.test.tsx`; modify `src/web/main.tsx`, `App.tsx`, `api.ts`, `components/JobProgress.tsx`, `PlanReview.tsx`, styles.

**Interfaces:** `VITE_RUNTIME_MODE=browser|backend` chọn implementation bằng import động, để bundle browser không phụ thuộc Node/backend. Runtime API từ file map; backend adapter giữ fetch helper cũ. MicrosoftSignIn gọi các auth action bằng user gesture.

- [ ] RED: chưa đăng nhập không gọi catalog/job APIs; có nút đăng nhập và Redirect URI để copy; hiển thị account/đăng xuất; cần consent ở từng env có nút rõ ràng. Đổi account reset selection/plan/job view trước khi đọc namespace mới.
- [ ] RED: beforeunload chỉ cảnh báo nếu có job chưa xong; thành công vẫn đóng được bằng ×; history giữ checklist; openSolution từ user click mở URL maker, không `/api`. Preserve input/filter/dependency UI hiện tại.
- [ ] Chạy `npm.cmd test -- tests/browser-ui.test.tsx`, xác nhận FAIL.
- [ ] Implement auth gate/runtime selection, lỗi permission/CORS/interaction rõ ràng và trạng thái phải giữ tab mở. Giữ UI PH hiện tại, Table/Column/Flow, data default Off và deferred connections. Không popup đăng nhập từ polling và không reload để giấu lỗi.
- [ ] Chạy UI tests và baseline UI/TablePicker/PlanReview tests, xác nhận PASS.
- [ ] Commit UI.

### Task 6: Pages độc lập, tài liệu Entra và nghiệm thu

**Files:** Modify `.github/workflows/pages.yml`, `vite.config.ts`, `.env.example`, `docs/github-pages.md`, `README.md`; create `tests/browser-build.test.ts` và ghi biên bản verification browser mode.

**Interfaces:** workflow build browser mode + base_path từ configure-pages; chỉ upload dist. Không Validate backend URL và không yêu cầu VITE_API_BASE_URL cho browser mode. Build local/backend mode vẫn được hỗ trợ.

- [ ] RED: test cấu hình Pages không phụ thuộc backend variable; build project base và root/custom-domain base đều chứa index/callback và assets đúng đường dẫn. Kiểm tra dependency graph browser không import Node/Fastify/SQLite/DPAPI/client_credentials; không nhúng secret.
- [ ] Chạy test cấu hình và xác nhận FAIL với workflow backend hiện tại.
- [ ] Sửa workflow chọn browser runtime, cung cấp tenant/client public nếu override; hướng dẫn Entra → SPA Redirect URI → delegated user_impersonation → consent → quyền user cả hai env. App chưa consent vẫn deploy được và hiển thị setup; không hứa tự thay đổi Entra. Ghi rõ IndexedDB/browser scope và giới hạn đóng tab/multi-device.
- [ ] Chạy `npm.cmd test`, `npm.cmd run typecheck`, build browser dưới base repository vào output tạm và build backend/local vào output riêng. Kiểm tra artifact không có backend credential/file runtime, không network `/api` ở browser mode. Không chạy app local hoặc Dataverse transfer thật.
- [ ] Chỉ ghi PASS đã quan sát; đánh dấu live Microsoft sign-in/WhoAmI chưa nghiệm thu nếu chưa có Entra/phiên user. Sửa các lỗi build/test trước khi bàn giao. Commit workflow/docs/verification.

## Review cuối và bàn giao

- [ ] Tự kiểm tra spec coverage và regression checks; một reviewer độc lập theo executing-plans nếu skill execution yêu cầu, không tự tăng số agent.
- [ ] Báo rõ code đã thực hiện, test/build, cấu hình Entra người dùng còn phải làm và những phần live chưa xác minh. Không khởi động local, không push/deploy bên ngoài nếu chưa được yêu cầu cụ thể.

## Self-review kế hoạch

Đã đối chiếu sáu nhóm trong spec: auth/Entra (Task 2, 5–6), core portability (Task 1), persistence/recovery (Tasks 3–4), UI/deploy (Tasks 5–6), giữ tính năng hiện hành (Tasks 1, 4–5), giới hạn nghiệm thu (Task 6). Năm Review Focus có test gắn với task sở hữu. Phương thức thực hiện đã chọn trong hội thoại trước: trực tiếp trong phiên, dùng executing-plans; chờ người dùng duyệt kế hoạch này trước khi viết code.
