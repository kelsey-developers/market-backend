# Cloudflare Tunnel setup (market-backend)

Expose your local backend (port 4000) to the internet with a public HTTPS URL.

- Quick tunnel: zero setup, rotating URL every run.
- Named tunnel: fixed URL (recommended), no URL changes after restart.

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

## 3. Choose tunnel mode

### Option A: Quick tunnel (rotating URL)

In a **second** terminal, from the project root:

```powershell
npm run tunnel:quick
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

That URL is your **public API base** for this run only.

### Option B: Named tunnel (fixed URL)

Use this once and keep the same hostname forever.

1. Login cloudflared to your Cloudflare account:

```powershell
cloudflared tunnel login
```

2. Create a named tunnel (one-time):

```powershell
cloudflared tunnel create market-api
```

3. Map a DNS hostname (replace with your domain in Cloudflare):

```powershell
cloudflared tunnel route dns market-api market-api.yourdomain.com
```

4. Set backend `.env`:

```env
CLOUDFLARED_MODE=fixed
CLOUDFLARED_TUNNEL_NAME=market-api
```

5. Start fixed tunnel:

```powershell
npm run tunnel:fixed
```

Now your URL stays stable, e.g. `https://market-api.yourdomain.com`.

## 4. Use the public URL

- **API base:** `https://YOUR-URL`
- **Health:** `https://YOUR-URL/health`
- **Docs:** `https://YOUR-URL/docs`
- **OpenAPI JSON:** `https://YOUR-URL/openapi.json`

**Frontend:** In the app that calls this API, set:

```env
MARKET_API_URL=https://YOUR-URL
```

(or `API_URL` / whatever env var your frontend uses for the market API base).

## Notes

- Quick tunnel URL **changes each time** you run it.
- Named tunnel URL **does not change** after restart.
- Named tunnels require a domain managed in Cloudflare.
- Keep both the **backend** and **tunnel** terminals running while you need the API exposed.
