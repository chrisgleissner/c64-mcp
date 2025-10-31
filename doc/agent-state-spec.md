# c64bridge — Agent State Specification

This specification defines how the **c64bridge** agent stores and manages its persistent **task** and **session** state.

A **task** is the fundamental unit of work executed by the agent. There are two task types:

- **Foreground tasks** — short-lived, single-execution operations (e.g., extract sprites from RAM).  
- **Background tasks** — long-running, periodic operations (e.g., sample memory every second).

---

## 1. Directory Layout

All state is stored under the user’s home directory (`~/.c64bridge/`).

```text
~/.c64bridge/
 ├─ tasks.json                  # global registry of all tasks (foreground + background)
 └─ tasks/
     ├─ background/             # background (recurring) tasks
   │   └─ <taskId>/           # e.g. 0001_read
     │       ├─ task.json
     │       ├─ result.json
     │       └─ log.txt
     └─ <taskId>/               # foreground (one-shot) tasks
         ├─ task.json
         ├─ result.json
         ├─ artifacts/          # optional outputs (e.g., sprites, dumps)
         └─ log.txt
```

### Task ID Convention

Each task folder name equals its **`task.id`**, constructed as:

```text
<4-digit counter>_<task.name>
```

Example:

```text
0001_extract_sprites
0002_extract_sprites
0003_extract_ram
```

Counters increment per new task creation (shared across both task types).  
All background tasks are placed under `tasks/background/`, all foreground tasks under `tasks/`.

---

## 2. Task Types

### Foreground Tasks

- Short-lived, synchronous operations that run once and complete quickly.  
- Used for “extract” or “analyze” style commands where the user requests data immediately.

Examples:

- **Extract all sprites from RAM**  
  → Reads sprite data from `$2000`–`$3FFF`, decodes shapes, saves PNGs and binary blobs to  
  `~/.c64bridge/tasks/0001_extract_sprites/artifacts/sprites/`.
- **Extract RAM region to file**  
  → Dumps a range of memory into a `.bin` or `.hex` file for later inspection.

A foreground task executes once and then transitions from `running → completed` or `running → error`.  
No repetition or scheduling logic applies.

---

### Background Tasks

- Long-running, recurring operations that execute periodically.  
- Used for sampling, monitoring, or repeated execution of a fixed operation.

Examples:

- Read C64 memory every second for 1 minute.  
- Poll the C64 screen until specific text appears.  
- Periodically capture state for regression detection.

Background tasks have an interval and optional maximum iteration count.

---

## 3. tasks.json — Global Task Registry

This file tracks all tasks, regardless of type.  
It is updated atomically after each task start, update, or completion.

```json
{
  "tasks": [
    {
      "id": "0001_extract_sprites",
      "name": "extract_sprites",
      "type": "foreground",
      "operation": "extract_sprites_from_ram",
      "args": { "persistArtifacts": true },
      "status": "completed",
      "startedAt": "2025-10-27T11-42-03Z",
      "updatedAt": "2025-10-27T11-42-05Z",
      "stoppedAt": "2025-10-27T11-42-05Z",
      "lastError": null,
      "folder": "tasks/0001_extract_sprites"
    },
    {
      "id": "0002_read",
      "name": "read",
      "type": "background",
      "operation": "read",
      "args": { "address": "$0400", "length": 256 },
      "intervalMs": 1000,
      "maxIterations": 60,
      "iterations": 60,
      "status": "completed",
      "startedAt": "2025-10-27T11-45-00Z",
      "updatedAt": "2025-10-27T11-46-00Z",
      "stoppedAt": "2025-10-27T11-46-00Z",
      "lastError": null,
      "folder": "tasks/background/0002_read"
    }
  ]
}
```

### Field meanings

