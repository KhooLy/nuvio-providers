# Nuvio Providers

Multi-provider package for **Nuvio**, featuring scrapers for movie, series and anime sources.

## 📦 Included Providers

| Provider | ID | Content | Audio / Subs | Source |
| :--- | :--- | :--- | :--- | :--- |
| **HDFilmizle** | `hdfilmizle` | Movies & Series | TR / EN Audio, EN Subtitles | `hdfilmizle.vip` |
| **Hianime** | `hianime` | Anime Series | SUB & DUB (9 Subtitle languages) | `hianime.ms` |
| **Anikoto** | `anikoto` | Anime Series | SUB & DUB (multi-language subtitles) | `anikoto.cz` |
| **Vidlove** | `vidlove` | Movies & Series | HLS | `vidlove.cc` |
| **HDHub** | `hdhub` | Movies & Series | Direct MKV | `4khdhub.one` |
| **CizgiMax** | `cizgimax` | Turkish Cartoon/Anime Series | TR (multi-quality MP4) | `cizgimax.online` |
| **SezonlukDizi** | `sezonlukdizi` | Turkish Series | TR Dublaj/Altyazı HLS | `sezonlukdizi.cc` |
| **DiziPal** | `dizipal` | Movies & Series | TR Dublaj/Altyazı HLS | rotating (via `t.ly/dizipalgiris`) |
| **DiziBOX** | `dizibox` | Turkish Series | TR Dublaj/Altyazı HLS | `dizibox.live` |
| **MovieBox** | `moviebox` | Movies & Series | Direct MP4 | MovieBox API |
| **MoviesDrive** | `moviesdrive` | Movies & Series | EN / HI, HubCloud & Pixeldrain | `moviesdrive.christmas` |
| **VaPlayer** | `vaplayer` | Movies & Series | HLS | `vaplayer.ru` |
| **Miruro** | `miruro` | Anime Series | SUB + subtitles | `miruro.to` |
| **VidLink** | `vidlink` | Movies & Series | HLS + subtitles | `vidlink.pro` |
| **2Peckle** | `2peckle` | Movies & Series | Direct MP4 | Pengu addon |
| **ToonWorld4All** | `toonworld4all` | Animated Movies & Series | EN / HI direct links | `toonworld4all.me` |
| **Ani.pm** | `anipm` | Anime Series | HLS & embeds | `ani.pm` |
| **Reanime** | `reanime` | Anime Series | SUB | `reanime.cz` |
| **LaMovie** | `lamovie` | Movies & Series | ES / EN HLS | `lamovie.org` |
| **Moflix** | `moflix` | Movies & Series | DE HLS | `moflix-stream.xyz` |
| **KissKH** | `kisskh` | Asian Drama & Anime Series | HLS + subtitles | `kisskh.co` |
| **HDHub4u** | `hdhub4u` | Movies & Series | EN / HI, HubCloud | `hdhub4u` |
| **VegaMovies** | `vegamovies` | Movies & Series | EN / HI, Google & GDTot | `vegamovies.lease` |
| **VidFast** | `vidfast` | Movies & Series | HLS + subtitles | `vidfast.vc` |
| **Cinejoy** | `cinejoy` | Movies & Series | HLS + Stremio subtitles | `cinejoy.pk` |
| **Obejrzyj** | `obejrzyj` | Movies & Series | PL embeds (CDA / Vider) | `obejrzyj.to` |

---

## 🚀 Local Development Server

Run the local Node.js server to host the manifest and providers:

```bash
node server.js
```

The server will be available at:
- **Manifest URL:** `http://localhost:3000/manifest.json`
- **HDFilmizle Provider:** `http://localhost:3000/providers/hdfilmizle.js`
- **Hianime Provider:** `http://localhost:3000/providers/hianime.js`

---

## ⚙️ Repository Structure

```
├── manifest.json            # Nuvio provider manifest registry
├── server.js                # CORS-enabled local HTTP server
├── providers/               # One standalone JS provider per manifest entry
├── tools/
│   ├── thumbnail.js         # Retry-based single-frame grabber for vidlove streams
│   └── sprite.js            # Progressive tiered sprite sheet + preview.vtt generator
└── README.md
```

---

## 🧪 Testing Providers

You can test individual providers using Node.js:

```bash
# Test HDFilmizle
node -e 'require("./providers/hdfilmizle.js").getStreams("tt0760437", "tv", 1, 1).then(console.log)'

# Test Hianime
node -e 'require("./providers/hianime.js").getStreams("154587", "tv", 1, 1).then(console.log)'

# Test Anikoto
node -e 'require("./providers/anikoto.js").getStreams("115994", "tv", 1, 43).then(console.log)'

# Test CizgiMax
node -e 'require("./providers/cizgimax.js").getStreams("37854", "tv", 1, 1).then(console.log)'

# Test HDHub
node -e 'require("./providers/hdhub.js").getStreams("27205", "movie").then(console.log)'

# Test SezonlukDizi
node -e 'require("./providers/sezonlukdizi.js").getStreams("2085", "tv", 1, 1).then(console.log)'

# Test DiziPal
node -e 'require("./providers/dizipal.js").getStreams("27205", "movie").then(console.log)'

# Test DiziBOX
node -e 'require("./providers/dizibox.js").getStreams("196322", "tv", 2, 8).then(console.log)'
```

> **Note:** Vidlove movie streams are currently dead upstream (all sources return null for the movie endpoint); TV works. The API also has intermittent null-windows, so `providers/vidlove.js` and `tools/*.js` retry periodically.

### Sprite Sheets

```bash
# node tools/sprite.js <tmdbId> <movie|tv> [season] [episode] <outputDir> [finalIntervalSec]
node tools/sprite.js 1396 tv 1 1 out/
```

Builds progressive sprite sheets from the lowest-quality vidlove stream: tier interval is picked from video duration (first sheet at ~100-130 frames), intermediate `coarse_t*.jpg` sheets are published as tiers complete, then final `sprite_XX.jpg` (default 5s interval) + `preview.vtt`.

---

## 📜 License

MIT License. Author: **KhooLy**
