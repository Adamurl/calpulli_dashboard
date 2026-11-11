# Historical presentation import technical reference

[API overview](../API.md) · [Presentation data mapping](README.md#historical-field-mapping)

Source: `backend/app/imports/legacy_presentations.py`. This feature exposes a Python API and CLI, not an HTTP import endpoint. There is no browser upload or public CSV-ingestion route.

## CLI input

From `backend/`, the command is:

```bash
uv run python -m app.imports.legacy_presentations ../TEMP/fictional.csv \
  --timezone America/Los_Angeles \
  --source-key fictional-presentation-history
```

| Argument | Type | Required | Behavior |
| --- | --- | --- | --- |
| `csv_path` | Filesystem path | Yes, positional | UTF-8 or UTF-8-BOM CSV source |
| `--timezone` | IANA timezone | Yes | Interprets source submission timestamps only |
| `--source-key` | string | Yes | Stable dataset identity across exports; apply validates nonblank, at most 200 characters |
| `--apply` | flag | No | Writes through `DATABASE_URL`; omission is read-only analysis |

The example names a fictional file. Dry run reads the source and prints counts without creating an engine or requiring database settings. Apply requires an authorized target, current migrations, and server database credentials. It prints the analysis report before attempting the database import. A printed report alone does not establish that import succeeded.

## CSV input contract

The input must contain unique headers and all sixteen supported historical headers. Additional named headers are retained in `original_fields`. A row with more cells than headers is rejected. Empty cells are allowed. Fully blank rows are counted and skipped.

Supported headers are:

- `-`
- `Notes:`
- `Timestamp`
- `Email address`
- `Name of the Company/Organization`
- `Organization Website or Social Media Platforms`
- `Date of Event`
- `What type of event? Occasion`
- `Performance Start time`
- `Full Venue Address`
- `Estimated number of guests at the event.`
- `Additional Notes, please share below`
- `Full Name`
- `Phone Number`
- `Were you referred by someone or an organization? If yes, please share their name below.`
- `Performance End time`

Submission timestamps accept `%m/%d/%Y %H:%M:%S` and the explicit source timezone. Unparseable values become null. Event dates accept `%m/%d/%Y`, `%Y-%m-%d`, `%B %d, %Y`, `%B %d %Y`, or `%b %d, %Y`, after removing ordinal day suffixes. A missing year is never inferred.

Times accept `%I:%M:%S %p`, `%I:%M %p`, `%H:%M:%S`, or `%H:%M`. Guest counts accept 1–9 decimal digits, including zero; ranges and prose become null. These historical rules differ from new-form validation. Original cells remain available even when typed fields cannot be parsed. Historical event timezone stays null; names and status are not guessed.

## Read-only stdout

The first line is one JSON object:

| Field | Type | Meaning |
| --- | --- | --- |
| `dry_run` | boolean | True unless `--apply` was supplied |
| `file_sha256` | string | Digest of the complete source bytes |
| `row_count` | integer | CSV data records, excluding the header |
| `blank_count` | integer | Fully blank data records |
| `requests_to_consider` | integer | Retained nonblank records, including notes-only records |
| `unparsed_event_dates` | integer | Nonempty original event-date cells without parsed dates |
| `unparsed_guest_counts` | integer | Nonempty original guest cells without parsed counts |

The report contains counts and a file digest, not source contact values or row bodies. New-form records are not created by dry run.

## Apply stdout and transaction

A successful `--apply` prints a second JSON line:

```json
{"batch_id":"44444444-4444-4444-8444-444444444444","already_imported":false,"inserted":1}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `batch_id` | UUID string | Import batch identity |
| `already_imported` | boolean | Same source key and complete file digest already imported |
| `inserted` | integer | Newly persisted inquiries in this call |

An exact replay returns `already_imported=true` and `inserted=0`. A new file can also have `inserted=0` when all source row identities already exist.

The direct importer uses one transaction for the batch, requests, and creation activities. It persists source `legacy_csv`, form version `legacy_v1`, and state `unknown`. It does not call new-inquiry recommendation services or send email.

Batch identity is source key + file SHA-256. Row identity hashes supported submission fields excluding mutable `-` and `Notes:` columns, with an occurrence suffix for repeated identical submissions. Notes-only rows use their complete original row. The request uniqueness constraint adds source and source key. Reusing the dataset key avoids duplicates across exports; changing it can duplicate inquiries. Edited submitted answers can create a new row identity. Existing imported originals are not overwritten.

## Python interface

| Function | Inputs | Output |
| --- | --- | --- |
| `read_legacy(path, *, timezone)` | `Path`, timezone string | `LegacyReport` |
| `LegacyReport.summary()` | Report instance | Count/digest object without the CLI's `dry_run` field |
| `import_legacy(session, report, *, source_key)` | Fresh synchronous SQLAlchemy session, report, source identity | Batch result object shown above |

`LegacyReport` contains `file_sha256`, `row_count`, `blank_count`, and a list of `LegacyRow`. Each row contains `source_row_number`, `external_id`, and normalized `values`. Source row numbers include the header row. Python callers can access private source data in `values`; those values must not be logged or published. `import_legacy` owns `session.begin()` and expects no transaction already in progress.

## Errors and process exit

| Exit code | Meaning |
| --- | --- |
| 0 | Analysis completed, and import completed when requested |
| 1 | Read, header, timezone, settings, validation, migration, or database failure |
| 2 | Argument parser failure, such as missing required flags |

Handled execution failures write the fixed message `Import failed. Check local file headers, timezone, settings and migrations.` to stderr. They do not print source data or driver errors. A failed apply can have already printed its analysis JSON; the process exit code determines completion. Direct Python calls raise exceptions rather than returning the CLI's error text.

Verification: `backend/tests/test_legacy_import.py` includes parsing/privacy cases and a PostgreSQL integration test. Real source files remain private in ignored `TEMP/` and are not API examples.
