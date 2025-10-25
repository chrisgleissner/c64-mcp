# C64 REST API Reference

Authoritative source: [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html) for devices such as Commodore 64 Ultimate and Ultimate 64.

## Conventions

- Base path: `/v1`.
- URL format: `/v1/<route>/<path>:<command>?<arguments>`.
- Responses are JSON unless noted and **always** include an `errors` array.
- Attachments: `POST` variants accept binary payloads using `multipart/form-data` or `application/octet-stream`.
- Firmware ≥ 3.12 can require `X-Password: <network-password>` on every request; missing/incorrect passwords yield `403`.

## About

| Method | Path | Parameters | Description |
| --- | --- | --- | --- |
| GET | `/v1/version` | – | Returns the REST API version, e.g. `{ "version": "0.1", "errors": [] }`. |
| GET | `/v1/info` | – | Basic device information (product, firmware/core versions, hostname, optional unique ID). |

## Runners

| Method | Path | Parameters | Description |
| --- | --- | --- | --- |
| PUT | `/v1/runners:sidplay` | `file` (path), `songnr?` | Play a SID file from the device filesystem; optional song selection. |
| POST | `/v1/runners:sidplay` | `songnr?` | Play an uploaded SID attachment, optional second attachment for song lengths. |
| PUT | `/v1/runners:modplay` | `file` (path) | Play an Amiga MOD from the filesystem. |
| POST | `/v1/runners:modplay` | – | Play an uploaded MOD attachment. |
| PUT | `/v1/runners:load_prg` | `file` (path) | Reset, DMA-load PRG from disk into memory; does **not** run. |
| POST | `/v1/runners:load_prg` | – | Reset, DMA-load uploaded PRG attachment; does **not** run. |
| PUT | `/v1/runners:run_prg` | `file` (path) | Reset, DMA-load PRG from disk, then run. |
| POST | `/v1/runners:run_prg` | – | Reset, DMA-load uploaded PRG attachment, then run. |
| PUT | `/v1/runners:run_crt` | `file` (path) | Reset with cartridge image from filesystem active. |
| POST | `/v1/runners:run_crt` | – | Reset with uploaded cartridge attachment active. |

## Configuration

| Method | Path | Parameters | Description |
| --- | --- | --- | --- |
| GET | `/v1/configs` | – | List configuration categories. Supports wildcards via query string. |
| GET | `/v1/configs/{category}` | – | List items within a category (wildcards allowed). |
| GET | `/v1/configs/{category}/{item}` | – | Inspect specific config entries (wildcards allowed). |
| PUT | `/v1/configs/{category}/{item}` | `value` | Update a single config item; full path or wildcard selectors accepted. |
| POST | `/v1/configs` | JSON body | Batch update config categories/items using returned JSON shape. |
| PUT | `/v1/configs:load_from_flash` | – | Load saved configuration from non-volatile storage. |
| PUT | `/v1/configs:save_to_flash` | – | Persist current configuration to non-volatile storage. |
| PUT | `/v1/configs:reset_to_default` | – | Restore factory defaults (does not touch saved flash values). |

## Machine Control

| Method | Path | Parameters | Description |
| --- | --- | --- | --- |
| PUT | `/v1/machine:reset` | – | Soft reset; config unchanged. |
| PUT | `/v1/machine:reboot` | – | Restart cartridge + soft reset. |
| PUT | `/v1/machine:pause` | – | Assert DMA pause (halts CPU, timers continue). |
| PUT | `/v1/machine:resume` | – | Release DMA pause. |
| PUT | `/v1/machine:poweroff` | – | Power down (U64 only, response may be absent). |
| PUT | `/v1/machine:menu_button` | – | Toggle Ultimate menu as if pressing the hardware button. |
| PUT | `/v1/machine:writemem` | `address`, `data` (hex) | DMA-write ≤ 128 bytes supplied as hex string. |
| POST | `/v1/machine:writemem` | `address` (hex), binary body | DMA-write attachment beginning at `address`; must not wrap `$FFFF`. |
| GET | `/v1/machine:readmem` | `address` (hex), `length?` | DMA-read; firmware may return binary or base64/array payload. Default length 256 bytes. |
| GET | `/v1/machine:debugreg` | – | Read `$D7FF` debug register (U64 only). |
| PUT | `/v1/machine:debugreg` | `value` (hex) | Write then return the `$D7FF` debug register (U64 only). |

## Floppy Drives

| Method | Path | Parameters | Description |
| --- | --- | --- | --- |
| GET | `/v1/drives` | – | Enumerate internal drives, mounted images, and SoftIEC partitions. |
| PUT | `/v1/drives/{drive}:mount` | `image` (path), `type?`, `mode?` | Mount existing image (`d64/g64/d71/g71/d81`) with mode `readwrite/readonly/unlinked`. |
| POST | `/v1/drives/{drive}:mount` | `type?`, `mode?`, attachment | Mount uploaded image attachment. |
| PUT | `/v1/drives/{drive}:reset` | – | Reset selected drive. |
| PUT | `/v1/drives/{drive}:remove` | – | Eject mounted image; when mounted in unlinked mode it simply drops the link so further writes are discarded. |
| PUT | `/v1/drives/{drive}:on` | – | Power on (or reset) the drive. |
| PUT | `/v1/drives/{drive}:off` | – | Power off the drive (removes it from IEC bus). |
| PUT | `/v1/drives/{drive}:load_rom` | `file` (path) | Temporarily load ROM image from filesystem (16 K/32 K). |
| POST | `/v1/drives/{drive}:load_rom` | attachment | Temporarily load ROM from uploaded binary. |
| PUT | `/v1/drives/{drive}:set_mode` | `mode` (`1541\|1571\|1581`) | Change drive mode; resets and reloads ROM. |

## Data Streams (U64 only)

| Method | Path | Parameters | Description |
| --- | --- | --- | --- |
| PUT | `/v1/streams/{stream}:start` | `ip` (`addr[:port]`) | Start video/audio/debug stream to destination (`video`→11000, `audio`→11001, `debug`→11002 if port omitted). Starting video stops debug. |
| PUT | `/v1/streams/{stream}:stop` | – | Stop the specified stream (`video`, `audio`, or `debug`). |

## File Manipulation

| Method | Path | Parameters | Description |
| --- | --- | --- | --- |
| GET | `/v1/files/{path}:info` | – | Return file metadata (size, extension). Wildcards allowed. *(Alpha status)* |
| PUT | `/v1/files/{path}:create_d64` | `tracks?` (35/40), `diskname?` | Create D64 image at specified filesystem path. |
| PUT | `/v1/files/{path}:create_d71` | `diskname?` | Create 70-track D71 image. |
| PUT | `/v1/files/{path}:create_d81` | `diskname?` | Create 160-track D81 image. |
| PUT | `/v1/files/{path}:create_dnp` | `tracks` (≤255), `diskname?` | Create DNP image; each track has 256 sectors (≤ ~16 MB). |

## Error Handling

- `400`: malformed request (invalid parameters, body, or file attachment).
- `403`: missing or incorrect `X-Password` when network password enforced.
- `404`: route not present on current hardware/firmware.
- `500`: device reported internal failure—inspect `errors` array for details.

## Assets in Repository

- `doc/rest/c64-openapi.yaml` captures the full API surface in OpenAPI 3.1 format for mock generation and tooling.
- Firmware change log: <https://1541u-documentation.readthedocs.io/en/latest/api/changelog.html>
