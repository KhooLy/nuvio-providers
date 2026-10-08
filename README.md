# Nuvio Providers

Multi-provider package for **Nuvio**, featuring scrapers for **HDFilmizle** and **Hianime**.

## 📦 Included Providers

| Provider | ID | Content | Audio / Subs | Source |
| :--- | :--- | :--- | :--- | :--- |
| **HDFilmizle** | `hdfilmizle` | Movies & Series | TR / EN Audio, EN Subtitles | `hdfilmizle.vip` |
| **Hianime** | `hianime` | Anime Series | SUB & DUB (9 Subtitle languages) | `hianime.ms` |

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
├── providers/
│   ├── hdfilmizle.js        # HDFilmizle provider (movies & tv series)
│   └── hianime.js           # Hianime provider (anime SUB + DUB)
├── hianime_scraper.py       # Standalone Python CLI scraper & downloader
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
```

---

## 📜 License

MIT License. Author: **KhooLy**
