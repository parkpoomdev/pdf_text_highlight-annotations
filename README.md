# PDF Annotator

A lightweight, client-side PDF annotation tool built with PDF.js and Tailwind CSS. It lets you upload a PDF, select text directly on the rendered pages, and save annotations with replies/notes. Annotations can be copied individually or exported all at once to the clipboard.

## Preview

Below is a preview of the UI:
<img width="1391" height="723" alt="image" src="https://github.com/user-attachments/assets/62eaf99b-3ba1-4ee9-be88-696213219514" />


> The preview shows the left PDF viewer with selectable text and the right panel listing saved annotations with per-annotation actions and reply inputs.

## Features

- Upload and render PDFs fully in the browser (PDF.js)
- Native text selection on top of pages via the text layer
- "Add Comment" floating action when text is selected
- Manage a list of annotations with reply threads
- Copy a single annotation or export all annotations to clipboard
- Clean typography and responsive layout (Tailwind CSS)

## Quick Start

There’s no build step; everything runs client‑side.

Option A — Open directly
1. Clone/download the project and open this folder in VS Code or Explorer.
2. Double‑click `index.html` (or open it in Chrome/Edge/Firefox).
3. Click "Upload PDF" and choose a file.
4. Select text in the PDF and click "Add Comment".

Option B — Serve locally (recommended if your browser blocks workers)
If you see blank pages or console errors about workers/CORS, use a tiny local server:

PowerShell (Python):
```ps1
cd d:\DevSpace\pdf_comments\pdf_-annotations_text_highlight
python -m http.server 5500
```
Then open http://localhost:5500/ in your browser and click `index.html`.

PowerShell (Node.js via npx):
```ps1
cd d:\DevSpace\pdf_comments\pdf_-annotations_text_highlight
npx http-server . -p 5500
```
Then open http://localhost:5500/.

VS Code Live Server:
- Install the "Live Server" extension, open `index.html`, and click "Go Live".

## Folder Structure

- `index.html` — Main app file (UI, logic, and PDF.js integration)
- `assets/preview.png` — Screenshot used in the README preview (add your own screenshot captured from the running app)
- `.gitignore` — Common ignores for macOS/Python/IDE and large artifacts

## Export Format

Exported text is copied in a readable form:

```text
1) Annotated Text:
<first quote>

Comments/Questions:
- <reply 1>
- <reply 2>

2) Annotated Text:
<second quote>
...
```

## Notes

- This tool uses CDN-hosted PDF.js and Tailwind CSS; an internet connection is required.
- Selections are cleaned up to merge line breaks and hyphenated words for better readability.
- All data is in-memory; refreshing the page clears annotations. If you need persistence (localStorage or backend), I can add it.
- If `assets/preview.png` is missing, the preview image will render as a broken link—place a PNG screenshot there after first run.
