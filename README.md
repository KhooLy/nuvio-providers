# HDFilmizle Nuvio Provider

[NuvioMobile](https://github.com/NuvioMedia/NuvioMobile) için hdfilmizle.vip üzerinden m3u8 stream sağlayan plugin provider.

## Özellikler
- Film ve dizi desteği
- Türkçe/İngilizce ses ve altyazı
- m3u8 / mp4 / mkv formatları

## Kurulum

```bash
npm install
node server.js
```

Sunucu `http://localhost:3000` üzerinde `manifest.json` ve `providers/hdfilmizle.js` dosyalarını serve eder. Bu URL'i Nuvio uygulamasına custom provider olarak ekleyebilirsin.