| Field | Type | Description |
|--------|------|-------------|
| `id` | string | Unique folder name (`0001_extract_sprites`). |
| `name` | string | Logical name (user-assigned). |
| `type` | string | `"foreground"` or `"background"`. |
| `operation` | string | Operation performed (`read`, `write`, `extract_sprites_from_ram`, etc.). |
| `args` | object | Operation-specific arguments. |
| `intervalMs` | number \| undefined | Interval between runs (background only). |
| `maxIterations` | number \| undefined | Total iterations before stop (background only). |
| `iterations` | number \| undefined | Iterations completed (background only). |
| `status` | string | `"running"` \| `"completed"` \| `"stopped"` \| `"error"`. |
| `startedAt` | string | Timestamp (`YYYY-MM-DDTHH-mm-ssZ`) of first run start. |
| `updatedAt` | string | Timestamp of last state change. |
| `stoppedAt` | string \| null | Timestamp when finished or stopped. |
| `lastError` | string \| null | Error message if failed. |
| `folder` | string | Path of the task folder relative to `~/.c64bridge/`. |

---

## 4. task.json — Individual Task State

Each task’s folder contains a standalone `task.json`, mirroring its registry entry plus any additional metadata.

```json
{
  "id": "0001_extract_sprites",
  "name": "extract_sprites",
  "type": "foreground",
  "operation": "extract_sprites_from_ram",
  "args": { "persistArtifacts": true },
  "status": "completed",
  "startedAt": "2025-10-27T11-42-03Z",
  "updatedAt": "2025-10-27T11-42-05Z",
  "stoppedAt": "2025-10-27T11-42-05Z",
  "resultPath": "tasks/0001_extract_sprites/result.json"
}
```

---

## 5. result.json — Structured Task Output

Optional file describing high-level output of a task.

Example for **foreground** sprite extraction:

```json
{
  "id": "0001_extract_sprites",
  "type": "task",
  "name": "extract_sprites_from_ram",
  "created": "2025-10-27T11-42-03Z",
  "completed": "2025-10-27T11-42-05Z",
  "status": "completed",
  "summary": {
    "spriteCount": 8,
    "spriteAddresses": ["0x2000", "0x2080"]
  },
  "artifacts": {
    "spritesDir": "artifacts/sprites/"
  }
}
```

---

## 6. session.json — Session Summary (optional)

Sessions are logical groupings of tasks run in the same time window.  
This file is optional and only created if session tracking is enabled.

```json
{
  "sessionId": "2025-10-27T11-42-00Z",
  "created": "2025-10-27T11-42-00Z",
  "ended": null,
  "status": "active",
  "tasks": [
    { "id": "0001_extract_sprites", "type": "foreground" },
    { "id": "0002_read", "type": "background" }
  ]
}
```

---

## 7. Update & Persistence Model

- **In-memory source of truth:** `TASKS: Map<string, Task>`
- **On-disk persistence:** `~/.c64bridge/tasks.json`
- On startup:
  - `ensureTasksLoaded()` loads `tasks.json`.
  - If missing, an empty file is created.
- On every task state change:
  - Update `tasks.json` (atomic rewrite).
  - Write or update the per-task `task.json` and optional `result.json`.
- **Timestamps:** All stored as UTC strings in `YYYY-MM-DDTHH-mm-ssZ` format.

---

## 8. Summary

| Concept | Description | Example |
|----------|--------------|----------|
| **Foreground Task** | One-shot, short operation returning immediate data (e.g., extract sprites, read memory once). | `0001_extract_sprites` |
| **Background Task** | Recurring scheduled operation (e.g., read memory every second). | `0002_read` |
| **Task Folder** | Directory under `tasks/` (foreground) or `tasks/background/` containing JSON state and logs. | `~/.c64bridge/tasks/0001_extract_sprites/` |
| **Registry File** | Global view of all tasks. | `~/.c64bridge/tasks.json` |
| **Session Summary** | Optional grouping of related tasks run during a session. | `~/.c64bridge/sessions/<id>/session.json` |

---

**This specification is authoritative for all task persistence and state tracking in c64bridge.**
