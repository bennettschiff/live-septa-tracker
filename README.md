# Live SEPTA Tracker

A one-glance departure board for Berks station on SEPTA's Market-Frankford
Line (L1), built for checking from a phone. It shows westbound trains leaving
Berks, eastbound trains tracked from Center City back toward Berks, the
southbound Broad Street Line at City Hall, and any active L1 service alerts.

**Live:** https://live-septa-tracker.vercel.app · Vanilla JS · Node · Vercel functions · installable PWA

## How it works

```
 Browser (PWA) ──► /api/arrivals (Vercel function) ──► SEPTA real-time + alerts APIs
                         │
                         └─ data/*.json  GTFS schedule extracts (stop times, calendars)
```

- **Real-time first, schedule as context.** SEPTA's real-time feed returns
  predicted departures as loosely formatted text. `lib/tracker.js` parses it,
  then matches each prediction to its scheduled trip from the GTFS extracts,
  so the board can show how late a train is running, not just when it leaves.
- **Correct service day.** GTFS times can run past midnight (`25:10:00`) and
  service depends on the calendar and its exceptions. Times are resolved in
  `America/New_York` regardless of where the function runs.
- **Both directions, one request.** The function fans out to every target
  stop in parallel and returns one payload, so the page makes a single call
  per refresh.
- **Installable.** A web manifest and a service worker cache the shell, so
  it opens like an app from the home screen.

## Running it

```bash
npm start   # http://127.0.0.1:3000
```

No API keys are needed: SEPTA's real-time endpoints are public.

## Layout

```
index.html, app.js, styles.css   the board
api/arrivals.js                  Vercel function → lib/tracker.js
lib/tracker.js                   fetch, parse, schedule matching, alerts
data/                            GTFS schedule extracts
server.js                        local dev server
```
