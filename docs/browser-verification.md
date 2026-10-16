# Browser-only migration verification

Spec and plan: `docs/superpowers/{specs,plans}/2026-10-16-github-pages-microsoft-login.md`.

The browser implementation uses public-client MSAL PKCE/session cache, distinct Dataverse delegated scopes per environment, IndexedDB account namespaces and Web Locks. The workflow builds browser mode without VITE_API_BASE_URL. Local backend code remains available via server import shims and backend runtime mode.

Automated checks cover core/browser binary and SHA-256 primitives, foreign paging rejection, silent token acquisition without automatic popup, sign-in/logout, persistent plans/jobs/checkpoints, idempotency and frozen manifest, recovery journals, account namespace isolation, two-tab target locks, explicit continuation after recovered imports, auth interruption, unsupported browser storage/lock behavior, authentication UI gate, and Table/Table+data/Column/Flow transfer fixtures.

The Vite build test compiles actual browser mode under `/Transfer-Enviroment/`, verifies both HTML entry points reference that base, audits the module graph for `src/server`, `node:` and Vite Node external fallbacks, and checks the Pages workflow no longer requires a backend URL.

Not live-verified: Entra SPA registration, consent, delegated privileges, Microsoft sign-in/popups, actual Dataverse CORS in a signed-in browser, and live transfer operations. Those depend on tenant/user setup. No app server was started and no export/import/data transfer was executed during the browser migration. SQLite history remains separate from IndexedDB.

Operational limitations: keep the tab open; no background server worker; ambiguous source/record writes require reconciliation and are not replayed. Coordination is local to a browser/origin, not a distributed lock across devices. GitHub deployment and Entra changes are not performed automatically by these local code changes.

Final author fix pass after one independent whole-branch review: all four Important findings were reproduced and fixed. Durable per-tenant destination reservations now span account switches and async import polling; the owning account releases completed reservations after reopening. Recovered pre-import jobs can be cancelled. Strict flow jobs offer session-only reentry of the original approved mappings, checked against the immutable plan hash. Atomic write receipts prevent replay between successful record PATCH and subsequent data checkpoint. No Critical findings were reported; no second review was requested.

Final verification: 108 tests in 30 files passed; TypeScript passed; backend-mode build and browser-mode build passed. Browser build uses `/Transfer-Enviroment/` for fixture verification; deployment derives the actual repository base from Configure Pages. Two non-blocking build warnings remain: the browser runtime has mixed static/dynamic imports, and the main browser chunk is about 550 kB minified. Loading performance optimization is deferred.

Execution decisions and costs: the existing feature workspace was preserved with prior fixes in the baseline (review must distinguish that baseline); a native Windows ledger replaced unavailable POSIX/Python helpers (manual audit bookkeeping); browser mutation journaling is enforced at the transport boundary rather than changing SQLite (backend history stays separate); recovery pauses ambiguous work instead of replaying it (manual reconciliation may be needed). New plan hashes use canonical JSON so reentered mappings are independent of property order; browser storage does not migrate old backend SQLite plans. Values for flow configuration remain session-only.
