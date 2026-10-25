# Birthday Love Site (full-stack)

Node.js + Express. No database to install: all content lives in `data/content.json`.

## Run
    npm install
    ADMIN_PASSWORD="your-secret" npm start     # Windows PowerShell: $env:ADMIN_PASSWORD="your-secret"; npm start

- Site:  http://localhost:3000
- Admin: http://localhost:3000/admin   (default password `admin123` — change it with ADMIN_PASSWORD!)

## What you can edit in /admin (goes live instantly after Save)
Envelope heading, title, letter, "This is us" buttons, promises, hug messages,
and the generators for "Our Cute Moments" and "Reasons I love you".

## Unlimited auto text
Each theme line is `emoji emoji :: starts / starts :: endings / endings`.
The server joins a random start + ending and uses an emoji from the same theme,
so text and emoji always match. Add more starts/endings for even more variety.
Optional: set `ANTHROPIC_API_KEY` and tick "Use Claude AI" in admin for brand-new AI-written lines
(falls back to the generator if the key is missing or the call fails).

## Put it online (live)
Upload this folder to Render, Railway, Fly.io or any Node host. Start command: `npm start`.
Set environment variables `ADMIN_PASSWORD` (and optionally `SECRET`, `ANTHROPIC_API_KEY`).
Note: free hosts may reset files on redeploy — attach a persistent disk for `data/`, or download your content backup first.
