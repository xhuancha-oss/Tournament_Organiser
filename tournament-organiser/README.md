# Tournament Organiser

The interface, validation messages, result exports, documentation and test fixtures use English. Compatibility aliases display the application's old demonstration labels in English while preserving custom names and existing match results.

A basic eight-player single-elimination tournament website. Create multiple tournaments, enter and save participants, generate ordered or random draws, record scores, advance winners automatically, display the champion, resume saved progress and export readable results.

## Run locally

Extract the source archive and open the `tournament-organiser` folder. The project uses native HTML, CSS and JavaScript. It requires no frontend package installation or database configuration. The commands below use Python 3 to serve the static website, so Python 3 must be installed first.

On Windows, open a terminal in this folder and run:

```text
py -3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

If the `py` command is unavailable, use:

```text
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

On macOS or Linux:

```text
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8765` in a browser. Keep the terminal open while using the website; press Ctrl+C to stop the server. If the port is occupied, change `8765` to `8766` in both the command and browser address.

Any other static web server can be used with `dist` as its document root. Open the website through HTTP rather than double-clicking an HTML file.

## Share with teammates

Send the complete ZIP archive to teammates. Each recipient can extract it and follow the local setup instructions. The address `127.0.0.1` refers to the current computer, so sending your local URL does not let someone else access your server. The source archive does not include tournament records saved in your browser. Each person creates and saves their own tournaments after starting the website.

## Use the website

The standalone Module 1 page is `http://127.0.0.1:8765/TournamentList.html`. It is also accessible from the navigation on the existing tournament management page.

1. Enter a tournament name and create the tournament.
2. Enter eight different participant names, or use the sample-player button.
3. Choose an ordered or random draw, then generate the bracket and lock the participants.
4. Enter integer scores for each match and save them. The winner automatically advances to the next round.
5. Complete four quarter-finals, two semi-finals and one final to determine the champion.
6. Results save automatically. The tournament can also be saved manually or exported as readable text.

## Module 1 tournament list

This module implements tournament display, name search and status viewing from the course's division of work. It uses native HTML, CSS and JavaScript ES modules without React, JSX or a build dependency.

- Displays each tournament's name, status, entered participant count, completed match count and last update. Completed tournaments also show their champion.
- Searches names as you type, supporting substrings, Unicode names, case-insensitive matching, surrounding whitespace and full-width character normalisation.
- Filters pending, in-progress and completed tournaments, in combination with name search.
- Sorts by latest update, latest creation or name. Filters can be cleared together.
- Opens the existing tournament management page by the tournament's exact unique ID to manage participants, continue matches or view results.
- Distinguishes no saved tournaments, no matching results, read failures and invalid tournament links. A read failure is not presented as an empty list.
- Stores search, status and sorting options in the URL so that refreshing or returning to the page restores them.
- Refreshes automatically when another tab on the same site updates tournament data. The list reads data without changing tournament records.

Statuses follow the existing tournament rules: pending means no bracket has been generated; in progress means the bracket exists but the final is unfinished; completed means the final has a score and a champion has been determined.

### Files and responsibilities

| File | Responsibility |
| --- | --- |
| `dist/TournamentList.html` | Module 1 HTML page and form structure |
| `dist/tournament-list.css` | List, status badges, filter form and narrow-screen layout |
| `dist/tournament-list.js` | Data reading, interactions, rendering and cross-tab refresh |
| `dist/tournament-list-model.js` | Status, counts, search, filters, sorting and link generation |
| `dist/tournament.js` | Shared data validation and tournament state calculations |
| `dist/style.css` | Shared basic styles |

### Backend integration

The current deliverable is the Module 1 frontend. It reads existing browser storage; a Flask or SQLite backend has not been implemented. The `readTournaments()` function in `tournament-list.js` is the shared data-reading boundary. Once the backend is available, replace it with Fetch requests and agree the response format for status and summary information. An asynchronous reader also requires an asynchronous `refresh()` implementation with loading and retry handling.

Module 1 does not implement Module 2's creation and editing functionality. Its create links open the existing basic form. Archiving, restoration and deletion are outside Module 1's scope in the current division of work.

## Rules and storage limitations

- This version requires exactly eight players and does not handle byes for other participant counts.
- Scores must be integers from 0 to 9999. Ties, negative numbers and decimals are rejected.
- A result can be changed until a later dependent match has a score. Once a dependent result exists, the earlier result is locked to prevent inconsistent advancement.
- Generating a bracket locks the participant list. Create another tournament to try a different list or draw.
- Data is stored in localStorage for the current browser and website origin. Refreshing or reopening the same address restores it. Clearing site data removes records. Different browsers, devices and website addresses do not automatically share data.
- Results can be exported as readable text for reference. Importing or restoring that text file is not currently supported.

## Source files and verification

- `dist/index.html`: tournament management page structure.
- `dist/style.css`: basic layout and styles.
- `dist/app.js`: page interactions and browser persistence.
- `dist/tournament.js`: tournament rules, data validation and result export.
- `tests/tournament.test.js`: the complete seven-match flow, score limits, result locking, draws and persistence.
- `tests/tournament-list.test.js`: list status, name search, combined filters, sorting, links and malformed data.

Developers can install Node.js 22 or newer and run `npm test` to execute all tests. Node.js is used only for these tests and is not required to serve the website. No third-party packages need to be installed.
