# 0003 The portal needs a connection

**Status:** Decided, October 2026.

## Decision

The portal works online only. Roll call included: a teacher taking roll needs a connection.

## What it means for the build

- No offline queue and no sync-on-reconnect. A change is saved to the server or it fails.
- A failed save says so plainly and keeps what the person typed, so they can try again. This
  matters most on Roll call, where a classroom's wifi may drop mid-roll.
