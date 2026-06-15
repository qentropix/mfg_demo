# Sumex Demo Dashboard

A full-stack demo that recreates the `Slide4.jpg` industrial dashboard concept with React, Node.js, and PostgreSQL.

## What’s included

- React dashboard UI with a dark control-room style
- Express API for dashboard metrics, presses, alerts, and trends
- PostgreSQL schema and seed data for realistic demo content
- Write endpoints you can call from Postman to modify the live demo data
- Fallback demo data so the app still runs if Postgres is not connected

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example env file:
   ```bash
   copy .env.example .env
   ```
3. Start PostgreSQL and create the database:
   ```sql
   CREATE DATABASE sumex_demo;
   ```
4. Load schema and seed data:
   ```bash
   npm run db:setup
   ```
5. Start the app:
   ```bash
   npm run dev
   ```

## Production build

```bash
npm run build
npm run server
```

The server serves the built React app from `dist/` when it exists.

## Read endpoints

- `GET /api/health`
- `GET /api/dashboard?shift=Shift%20A`
- `GET /api/shifts`
- `GET /api/presses?shift=Shift%20A`
- `GET /api/alerts?shift=Shift%20A`

## Write endpoints

### Update a press

`PATCH /api/presses/Press%2003?shift=Shift%20A`

Example body:
```json
{
  "status": "Down",
  "oee": 0,
  "downtimeMinutes": 95,
  "currentJob": "Maintenance Hold"
}
```

### Update the dashboard snapshot

`PATCH /api/dashboard/snapshot?shift=Shift%20A`

Example body:
```json
{
  "overallOee": 72.4,
  "totalOutput": 17600,
  "goodParts": 16320,
  "downtimeLabel": "3h 10m",
  "downtimeMinutes": 190,
  "activeAlerts": 5,
  "criticalAlerts": 3,
  "warningAlerts": 2,
  "qualityRate": 92.7
}
```

### Create an alert

`POST /api/alerts?shift=Shift%20A`

Example body:
```json
{
  "severity": "critical",
  "title": "Press 03 stopped",
  "message": "Press 03 was switched to Down from Postman.",
  "isActive": true
}
```

## Database files

- `database/schema.sql`
- `database/seed.sql`
