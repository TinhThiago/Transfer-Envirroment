# Metadata propagation after unmanaged imports

Read-only investigation of job b0ee8cba-c32d-47e5-86de-23c207ff0eb3 found async status 30 and an ImportJob log with successful ph_notification entity, form, view and relationship processing. A later GET EntityDefinitions in Dev returned ph_notification. The worker had failed its first immediate metadata read and stopped before PublishXml.

The worker now publishes before schema verification or data copying, then retries only VERIFY_FAILED read checks at 2, 4, 8 and 16 seconds. A persistent mismatch remains partial; it never resubmits the import. Data writes begin only after schema checks pass. Cancellation is checked between reads.

Microsoft documents that unmanaged imports arrive in draft state and require publication: https://learn.microsoft.com/power-apps/maker/data-platform/import-update-export-solutions

No transfer, retry, import, export, publish or data write was executed against either Microsoft environment during this fix. The old job is retained unchanged. Validation uses mocked Microsoft boundaries.
