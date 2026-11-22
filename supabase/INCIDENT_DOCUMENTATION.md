# Incident documentation for web clients

Apply `migrations/20261122130000_incident_documentation.sql` to the linked Supabase project before using the updated LGU app.

Each `incident_documentation` row is keyed by `incident_id`, which references `incident_report.report_id`. The row contains the six form fields, draft/completed status, timestamps, LGU author IDs, and an `attachments` JSON array. The `municipality_id` supports filtering and access control. Assigned LGU staff can read and edit drafts; provincial and national admins can read them. Completed records are read only.

Web clients can query `incident_documentation` with the signed-in Supabase client and join or fetch the matching `incident_report`. Attachment objects contain `storagePath` values in the private `incident-documentation` bucket. Call `supabase.storage.from('incident-documentation').createSignedUrl(storagePath, 3600)` to display or download an attachment; local mobile `uri` and base64 data are not stored in the table.

Older documentation that existed only in a device's AsyncStorage is imported when an LGU user opens that incident's documentation on that device. Records that were never saved to the backend and are no longer present on a device cannot be recovered automatically.
