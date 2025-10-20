# Ultimate 64 REST API Notes

Source: [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html)

## Runners

### `POST /v1/runners:run_prg`
- Uploads a PRG payload and immediately starts execution.
- Body: binary PRG data (`application/octet-stream`).
- Response: JSON payload describing execution status.

## Machine Memory

### `GET /v1/machine:readmem`
- Reads memory from the machine.
- Query parameters:
  - `address` – start address in hexadecimal (e.g. `0400`).
  - `length` – number of bytes to read.
- Response: JSON map with a `data` field containing bytes either as an array or base64 string, depending on firmware version.

## Machine Control

### `PUT /v1/machine:reset`
- Performs a soft reset of the machine.
- No body required.
- Response: JSON record confirming the reset request.

## Authentication

- Default firmware ships with REST API enabled within the local LAN only.
- If authentication is enabled, provide the API token via standard HTTP `Authorization` headers.

## Error Codes

- `400` – invalid parameters or malformed payload.
- `404` – endpoint not available on the specific hardware.
- `500` – device reported an internal error; check machine state.

## Useful Links

- Full documentation: <https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html>
- Changelog: <https://1541u-documentation.readthedocs.io/en/latest/api/changelog.html>
