# Aquabears Swimmer Development Review

A phone-friendly, installable app for coaches. Works offline after its first complete online load. No accounts, server database, analytics or external runtime services.

## Open and install

App address once GitHub Pages is enabled: **https://johnweaver22.github.io/Progress-Report/**

- Android: open the address in Chrome, wait for **Offline ready**, then choose **Install app**.
- iPhone / iPad: open it in Safari, use **Share → Add to Home Screen** and enable **Open as Web App** if offered.
- Open the installed app from the home screen. Swimmer management, reviews and PDF export all work offline.

This app has its own explicit manifest ID (`/Progress-Report/`), scope and valid 192/512px PNG icons. Its service worker only removes its own versioned caches, leaving the other swimming apps untouched.

## Coach workflow

1. Add a swimmer's first name, last name and group. Edit or delete them on the swimmer page.
2. Select the swimmer and work through the eleven subsections: Training, Performance and Aquabears Creed.
3. Choose a rating and add comments. Quick comments append to the text and remain editable. Creed sections use free text.
4. Add optional remedial action. Blank or whitespace-only remedial action is omitted from the PDF.
5. Generate a PDF, then download, open or share it. PDFs use 390 × 844 point pages, with a single column for phone reading.

Group targets are taken from the approved Aquabears Performance Pathway wording. No target is invented for Bears or Masters.

## Data and expiry

- The app saves on the current browser/device. There is no upload or sync of swimmer names or reviews to GitHub or any server.
- One current review per swimmer. Clear review starts again without removing the swimmer.
- Saved reviews expire exactly **five days after the first edit**. Later edits do not extend that period. Expired records are removed on opening or returning to the app and once a minute while it is open. Browsers do not guarantee background execution while the app is closed.
- The swimmer roster remains until explicitly deleted. Deleting a swimmer removes their review too.
- Downloads and shared PDFs are separate files and are not deleted by the app. Clearing browser/site data removes the locally saved roster and reviews.
- Browser storage failures are shown explicitly. Unsaved edits remain available in the open window for PDF export. Concurrent edits in another window are detected.

## GitHub Pages setup

In this repository: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.

The root contains the complete static app. GitHub Pages will publish future pushes automatically. `.nojekyll` prevents Jekyll processing. Do not rename the repository without updating the manifest ID, installation tests and documented address.

## Development and checks

Requires Node.js 22 or later for checks, with no package installation:

```sh
node --test tests/*.test.mjs tests/install-assets.cjs
node scripts/build.mjs
```

`dist/` is an optional static deployment bundle; root files also work directly on GitHub Pages. All runtime libraries, fonts and images are local and precached. Tests cover independent swimmer records, expiry, unchanged expiry after editing, storage failures, concurrent changes, removal, full offline assets, failed updates and installation icon integrity.

For updates, change the versioned cache name in `sw.js` and the visible version. The new complete shell is downloaded before an update becomes available. The coach can apply it, or it activates after all app windows close. Updates preserve saved records and their expiry dates. Re-check offline PDF generation whenever assets change.

## Dependencies and branding

- jsPDF 3.0.3: vendored from `parallax/jsPDF` tag `v3.0.3`; MIT and included third-party licences are preserved in the file header. Only local fonts/images and text drawing APIs are used.
- DejaVu Sans regular/bold: bundled to preserve accented names and punctuation. See `assets/FONT-LICENSE.txt`.
- Official Aquabears red/grey logo supplied by the club. Brand artwork is retained; app icons add a white safe area.

The public repository contains only app code and assets, never real swimmer data.
