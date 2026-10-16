# Configure connections after transferring an Off flow

Approved scope: optional configure-later mode, no Microsoft login UI, no live transfer during implementation.

Plan Review exposes Cấu hình connection sau and saves it through the existing flow-mappings API. The choice is part of the hashed/persisted request and cannot change an enqueued manifest. A changed unsaved choice disables transfer until saved. Strict mode still requires all connection/variable mappings.

Deferred mode sends no connection overrides and writes no environment variable values. ZIP preparation removes source connectionid bindings and environmentvariablevalues while keeping reference/definition metadata; type-381 value components are excluded from packaging and removed from manifest root components. Existing destination references are not cleared. Default values in variable definitions remain and must be checked by the user before activation. Missing dependencies and secret-variable blockers remain enforced.

Destination verification still requires every flow Off and every expected connection reference present; it permits an unbound reference. Completion persists a configuration checklist in job warnings, which remain visible in history after restart. Flow source state is unchanged.

Validation: 74 tests pass across 18 files; TypeScript/Vite build pass. Tests cover absent mappings in deferred mode, strict mode restoration, artifact cleanup, the UI payload, and worker completion with persistent reminders. No live export, import, flow update, mapping write or job retry was performed for this change.
