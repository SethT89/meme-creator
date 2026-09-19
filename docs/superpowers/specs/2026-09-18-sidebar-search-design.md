# Sidebar Search — Design

## Overview

Replace the sidebar's "Search All Memes" button + `SearchTemplatesModal` with
an inline search box at the top of the template list that filters the list
live, and replace the modal's name-only substring match with a ranked matcher
that also searches tags and descriptions and tolerates typos.

Today's problems (the motivation): search matches `name` only, ignoring the
`tags` and `description` every template already has; it's a bare substring
test (no multi-word, no typos, no ranking); the modal has no auto-focus, no
Escape, no backdrop-click close, and duplicates the sidebar list.

Out of scope (YAGNI, can follow): tag-filter chips, searching the My Saves
gallery, a `/` focus shortcut, highlighting the matched text, match-reason
badges.

## Matching — `searchTemplates` (pure function)

New `src/lib/templateSearch.ts`:

```ts
searchTemplates<T extends { name: string; tags?: string[] | null; description?: string | null }>(
  templates: T[], query: string): T[]
```

- **Normalize** everything the same way: lowercase, strip diacritics (NFD),
  turn every non-alphanumeric run into a space, split into words. Tags and
  descriptions are tolerated as missing/null (test fixtures and older rows).
- **Empty query** (no words after normalizing) → the input list unchanged, in
  its given order.
- **Every query word must match somewhere** (AND). A template that fails any
  word is dropped.
- **Per query word, per field word**, a match has a quality:
  exact word = 4; word prefix = 3; substring (query word ≥ 3 chars) = 2;
  typo (query word ≥ 4 chars, field word ≥ 4 chars, Damerau/optimal-string-
  alignment distance ≤ 1, or ≤ 2 when the query word is ≥ 8 chars) = 1.
  For the name only, the query word is also tried as a substring of the name
  with spaces removed (quality 2), so "spiderman" finds "Batman Boosts
  Spider-Man".
- **Field weights:** name 3, tags 2, description 1. A word's score is the best
  `weight × quality` across all fields; a template's score is the sum over
  query words.
- **Ranking:** descending score; ties keep the input order. The sidebar passes
  its list already sorted by usage, so equally good matches come out
  most-used first with no extra code.

## Search box — `TemplateSearchInput` + `TemplateSidebar`

- New `src/features/editor/TemplateSearchInput.tsx`: a controlled
  `<input type="search">` (implicit `searchbox` role, `aria-label="Search
  memes"`) with a magnifier icon at the left and an ✕ "Clear search" button
  that appears only when there is text. The browser's own cancel button is
  hidden so there is one ✕. Placeholder "Search memes…". **Escape** clears
  it. **Enter** calls `onSubmit`; **ArrowDown** calls `onArrowDown`.
- `TemplateSidebar` owns the query state; the button and the modal are
  removed. `visible = searchTemplates(templates, query)`; the list renders
  `visible`. The selected template keeps its highlight and description
  wherever it lands.
- **Enter** picks the top result (no-op when there are none). **ArrowDown**
  in the box focuses the first result card; **ArrowDown/ArrowUp** between
  cards move focus; **ArrowUp on the first card** returns focus to the box.
- Picking a template (click or Enter) leaves the query as typed — the chosen
  card stays visible and highlighted, and the ✕ is one click away.
- **Empty state**: when a non-empty query matches nothing, the list shows
  `No memes match "xyz".` with a "Clear search" button.
- **Screen readers**: a visually hidden `role="status"` line announces the
  result count as it changes ("3 memes", "1 meme", "No memes match").
- **Mobile**: the box is the first thing in the drawer's list (same
  `listContent`), and picking still closes the drawer. The query state is
  shared with the desktop column.

`SearchTemplatesModal.tsx` and its test are deleted. `useTemplates()` stays
(`EditorPage` still uses it).

## Testing

- `templateSearch.test.ts`: empty query; single word by name/tag/description;
  multi-word AND across fields; ranking (name > tag > description; exact >
  prefix > substring > typo); typo tolerance and its length thresholds;
  compact-name match ("spiderman"); diacritics/punctuation; ties preserve
  input order; missing tags/description; does not mutate its input.
- `TemplateSearchInput.test.tsx`: renders searchbox with icon/placeholder;
  typing calls `onChange`; ✕ appears only with text and clears; Escape clears;
  Enter/ArrowDown call their callbacks.
- `TemplateSidebar.test.tsx`: the old modal tests are replaced — filters live;
  finds by tag and description; ranks name matches first; empty state and its
  Clear button; Enter picks the top result; arrow-key focus movement;
  count announcement; the search box sits above the list; query survives a
  pick.
- Live browser check: real templates, typo, tag query, keyboard flow, mobile
  drawer.
