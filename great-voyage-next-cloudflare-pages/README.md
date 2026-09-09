# The Great Voyage — Next.js + Cloudflare Pages

An animated ancient-sci-fi cartography experience built with Next.js, Tailwind CSS, Motion, GSAP, Leaflet, and React Leaflet.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Motion for React
- GSAP
- Leaflet + React Leaflet
- Lucide React
- Static export for Cloudflare Pages

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build for Cloudflare Pages

This project is configured with `output: "export"` in `next.config.ts`, so:

```bash
npm run build
```

generates the static site in:

```text
out/
```

## Cloudflare Pages settings

When connecting the repository in Cloudflare Pages:

- Framework preset: **Next.js (Static HTML Export)**
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `out`

Cloudflare Pages can then deploy the generated static export.

## Important runtime notes

The app is intentionally static. The interactive map, voyage animation, search, media discovery, and journal all run in the browser.

The app still calls the original external resources used by the supplied implementation:

- Natural Earth country GeoJSON
- OpenStreetMap tiles through Leaflet
- `https://media-api.markmykevin.workers.dev` for country media

If you want to avoid browser CORS/rate-limit concerns for the media API, move those calls behind a Cloudflare Worker or another same-origin API later.

## Cloudflare Pages deployment

1. Push this directory to GitHub.
2. In Cloudflare, open **Workers & Pages → Create application → Pages → Import an existing Git repository**.
3. Select the repository.
4. Use the build settings above.
5. Deploy.

Cloudflare will publish the `out/` directory to your `*.pages.dev` domain.

## Alternative: Cloudflare Workers

If you later need SSR, Route Handlers, Server Actions, or other server-side Next.js features, Cloudflare currently recommends the Workers/vinext path instead of static Pages deployment. This project does not require those features, so the static Pages export is the simplest deployment target.
