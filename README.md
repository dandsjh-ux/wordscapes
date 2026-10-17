# Wordscape Arena

A live HTML5 multiplayer photo challenge for Year 9. Students explore descriptive vocabulary, adjectives and the connotations of place across eight 90-second rounds.

**Start here:** upload this folder’s contents to a GitHub repository, then connect that repository to a Render **Web Service**. The frontend and multiplayer server run together. No API key, database or image-generation service is needed.

## Deploy on Render

1. Unzip the download and open the `wordscape-arena` folder.
2. Create an empty GitHub repository. Upload the **contents** of the folder, so `package.json`, `package-lock.json`, `server.js`, `render.yaml`, `public/` and `lib/` are at the repository root. Keep the folder structure inside `public/` and `lib/`. Do not upload `node_modules/`.
3. In Render, select **New → Web Service**, connect the repository, and use:

| Setting | Value |
| --- | --- |
| Language / runtime | Node |
| Branch | Your repository’s branch, usually `main` |
| Root directory | Leave blank if `package.json` is at the repo root |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Instance | Free works for a classroom trial; choose according to your needs |
| Health check path | `/health` |
| Environment | `NODE_ENV=production`, `NODE_VERSION=22` |

4. Create the web service. Once the deploy succeeds, open the `https://…onrender.com` URL.
5. The teacher selects **Create a room**. Students open the same URL and select **Join a room**, or use the copied invite link.

**Blueprint alternative:** the included `render.yaml` contains these settings. Choose **New → Blueprint**, connect the repository, and apply it.

The server binds to `0.0.0.0` and Render’s `PORT` automatically. HTTP and Socket.IO use the same port and origin. There are no separate frontend/backend URLs to configure.

### Hosting behaviour

Rooms and scores live in server memory. A deployment, restart or service shutdown clears them. A browser refresh can rejoin the same seat while the server and room still exist. Download the final CSV if you want a record.

Keep this app on **one instance**. Multiple replicas would each have their own rooms; shared storage and a Socket.IO adapter would be required before scaling across instances.

Render’s Free service can sleep after 15 minutes without inbound traffic, and may restart. The next visitor wakes it; this can take about a minute. Open the site before the lesson. Actual capacity depends on hosting resources and network conditions; the application caps a room at 50 participants, including the host.

Official deployment references, checked 17 October 2026:

- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/web-services
- https://render.com/docs/websocket
- https://render.com/docs/free
- https://render.com/docs/node-version

## Play locally

Install Node.js 22 or 24, then open a terminal in this folder:

```sh
npm ci
npm start
```

Open **http://localhost:3000**. To simulate a class on one computer, open separate tabs. Each tab keeps its own rejoin key in session storage, so students can use separate tabs without overwriting each other’s seats.

To join from phones or tablets on the same Wi-Fi, open `http://YOUR-COMPUTER-LAN-IP:3000` and allow the server through your local firewall. On Render, share the public HTTPS URL instead.

## The game

- **8 photos × 90 seconds = 12 minutes** of guessing, plus teacher-controlled review time.
- **20 targets per photo**, ranked from **100 to 5 points**. Maximum: **1,050 per round; 8,400 per expedition**.
- Each player can score every target once, even if another player already found it. Discoveries remain private during play.
- All players see a live score table. Every completed round reveals the full word bank, meanings, possible connotations, a model sentence and a discussion prompt.
- Meaning clues appear after **30 seconds** (1:00 remaining), first letters after **55 seconds** (0:35 remaining), and second letters after **75 seconds** (0:15 remaining).
- Hints support unsolved words. Points do not decrease as hints unlock.
- Guesses ignore capitalisation, extra spaces and hyphens. Listed British/American variants are accepted. Near spellings get feedback but do not automatically score.
- The highest total wins. Equal totals share rank; there is no arbitrary tiebreak.
- The teacher can host as a spectator, play alongside the class, pause/resume, end a round early, start the next photo and reset after the final round.
- **Solo expedition** starts a personal practice match with the same eight rounds.
- A disconnected player can refresh to resume their seat. If the host stays disconnected for 30 seconds, a connected participant becomes host.
- A player joining mid-game starts scoring from the current round.
- Guesses are limited to 8 per 4 seconds per player to discourage random spam.

## Lesson content

| Round | Setting | Main learning opportunity |
| --- | --- | --- |
| 1 | Desert | Physical emptiness versus emotional isolation |
| 2 | Misty forest | Reassuring calm versus unsettling mystery |
| 3 | Neon city | Excitement versus sensory overload |
| 4 | Abandoned room | Condition, neglect and implied history |
| 5 | Tropical beach | Welcome seclusion versus being cut off |
| 6 | Snowy mountains | Awe and admiration versus danger |
| 7 | Stormy coast | Movement, imagined sound and threat |
| 8 | Old village | Charm, age and nostalgia |

These are curated possibilities, not an exhaustive list or survey of the “best” descriptions. Point values reward vocabulary challenge. Connotations depend on context. Some descriptors infer weather, sound or feeling from the visual evidence; encourage students to justify those readings.

See `TEACHER_GUIDE.md` for teaching suggestions and the answer bank.

## Change the vocabulary or photos

- Edit **`lib/levels.js`**. Each target has a word, connotation, meaning clue and optional accepted spelling variants. Its position determines its points. Keep 20 words per round and check that aliases do not overlap with a different target.
- Replace photos in **`public/images/`**, retaining the filenames, or update the level’s `image` path. Update the alt text and `public/photo-credits.json` to match any replacements.
- The eight photos are included in the project; gameplay does not hotlink external images. Photographer names and source links appear in the app. See `CREDITS.md`.
- Adjust appearance in **`public/style.css`**.
- Timing constants live in **`lib/game.js`**. This version intentionally fixes every round at 90 seconds.

## Verify the project

```sh
npm ci
npm run check
npm test
```

The tests cover all 160 targets and accepted variants, scoring and duplicate handling, exact hint thresholds, the authoritative deadline, pause/resume, tie ranking, permissions, room isolation, rejoining, a 32-player simulated class, local image delivery, private answer handling, and the actual HTML client’s create/join/play/review/export/replay flow.

Client tests use JSDOM. They check generated DOM and behaviour, not visual rendering in a real browser. Test the published link on the devices you plan to use in class.

## Files

```text
server.js                Express + Socket.IO server
lib/game.js              Authoritative game state, timers and scoring
lib/levels.js            Eight server-only word banks and learning content
public/index.html        HTML5 interface
public/app.js            Multiplayer client
public/style.css         Responsive styling
public/images/           Eight downloaded place photographs
public/photo-credits.json Photo metadata used by the interface
render.yaml              Render Blueprint
package-lock.json        Reproducible dependency installation
TEACHER_GUIDE.md          Lesson notes and all 160 targets
CREDITS.md               Image sources and licence
```
