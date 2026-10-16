# Transfer an enabled source flow as Off

Approved behavior: leave the source workflow state unchanged; normalize only the in-memory exported Solution artifact before import. No live transfer is authorized for validation.

Flow preflight no longer rejects enabled source workflows. Immediately before creating an ImportJobId or sending ImportSolutionAsync, the app opens the ZIP, validates customizations.xml and each approved cloud workflow ID, then sets StateCode=0 and StatusCode=1. The flow definition JSON, IDs, connections and other assets are preserved. Missing/duplicate workflow metadata, unexpected cloud flows, invalid XML/ZIP/JSON or unverifiable states fail with SAFE_FLOW_IMPORT_UNAVAILABLE before submission. The source workflow receives no state update.

PublishWorkflows remains false; this alone is insufficient for cloud flows. The existing destination verification still requires statecode=0 before environment variable mappings and completion. The app never activates the destination flow.

References:
- https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code
- https://learn.microsoft.com/en-us/power-automate/import-flow-solution
- Microsoft packaging example: https://github.com/microsoft/Industry-Links/blob/main/scripts/modules/MsIndustryLinks/package/powerPlatformSolution/PackageWorkflows.psm1

Validation: 69 tests passed; TypeScript and Vite build passed. Integration fixture starts with an enabled source, checks the actual import payload contains Off, then verifies the destination is inactive. Invalid package tests assert no Microsoft request and no ImportJobId. Destination-On verification remains a failure. This change has not been validated through a live Microsoft export/import.
