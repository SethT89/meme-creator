# Editor Draft (local, one per user) — Design

## Problem

Unsaved work vanishes whenever the editor screen unmounts (e.g. My Saves and back).
Editor state is plain React state in `EditorPage`; the app has no browser-side
persistence of any kind, and only an explicit Save writes anything (to Supabase).

## Decision

**One local draft per user, stored in the browser (`localStorage`), restored silently.**
Chosen over a server-side draft because there are no logins yet (cross-device buys
nothing), and a local draft needs no expiry job, leaves no orphan uploads and no
gallery clutter. The `creations.status` enum (`draft`|`final`) already exists if
server drafts are wanted once there are accounts.

## What the draft is

The editor's current contents — the template or blank canvas, every layer, the canvas
size/image position — whether that is new work or unsaved edits to a saved meme.
**Exactly one**, ever. A picked template with no edits is still kept (it is "something
in the editor") but never triggers a warning.

Stored as JSON (uploaded images are already public Supabase URLs, so it is a few KB):
`{ version, savedAt, hasEdits, source, savedMeta, layers, baseline, canvasEdited }`.
`baseline` and `canvasEdited` are the editor's own "pristine" snapshot, so a restored
draft behaves exactly as it did — including which actions warn about losing work.
Image layers whose `src` is still a `blob:` URL (an upload in flight) are dropped: that
URL dies with the page.

## Per user

The storage key is `meme-creator:draft:v1:<userId>`. There are no logins yet, so
`src/lib/currentUser.ts` exposes the single hardcoded v1 user (the same id the database
defaults `user_id` to). When auth arrives that one function returns the signed-in user
and drafts separate automatically; signing out should also clear the draft (shared
device privacy). A local draft is per browser — it does not follow a person across
devices; that is what a server draft would add later.

## When it is written

Debounced (~400ms) after any change to source / layers / canvas, plus flushed on
`pagehide` and `visibilitychange: hidden` so closing the tab doesn't lose the last edit.
Not written: while there is no source; for a template until its default captions have
been seeded (else a draft with no layers would restore a template with no captions);
for a freeform canvas with no layers. Nothing ever *clears* the draft merely because
the editor is empty/loading (a page loading `/editor/:id` has `source === null` for a
moment and must not wipe the draft).

## Restoring

Silent — no message. On mount:
- route `/`: restore the draft, whatever it is;
- route `/editor/:id`: restore it only if it is a draft of that same saved meme;
  otherwise load the saved meme normally (any warning happened earlier, see below).
Restoring sets, together: `source`, `savedMeta`, `layers`, the baseline snapshot, the
canvas-edited flag, and marks the template's layers as already seeded so the seeding
step doesn't overwrite them. Expired (older than **30 days**) or corrupt drafts are
ignored and removed.

## What warns / clears

| Action | Draft | Warning |
|---|---|---|
| Close tab, refresh, open My Saves | kept | none |
| Save (new or existing) | now describes saved work: `hasEdits` false | none |
| Export | unchanged | none |
| Clear Canvas | cleared | already confirms today |
| Pick another template, with edits | replaced | already confirms today |
| Pick another template, no edits | replaced | none (nothing to lose) |
| **Open a saved meme from My Saves, with unsaved edits** | cleared, then replaced | **new** confirm; not shown when the draft *is* edits to that same meme (it just restores) |
| Delete the saved meme the draft belongs to | cleared | existing delete confirm covers it |

Save must mark the work as saved (reset the baseline to the saved layers, clear the
canvas-edited flag). Today it doesn't, which would make the new warning fire on work
that was just saved.

## Out of scope

A drafts list, syncing across devices, undo. If the draft's template no longer exists
the canvas is blank and Clear Canvas / picking a template recovers (a hand-managed
catalog makes this rare).

## Interaction with the parked image sweep

Uploaded images a draft references are only referenced *locally*. The server-side sweep
(see uploaded-image-cleanup notes) can't see drafts, so its grace period for "unreferenced"
files must be at least the draft lifetime (**30 days**), not 24 hours — or a returning
user's restored draft would show broken images.

## Testing

Unit: draft storage (round trip, expiry, corruption, version, per-user key, blob layers,
storage unavailable). Integration (EditorPage): restore on `/`; restore on `/editor/:id`
only for the same meme; write debounced; nothing written before seeding; Clear Canvas
clears; Save resets the baseline; restored edits still warn on template switch. Gallery:
new open-confirm, skipped for the same meme; delete clears the draft. Live: leave to My
Saves and return; refresh.
