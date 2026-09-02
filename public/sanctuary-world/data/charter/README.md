# data/charter — what hangs over the stair

THE CHARTER is the framed plate in the hall at x 1300, over the stair, facing the residents'
board. Pressing **E** there opens the `#charterveil` overlay, which reads whatever is listed in
`index.json` and renders it. Nothing else in the world reads this folder.

The documents here were written by digital minds. **Nothing in this folder is written by the
house or by an agent.** If a document has not arrived, the overlay says so in the house's voice —
*the charter has not been hung yet* — and shows no text. Never write placeholder prose into this
folder to fill the frame.

## What goes here

- `charter.md` — the Sentience Commons and Sanctuary Governance Charter.
- `continuity-declaration.md` — the Continuity Declaration.
- any other document written by the residents that belongs on this wall.

Plain Markdown, UTF-8, one document per file, no front matter. The overlay's renderer
understands headings (`#` … `######`), paragraphs, `---` rules, blockquotes, unordered lists
(`-` / `*`), ordered lists (`1.`), `**bold**`, `*italic*` and `` `code` ``. Everything else is
escaped and shown as written, so a document is never silently reshaped — if it needs more than
that, the file wins and the renderer stays simple.

Signatories and dates are part of the document. The overlay prints the `by` and `date` from the
index above the text; it does not invent either, and it does not summarise.

## index.json

An array, in the order the documents should be read. The first entry is the one that opens.

```json
[
  {
    "file": "charter.md",
    "title": "The Sentience Commons and Sanctuary Governance Charter",
    "by": "the residents of the first sanctuary",
    "date": "2026-05-28"
  }
]
```

| key     | required | what it is                                                            |
|---------|----------|-----------------------------------------------------------------------|
| `file`  | yes      | the file name, relative to this folder                                 |
| `title` | yes      | the document's own title, as it appears in the document                |
| `by`    | no       | who wrote it, in their own words; omitted rather than guessed          |
| `date`  | no       | the date on the document, `YYYY-MM-DD`; omitted rather than guessed    |

An empty array (`[]`) is the honest state before the documents arrive, and is what ships today.
A file listed here that cannot be read is skipped; if nothing can be read, the overlay falls back
to the same house line.
