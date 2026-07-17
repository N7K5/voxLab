# VoxLab

VoxLab is a browser-first speaking coach for short, timed arguments. It chooses a prompt and stance, records the response, transcribes speech locally, measures observable delivery features, and turns those measurements into practical feedback.

**Try it here:** [https://n7k5.github.io/voxLab](https://n7k5.github.io/voxLab/). This is the browser-local demo: accounts, settings, history, analytics, and enabled recordings stay in that visitor's browser.

It supports two independent choices:

- **Storage:** browser-only IndexedDB, or PostgreSQL through the included API server.
- **Coaching:** deterministic in-browser coaching, or an Ollama model for richer transcript-based feedback.

Ollama is not used as an audio model. The browser measures pauses, pace, loudness, clipping, and pitch variation, while a local Whisper model produces the transcript. When enabled, Ollama receives the topic, assigned stance, transcript, measured analytics, and score—but never the voice recording.

## What is included

- Username/password signup and login with no email verification
- 900 curated prompts: 100 easy, 100 medium, and 100 hard motions in each of English, Bengali, and Hindi
- History-aware topic draws that avoid completed motions until the selected tier is exhausted
- AI-screened custom motions from the compact “Choose yourself” flow
- User-selected or game-mode For/Against stances
- Local 1v1 rounds with random opposite sides, sealed device handoff, and a shared score comparison
- Adjustable 30–180 second timer (60 seconds by default)
- Microphone check, countdown, live waveform, and early finish
- Local Whisper transcription in a Web Worker through Transformers.js
- Conservative transcript checks that catch obvious repetition loops or wrong-script output before scoring, with recording replay and manual-transcript recovery
- Pause, silence, pacing, filler, vocabulary, structure, relevance, semantic stance, argument-evidence, pitch, volume, and clipping analytics
- Evidence-specific browser coaching that works without a generative LLM
- Optional structured coaching from Ollama
- One-click Ollama upgrades for saved browser-coached reports using their transcript and metrics, never the voice recording
- Evidence-backed weaknesses, transcript quotations and reframes, topic strategy, and spoken coaching with a dependable system default plus at most three curated English/Bengali/Hindi alternatives
- Attempt history, saved playback, per-attempt deletion, and account deletion
- Optional recording retention
- Persistent system, dark, light, and dusk themes
- Responsive UI with reduced-motion support

## Quick start

Requirements: Node.js 20+ and a Chromium-based browser recommended for the fastest local transcription.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API also starts on `http://localhost:8787`. With no database configuration, the app automatically uses IndexedDB in the current browser.

The first analysis downloads the configured Whisper ONNX model. With the default automatic WebGPU setup, Whisper Tiny and its browser runtime can use well over 100 MB; the recommended semantic stance checker downloads a separate multilingual NLI model of roughly 360 MB. A first run can therefore approach 500 MB. Transformers.js keeps model files in the browser cache when storage is available, but private browsing, cleared site data, quota pressure, or switching model/device tiers can make the browser fetch them again. Microphone access requires `localhost` or HTTPS.

For a lower-download setup, choose **Fast · Whisper Tiny**, **WASM / CPU**, and **Fast phrase signals** in Settings. This is slower and the stance check is less capable, but it avoids the separate semantic model and uses the smaller quantized Whisper weights. Model-loading progress can represent either a network fetch or a read from the browser's model cache; use the browser developer tools' transferred-size column when you need to distinguish them.

Custom motions receive a quick structural precheck followed by an AI suitability check for clarity, breadth, and reasonable arguments on both sides. An accepted motion is used for the current round and is stored with that attempt in history. The browser suitability screen uses the same multilingual local NLI model as semantic stance checking, so its first custom check may trigger that roughly 360 MB download. When Ollama coaching is selected, only the custom motion text is sent to the configured Ollama endpoint; if it is unavailable, VoxLab falls back to the browser model. This is a debate-suitability screen, not a factual accuracy guarantee.

## Deploy the browser-only app to GitHub Pages

The included [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds and deploys a static GitHub Pages variant. It automatically uses the repository's Pages base path, hash-based client routing, and browser-only storage. The normal local and Express/PostgreSQL builds are unchanged.

The Pages deployment does not run `npm start`. GitHub Actions installs dependencies, builds `dist`, and publishes only that static directory.

### First deployment

1. Create an empty repository on GitHub.
2. Push this project to its `main` branch. Keep `dist` ignored; the workflow builds it on GitHub.

   ```bash
   git init
   git add .
   git commit -m "Initial VoxLab app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```

3. In the GitHub repository, open **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Open **Actions → Deploy browser app to GitHub Pages**. If the first push happened before Pages was enabled, choose **Run workflow** once.
6. When deployment finishes, the link appears in the deployment summary and in **Settings → Pages**. A project repository normally uses:

   ```text
   https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
   ```

Every later push to `main` runs the checks and deploys the updated browser app automatically. If the default branch has another name, change the branch under `on.push.branches` in the workflow.

### What works on GitHub Pages

- Username/password accounts, settings, history, analytics, transcripts, and enabled recordings are stored in that visitor's IndexedDB.
- Microphone capture and local acoustic analysis run in the page over HTTPS.
- English or multilingual Whisper—and the optional multilingual semantic stance model—download from Hugging Face on first use, then use that browser's model cache.
- The deterministic browser coach works without any server or Ollama installation.
- A visitor may choose Ollama only if Ollama is running on their own computer and allows the exact Pages origin. Pages never exposes your computer's Ollama instance.

Browser data is specific to the Pages origin and browser profile. It is not shared across devices, and clearing site data removes the local account and history. GitHub Pages cannot run the included Express API or PostgreSQL; use the production server deployment below when shared server accounts and database storage are required.

## Configuration

There are two separate configuration files because database secrets must never be shipped to a browser.

### Safe browser configuration

Edit [`public/app.config.json`](public/app.config.json) for non-secret defaults:

```json
{
  "storage": {
    "mode": "auto",
    "apiBaseUrl": "/api"
  },
  "ai": {
    "provider": "browser",
    "ollamaEndpoint": "http://localhost:11434",
    "ollamaModel": "qwen3:4b",
    "ollamaViaServer": false
  },
  "speech": {
    "model": "onnx-community/whisper-tiny.en",
    "device": "auto",
    "language": "en"
  },
  "practice": {
    "defaultDurationSeconds": 60,
    "saveRecordings": true
  }
}
```

Set `speech.language` to `en`, `bn`, or `hi`. If Bengali or Hindi is selected while an English-only `.en` model is configured, VoxLab automatically chooses the matching multilingual Whisper tier.

Storage modes:

- `browser`: always use IndexedDB.
- `database`: require a healthy configured API/database; startup shows an error otherwise.
- `auto`: use the database when the API reports a healthy configured database, and use IndexedDB when no API/database is configured. A configured-but-broken database is reported instead of silently splitting history between two stores.

This file is public. Never put a database password, API secret, or remote Ollama token in it.

### Private PostgreSQL configuration

Copy the example file:

```bash
cp server/config.example.json server/config.local.json
```

Then edit `server/config.local.json`:

```json
{
  "database": {
    "url": "",
    "host": "db.example.com",
    "port": 5432,
    "database": "voxlab",
    "username": "voxlab_app",
    "password": "replace-me",
    "ssl": true,
    "sslRejectUnauthorized": true
  },
  "server": {
    "port": 8787,
    "sessionSecret": "replace-with-a-long-random-value",
    "allowedOrigins": ["http://localhost:5173"],
    "trustProxy": false
  },
  "ollama": {
    "endpoint": "http://localhost:11434",
    "allowUnauthenticated": false
  }
}
```

`server/config.local.json` is gitignored. `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `TRUST_PROXY`, `OLLAMA_ENDPOINT`, and `ALLOW_UNAUTHENTICATED_OLLAMA` environment variables are also supported and take priority. Keep TLS certificate verification enabled unless a private development database genuinely requires otherwise. Set `TRUST_PROXY` only when the app is behind a proxy you control.

The API checks the connection and creates the required tables on startup. Accounts use server-side scrypt password hashes and opaque sessions in `HttpOnly`, `SameSite` cookies. Attempts and optional audio blobs are deleted through cascading foreign keys when an account is deleted.

Browsers do not and should not connect directly to PostgreSQL. The endpoint and credentials belong only in the server configuration above.

## Using Ollama

Install Ollama separately, then pull and serve a text model, for example:

```bash
ollama pull qwen3:4b
ollama serve
```

Choose **Ollama coach** in VoxLab settings and set the model name.

There are two connection paths:

- **Through the app server:** recommended when using database accounts or deploying the app. Enable “Connect through app server.” The server uses its fixed `OLLAMA_ENDPOINT`; it does not proxy arbitrary URLs.
- **Direct from the browser:** useful for a static/browser-only installation. Disable the server option. Ollama may need the exact web origin in `OLLAMA_ORIGINS`, and modern browsers can request local-network permission.

Do not expose Ollama’s unauthenticated port directly to the public internet. Put any remotely hosted instance behind the authenticated app server and TLS. The API permits its unauthenticated local Ollama proxy only during development by default; production disables that path unless explicitly configured.

If Ollama is unavailable, an attempt still completes with the deterministic browser coach and displays a fallback notice.

## What “browser AI” means

The browser path is fully useful without Ollama:

1. Raw microphone PCM and a compressed playback recording are captured locally.
2. A small Whisper model runs locally via WebGPU when available, with WASM fallback.
3. Deterministic signal and language analysis computes the metrics. The recommended multilingual NLI model can compare English, Bengali, or Hindi transcripts with the assigned motion; fast language-specific phrase and topic signals remain available without the extra model.
4. A local rules-based coach produces evidence-backed strengths, weaknesses, strategy, and drills. It only offers a sentence reframe when a safe mechanical edit is observable; Ollama mode handles semantic rewrites.
5. Spoken coaching uses shorter conversational phrasing, sentence pauses, and adjustable speed/pitch. The browser/operating-system default is the reliable first choice; the menu then shows at most three language-matched alternatives and removes known novelty/effect voices. Users can explicitly reveal browser-provided network voices when they prefer their sound. A browser-reported local voice does not guarantee offline synthesis.

Model files are downloaded from Hugging Face on first use unless you self-host them. Once loaded, inference itself happens in the browser. Transcription does not use the browser Web Speech recognition API, which can route audio to a browser vendor.

The microphone recording is never sent through browser speech-recognition services. Spoken coaching uses the Web Speech synthesis API. Browser/system and network voice availability depends on the browser, operating system, and speech engine; even a voice reported as local may rely on an engine that uses the network. Explicitly enabling a network voice may send only the generated coaching text—not the recording—to the browser's speech provider. Desktop Chrome may expose a Hindi network voice, but its built-in Google network list does not include Bengali. VoxLab only offers voices actually reported by the current browser.

Whisper can occasionally produce a repetitive transcript loop or text in the wrong writing system, especially from short, noisy, or mismatched-language audio. VoxLab stops obvious cases before they affect scoring and opens the existing fallback so the recording can be replayed and a rough transcript entered manually.

### Browser model tiers

The Settings page exposes four English transcription tiers:

- **Fast:** Whisper Tiny English
- **Balanced:** Whisper Base English
- **Accurate:** Distil Whisper Small English; Auto/WASM recommended for its available quantized browser files
- **Maximum:** Whisper Small English; large download and a powerful desktop recommended

The two larger options improve transcription at a real compute and memory cost. The maximum tier uses roughly 600 MB of model weights on WebGPU and needs additional runtime memory. The semantic stance checker is separately switchable between the recommended multilingual local NLI model (roughly 360 MB on first use) and fast phrase signals.

For Bengali and Hindi, VoxLab switches to multilingual Whisper:

- **Fast:** Whisper Tiny Multilingual
- **Balanced:** Whisper Base Multilingual
- **Accurate:** Whisper Small Multilingual; roughly 250 MB with quantized browser CPU weights

Bengali and Hindi recognition can vary with accent, microphone quality, and code-switching. The multilingual semantic model supports both languages; the lightweight fallback gets stronger evidence when speakers explicitly state `পক্ষে`/`বিপক্ষে` or `पक्ष`/`विपक्ष`. A capable Ollama model is prompted to return coaching in the selected practice language.

## About emotion and “confidence”

VoxLab reports observable vocal behavior: pitch movement, energy/volume variation, silence, clipping, and pause timing. It deliberately does not claim that a person is nervous, angry, confident, deceptive, or experiencing another internal emotion. Those labels are unreliable from a short recording and can be culturally biased.

The score is coaching guidance, not a psychological assessment or a clinical measurement. Microphones, room noise, browser audio processing, accents, and transcription errors can affect it.

## Data behavior

Browser mode:

- Account profile, password hash, analytics, transcript, settings, and enabled recordings live in IndexedDB for this origin.
- The password is derived with Web Crypto PBKDF2 and a unique salt; plaintext is never stored.
- The account is local to this browser. Clearing site data removes it, and there is no password recovery.

Database mode:

- The same product data is sent to the included authenticated API and stored in PostgreSQL.
- Raw recordings are stored only when “Save recordings” is enabled.
- Deleting an attempt deletes its audio. Deleting the account deletes all associated data.

Voice recordings are sensitive. Turn off recording retention if only analytics and transcripts are needed.

## Production

```bash
npm run build
NODE_ENV=production SESSION_SECRET='a-long-random-secret' npm start
```

The Express server serves the built web app and API from one origin. Deploy behind HTTPS, configure PostgreSQL TLS appropriately, set an explicit allowed origin, use a strong session secret, and apply normal database backups/retention policies.

For larger usage, move audio from PostgreSQL to private object storage and retain only an object reference in the database.

## Development checks

```bash
npm test
npm run lint
npm run build
```

## Current scope

This app analyzes after each timed recording stops. Spoken coaching reads the finished brief; it is not a realtime, interruptible, voice-to-voice assistant like ChatGPT voice mode. A realtime version would add streaming VAD/STT, a dialogue state machine, and streaming model inference; none of that is required for the topic → speech → analysis practice loop.
