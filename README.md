# otto-server

HTTP server surface for Otto runtime and update visibility.

## What this repo does

This repo provides a small Fastify-based server that exposes Otto status and integration endpoints.

Default routes include:

- GET /health
- GET /modules
- GET /updates
- GET /

The update route is aligned to the shared protocol contract and currently serves CourseForge-compatible update metadata for tracer-bullet flows.

## Key entry points

- src/server/server.ts: server composition and route registration
- src/routes: route handlers
- src/modules/moduleHost.ts: module host state
- src/updates/updateHost.ts: update host state

## Quick start

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Ecosystem role

Use this repo when you need a network-facing endpoint for Otto health, module inventory, or update descriptors.
