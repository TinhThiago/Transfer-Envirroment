import {broadcastResponseToMainFrame} from '@azure/msal-browser/redirect-bridge';
broadcastResponseToMainFrame().catch(()=>{document.body.textContent='Không hoàn tất đăng nhập. Đóng tab này và thử lại từ ứng dụng.';});
