<a id="readme-top"></a>

<div align="center">
  <h1>SLLAPP · ScienceCom 2026</h1>
  <p>Sign Language Learning Application</p>
  <p>WebSocket sessions, a ranking REST API, SQLite result storage and Vue hand-tracking packages.</p>
  <p>
    <img src="https://img.shields.io/badge/Java-21-ED8B00?style=flat-square" alt="Java 21">
    <img src="https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square" alt="Vue 3">
    <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square" alt="SQLite">
  </p>
  <p>
    <a href="docs/api.md">API reference</a> ·
    <a href="docs/backend-architecture.md">Backend architecture</a> ·
    <a href="https://github.com/PJATK-AI/SLLAPP-ScienceCom-2026/issues">Issues</a>
  </p>
</div>

<details>
  <summary>Table of contents</summary>

- [About the project](#about-the-project)
- [Getting started](#getting-started)
- [Usage](#usage)
- [Repository structure](#repository-structure)
- [Development and testing](#development-and-testing)
- [Documentation and contributing](#documentation-and-contributing)
- [License](#license)

</details>

## About the project

SLLAPP is the Sign Language Learning Application project for ScienceCom 2026,
maintained by PJATK AI.

The backend creates player sessions over WebSocket, validates hand samples,
stores game results and serves an ordered ranking over REST. The
frontend workspace contains the Vue game, a MediaPipe hand tracker and its Vue
wrapper. In the game, the player spells a random five-letter word in Polish Sign
Language (PJM) by showing each letter inside a zone on the camera image before
the time runs out.

| Component | Technologies |
| --- | --- |
| Backend | Java 21, Spring Boot, WebSocket, Spring JDBC, SQLite |
| Frontend | Vue 3, TypeScript, Vite, MediaPipe Hand Landmarker |
| Build and tests | Maven Wrapper, pnpm, Turborepo, JUnit, Vitest |
| CI | GitHub Actions |

## Getting started

### Prerequisites

| Tool | Required version |
| --- | --- |
| JDK | 21 |
| Node.js | 24.15 or newer |
| pnpm | 12.21.0, as declared in `frontend/package.json` |

The backend includes the Maven Wrapper. SQLite runs inside the backend process
and stores data in a local file.

### Start the backend

From the repository root, run:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

On Linux or macOS, use `sh mvnw spring-boot:run` from `backend/`.
The server listens on **http://127.0.0.1:8080**.

### Start the frontend

In a second terminal, from the repository root, run:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite.

## Usage

### Play the game

1. Enter a nickname (1–20 characters) and choose the hand you sign with.
2. Allow camera access. The view is mirrored by default; the **Lustro** button
   turns mirroring on or off (the choice is remembered in the browser).
3. Put the whole hand inside the zone. Show each letter of the word and hold it
   until the progress ring fills. You have 60 seconds for five letters.
4. Each letter gives 100 points. A complete word adds 10 points for each full
   second left.

Words use only the 16 letters that the PJM classifier in `model/` recognizes:
`A B C E I L M N O P R S T U W Y`, without Polish diacritics.

The game creates a WebSocket session on start and streams `hand_sample` and
`no_hand` messages (about 15 per second) during each round. When the backend is
not reachable, the game runs offline. It reads the top 10 from `/api/ranking`.

> **Test recognition mode.** The browser does not run the letter classifier yet.
> Until it is connected, hold the key of the letter on the keyboard while you
> show the sign in the zone. Recognizers implement `LetterRecognizer` in
> `frontend/apps/web/src/recognition/`.

The frontend reads these optional variables from `frontend/apps/web/.env.local`:

| Variable | Default |
| --- | --- |
| `VITE_BACKEND_URL` | `http://127.0.0.1:8080` |
| `VITE_WEBSOCKET_URL` | `VITE_BACKEND_URL` with `ws` scheme and `/ws` path |
| `VITE_HAND_LANDMARKER_MODEL_URL` | MediaPipe `hand_landmarker.task` (float16) from Google storage |

The MediaPipe WASM files come from `@mediapipe/tasks-vision`; Vite serves them
at `/mediapipe/wasm/` and copies them into the build.

### Open a WebSocket session

With the backend running, use a browser console on the local Vite page:

```javascript
const socket = new WebSocket('ws://127.0.0.1:8080/ws');
socket.onmessage = (event) => console.log(JSON.parse(event.data));
socket.onopen = () => socket.send(JSON.stringify({
    type: 'create_session',
    nickname: 'Ola',
    selectedHand: 'RIGHT',
}));
```

The server responds with `game_state`, a `sessionId`, player data and
`positionId: null`. The connection accepts `hand_sample` and `no_hand` messages.
Sessions expire five minutes after creation by default; their data lives in
memory. A new socket can resume a session and replace its previous connection.
See the [WebSocket reference](docs/api.md#websocket-transport) for complete
messages, reconnect behavior, origin settings and optional acknowledgements.

### Read the ranking

With the backend running, request the top results:

```sh
curl "http://127.0.0.1:8080/api/ranking?limit=10"
```

The endpoint returns a JSON array of `rank`, `nickname` and `score`. It orders
results by score descending, then by earlier finish time, with the session
identifier as the final tie-breaker. An empty database returns `[]`.

The default limit is 10. Values outside 1–100 and invalid input return `400` with a
`ProblemDetail` body. See the [API reference](docs/api.md) for response examples.

### Keep saved results

The backend creates `data/sllapp.db` relative to its working directory. With the
startup commands above, that file is `backend/data/sllapp.db`. Set `DATA_DIR` to
choose another storage directory. Keep the database file between runs to retain
saved results.

## Repository structure

| Path | Contents |
| --- | --- |
| `backend/` | Spring Boot application, WebSocket sessions, ranking API and SQLite storage |
| `frontend/apps/web/` | Vue game: camera, hand zone, word spelling, WebSocket client and ranking |
| `frontend/packages/hand-landmarker/` | MediaPipe tracker API and hand selection |
| `frontend/packages/hand-landmarker-vue/` | Vue composable for the hand tracker |
| `docs/` | API reference, backend architecture and project workflow |
| `.github/workflows/ci.yml` | Backend and frontend checks |

## Development and testing

### Backend checks

From `backend/`:

```powershell
.\mvnw.cmd -B verify
```

On Linux or macOS, use `sh mvnw -B verify`. The tests cover WebSocket creation,
reconnects, expiry, concurrent ownership, sample validation and message limits,
as well as SQLite persistence and ranking HTTP responses. Integration tests use
random server ports and temporary databases.

### Frontend commands

Run these commands from `frontend/`:

| Command | Action |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Build the application and workspace libraries |
| `pnpm typecheck` | Check TypeScript types across the workspace |
| `pnpm test` | Run Vitest tests |
| `pnpm format:check` | Check formatting with Prettier |
| `pnpm format` | Apply Prettier formatting |

Workspace libraries live in `packages/` and use `workspace:*` dependencies.
Turborepo builds dependencies first and caches build output. In development,
Vite and TypeScript resolve library exports to `src/` through the `development`
condition; production builds use compiled `dist/` output.

The [CI workflow](.github/workflows/ci.yml) runs backend verification and frontend
formatting, build, type checks and tests on pull requests and pushes to `master`.

## Documentation and contributing

| Document | Contents |
| --- | --- |
| [API reference](docs/api.md) | WebSocket messages, ranking requests, configuration and errors |
| [Backend architecture](docs/backend-architecture.md) | Packages, session lifecycle, result storage and tests |
| [Project workflow](docs/WORKFLOW.md) | Issues, branches, commits, validation and pull requests |

Follow the project workflow when contributing. Changes reach `master` through
pull requests; the project uses merge commits.

## License

Distributed under the [MIT License](LICENSE). Copyright © 2026 PJATK{AI}.

<p align="right"><a href="#readme-top">Back to top ↑</a></p>
