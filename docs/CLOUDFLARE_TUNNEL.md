# Cloudflare Tunnel setup (market-backend)

Expose your local backend (port 4000) to the internet with a public HTTPS URL—free, no bandwidth limits.

## 1. Install cloudflared

**Option A – Windows (winget)**  
```powershell
winget install Cloudflare.cloudflared
```

**Option B – Windows (Scoop)**  
```powershell
scoop install cloudflared
```

**Option C – Manual download**  
- [Download cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for your OS  
- Extract and add the folder to your PATH (or run from that folder)

**Verify:**  
```powershell
cloudflared --version
```

## 2. Start the backend

In one terminal, run the API:

```powershell
npm run dev
```

Leave it running (default: http://localhost:4000).

## 3. Start the tunnel

In a **second** terminal, from the project root:

```powershell
npm run tunnel
```

Or directly:

```powershell
cloudflared tunnel --url http://127.0.0.1:4000
```

You’ll see output like:

```
Your quick Tunnel has been created! Visit it at:
https://random-words-here.trycloudflare.com
```

That URL is your **public API base**. Share it with colleagues or set it as `MARKET_API_URL` in the frontend (e.g. `.env.local`).

## 4. Use the public URL

- **API base:** `https://YOUR-SUBDOMAIN.trycloudflare.com`
- **Health:** `https://YOUR-SUBDOMAIN.trycloudflare.com/health`
- **Docs:** `https://YOUR-SUBDOMAIN.trycloudflare.com/docs`
- **OpenAPI JSON:** `https://YOUR-SUBDOMAIN.trycloudflare.com/openapi.json`

**Frontend:** In the app that calls this API, set:

```env
MARKET_API_URL=https://YOUR-SUBDOMAIN.trycloudflare.com
```

(or `API_URL` / whatever env var your frontend uses for the market API base).

## Notes

- The URL **changes each time** you run `cloudflared tunnel --url ...` (quick tunnel).
- For a **fixed URL**, use a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/) and a hostname in the Cloudflare Zero Trust dashboard.
- Keep both the **backend** and **tunnel** terminals running while you need the API exposed.
