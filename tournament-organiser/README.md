# Tournament Organiser

A basic 8-player single-elimination tournament website. It is split into three pages, like most tournament platforms: a tournaments list, a tournament page with Overview / Participants / Bracket / Standings tabs, and a create page. It supports creating multiple tournaments, entering and saving players, generating the bracket in list order or by random draw, recording scores, automatic advancement, showing the champion, restoring tournament progress and exporting a text result.

## Running locally

Unzip the source package and enter the `tournament-organiser` folder. This project uses HTML, CSS and JavaScript, so there are no frontend dependencies to install and no database to configure. The steps below use Python 3 to serve the static site locally, so Python 3 must be installed first.

Windows: open a terminal in this folder and run:

```text
py -3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

If the `py` command is not available, use:

```text
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

macOS or Linux:

```text
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Then open `http://127.0.0.1:8765` in a browser, keep the terminal open while using it, and press Ctrl+C to stop the server. If the port is already in use, change `8765` in both the command and the URL to `8766`.

Any other static site server also works, with `dist` as the document root. Open the site over HTTP; do not double-click the HTML file.

## Sending it to teammates

Send the complete ZIP package to your teammates, and they can unzip it and run it independently as described above. `127.0.0.1` only points to each person's own computer, so sending someone your local URL will not let them access your server. The source package does not contain the tournament records in your browser; everyone creates and saves their own tournaments after starting the site.

## Usage

The site uses an organiser dashboard: a dark sidebar for navigation, a top bar with the workspace breadcrumb, and a page header that shows the tournament name and its status.

1. The home page lists every tournament saved in this browser with its format, players, status, champion and creation date. Use the search box and the status filter to narrow it down.
2. Click "New tournament", enter a name and create it; the new tournament page opens on the Participants tab.
3. Enter 8 different player names, or use "Fill in sample players".
4. Choose an in-order draw or a random draw, then click "Generate bracket and lock players".
5. On the Bracket tab, enter integer scores for each match and save; the winner advances to the next round automatically.
6. The Standings tab ranks players by matches won, then by fewest losses, and marks the champion and eliminated players.
7. The Overview tab shows the match progress, the champion card once all 7 matches are decided, and the "Export results" button.
8. Progress is saved automatically; the sidebar links move between the list, the create page and the tournament tabs.

## Rules and saving scope

- The current version is fixed at 8 players and does not handle byes for other entry counts.
- Scores are integers from 0 to 9999; ties, negative numbers and decimals are not accepted.
- A match can be edited while later matches have no score; once a later match has a score, this match is locked to prevent inconsistent advancement data.
- The roster is locked after the bracket is generated; create another tournament to try again.
- Data is stored in localStorage for the current browser and the current site address. Refreshing or reopening the same address restores it, and clearing site data deletes the records; different browsers, devices and site addresses do not share it automatically.
- Exported results are readable text for record keeping; importing or restoring an exported file is not supported yet.

## Files and verification

- `dist/index.html`: tournaments list page.
- `dist/tournament.html`: tournament page with the Overview, Participants, Bracket and Standings tabs.
- `dist/create.html`: create page for a new tournament name.
- `dist/style.css`: dashboard shell, cards, tabs, bracket and table styles.
- `dist/list.js`: list rendering, search and status filter.
- `dist/detail.js`: tournament page rendering, tabs, players, scores, standings and export.
- `dist/create.js`: create form handling.
- `dist/store.js`: shared storage and formatting helpers.
- `dist/tournament.js`: tournament rules, data validation and result export.
- `tests/tournament.test.js`: tests for the full seven-match flow, score limits, edit locking, the draw and persistence.

Developers can install Node.js 22 or newer and then run `node --test tests/tournament.test.js` to run the rules tests. Node.js is only needed for these tests, not to run the site. This version requires no third-party dependencies.
