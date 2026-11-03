# fastscrape
MADE BY FASTDEV
# FASTSCRAPE

Website scraper dengan rotasi proxy. Hasil export berupa file `.js`.

## Deploy

1. Push repo ke GitHub
2. Import di https://vercel.com/new
3. Framework: Other
4. Environment Variables → Name: `PROXY_LIST`, Value: daftar proxy (satu per baris, format `ip:port:user:pass`)
5. Deploy

## Dev lokal

```bash
cp .env.example .env
# isi PROXY_LIST
npm install
npm run dev