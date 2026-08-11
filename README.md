# JioAICloud Local MCP Server

Local Model Context Protocol (MCP) server for managing your **JioAICloud** backups from Cursor: inventory photos/videos/documents, find duplicates, and safely trash duplicates.

> JioAICloud has no public developer API. This server talks to the same private HTTPS endpoints used by [https://www.jioaicloud.com](https://www.jioaicloud.com). Use it only with **your own account**.

## Features

- Auth with Mobile + Passphrase (saved session for day-to-day use)
- First-time OTP helpers when no local session exists yet
- Browse / search backups (photos, videos, documents)
- Create / list / rename / move-into / trash **folder albums**
- List / create native JioAICloud board albums, and **add Drive files** into boards
- Storage quota summary
- Duplicate detection (checksum, else name+size)
- Safe deletes (dry-run by default; trash API)
- Download files and export inventory JSON/CSV

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` (do **not** commit it):

```env
JIOAICLOUD_ID=your-jio-id-or-login
JIOAICLOUD_MOBILE=91XXXXXXXXXX
JIOAICLOUD_PASSPHRASE=your-passphrase
```

Optional for first login only:

```env
JIOAICLOUD_OTP=123456
```

## Run

```bash
npm run dev
# or
npm run build && npm start
```

## Cursor MCP config

Add to your Cursor MCP settings (`mcp.json`):

```json
{
  "mcpServers": {
    "jioaicloud": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/jio-mcp-server"
    }
  }
}
```

On Windows, set `cwd` to your full project path with escaped backslashes, e.g. `"C:\\path\\to\\jio-mcp-server"`.

Put credentials in the project `.env` only (not in `mcp.json`). Run `npm run build` after code changes.

## First login flow

JioAICloud’s web API requires an OTP to create a **new** device session. After that, Mobile + Passphrase (saved under `.session/`) is enough.

1. Call `jio_send_otp`
2. Call `jio_verify_otp` with the SMS code (or set `JIOAICLOUD_OTP` and call `jio_login`)
3. Passphrase unlock runs automatically when 2FA/passphrase is enabled
4. Later sessions: just `jio_login`

You can also call `jio_import_session` with userData JSON exported from the browser’s localStorage if you already have a logged-in web session.

## Tools

| Tool | Purpose |
|------|---------|
| `jio_login` | Establish/refresh session + passphrase unlock |
| `jio_send_otp` / `jio_verify_otp` | First-time device login |
| `jio_unlock_passphrase` | Unlock passphrase 2FA |
| `jio_auth_status` | Session status (no secrets) |
| `jio_import_session` | Import browser userData JSON |
| `jio_logout` | Clear local session |
| `jio_storage_usage` | Quota / used storage |
| `jio_list_files` | List folder contents |
| `jio_list_photos` / `jio_list_videos` / `jio_list_documents` | Media inventories |
| `jio_get_file` | File metadata |
| `jio_search_files` | Keyword search |
| `jio_backup_summary` | Counts/bytes by category |
| `jio_find_duplicates` | Duplicate groups |
| `jio_duplicate_report` | Last duplicate report |
| `jio_delete_files` | Trash by ids (`dry_run` default) |
| `jio_delete_duplicates` | Trash duplicate candidates (`dry_run` default) |
| `jio_download_file` | Download to `downloads/` |
| `jio_export_inventory` | Export JSON/CSV inventory |
| `jio_list_albums` | List folder albums (`kind=folder`) or native boards (`kind=board`) |
| `jio_create_album` | Create folder album or native board album |
| `jio_rename_album` | Rename a folder album |
| `jio_move_to_album` | Move files/folders into a folder album |
| `jio_add_to_board` | Add Drive files into a native board album (`boardId` + `ids`) |
| `jio_delete_album` | Trash folder album(s) (`dry_run` default) |

### Albums notes

- **Folder albums** (`kind=folder`) are normal My Files folders — this is what the organize scripts use (year/month albums under `Photo Albums`).
- **Board albums** (`kind=board`) are native JioAICloud Albums. Create/list work; add existing Drive files with `jio_add_to_board` (`POST /boards/{boardKey}/addition`).
- `jio_delete_album` only supports folder albums (trash). Native board delete is not wired yet.

### Delete safety

- `dry_run` defaults to `true`
- Real deletes require `dry_run=false` **and** `confirm=true`
- Max 50 ids per delete call
- Deletes use the **trash** API (recoverable from JioAICloud Trash)

## Security

- Never paste credentials into chat
- `.env` and `.session/` are gitignored
- Tokens are not printed by auth status tools

## Inspector

```bash
npm run inspector
```

## License

MIT — personal use with your own JioAICloud account.
