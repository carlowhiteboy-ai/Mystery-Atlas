# Mystery Atlas

    npm install
    npm start          # http://localhost:3000
    npm test           # maps walkable, mysteries solvable, suspect routes, creator rules, server logic
    npm run build:solo # rebuilds mystery-atlas-solo.html (single file, no server)

- generator.js: 1500 deterministic, solvable mysteries. `pickFresh()` chooses the next case: never one already
  played, and never one *similar* to a recent one (same map, item, place, question wording, culprit, title).
- public/maps.js: the 10 maps (props, buildings, clue anchors) plus `layout()` and the collision code shared by game and tests.
- public/game.js: 3D scene, movement/collision, footsteps + music, network handling.
- public/loader.js: loading screen and load-failure messages.
- Server picks a random case per round using the server-wide recent history (data/recent.json) and per-detective
  history (data/seen.json), and never the same map twice in a row.

Map prop kinds: `B` building (walls, door, windows, roof style gable/hip/flat/shed/arch), `T` tower, `W` water tower,
plus boxes, cylinders, cones, trees, rocks, fences, lamps and water. Water blocks walking unless a pier/boardwalk covers it.

## Features added in 0.4

- **Case text** is written per crime type (theft / forgery / sabotage) with more titles, times and details.
- **Weather** (rain, snow, fog, wind, clear) is picked per round and fits the map. It has particles and sound.
- **Timed events** (see `EVENT_PLAN` in generator.js): wind gust 1:40, lights flicker 3:00, a bell and a bonus clue 4:30,
  a scream 6:00, thunder 7:30, one-minute warning 9:00. The server schedules them per room.
- **Suspects walk the map** (public/npc.js). Press E next to one to question them: "Where were you?", "What did you notice?",
  "Who do you suspect?". Innocents tell the truth, the culprit lies (one claim contradicts the clues). Answers go on
  everyone's evidence board. Routes are deterministic from the case id, so nothing is streamed.
- **Mystery creator** (creator.js, custom.js): pick a map, write the case, place 4-6 clues, tag each clue with who it clears or
  points at. The tags are checked automatically so only solvable mysteries can be published. The server stores them in
  data/custom.json, mixes them in about 1 round in 3, and supports likes, reports (hidden after 3), owner delete,
  a profanity filter and 5 publishes per hour per player. In the solo file they are saved in the browser with export/import.

## Chat and voice (0.5)

Available in every room (lobby, round, results). Open the panel at the bottom right.

- **Chat:** press Enter to type, Enter to send, Esc to cancel. Messages show as speech bubbles over the speaker's head.
  The server cleans them (200 characters, no HTML), stars out obvious bad words and limits flooding (6 per 10 seconds).
  The last 40 messages are shown to people who join later.
- **Voice:** "Join voice" opens your microphone. Audio goes directly between players (WebRTC); the server only passes
  the connection set-up messages. Press V to mute. "Nearby only" fades voices with distance and pans them left/right.
  Use headphones to avoid echo. It is a full mesh, so it works well for a handful of players (up to about 6).
- **Requirements:** browsers only allow microphones on **https://** pages or **http://localhost**. Opening the game with a
  LAN address such as http://192.168.1.20:3000 will not work for voice (chat still does). Use HTTPS (a tunnel such as
  ngrok or Cloudflare Tunnel, or a reverse proxy) when playing across the internet.
- **Strict networks:** the default uses free public STUN servers. Some school/office/mobile networks need a TURN relay:

      TURN_URL="turn:turn.example.com:3478" TURN_USER=name TURN_PASS=secret npm start
