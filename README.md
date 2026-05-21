# Frontend README

This frontend is a Next.js app for the Slack-like chat project. It talks to the backend only through the gateway service.

## Runtime

- Framework: Next.js
- Default port: `3005`
- Gateway API URL: `http://localhost:3000`

## Run with Docker

The recommended way to run the full project on a fresh machine is from the repository root:

```bash
docker compose up --build
```

Then open:

```bash
http://localhost:3005
```

The Docker build passes `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000` by default, so the browser calls the gateway container through the host-mapped port.

## Frontend-only local development

Start backend and infrastructure first from the repository root:

```bash
docker compose up -d postgres-identity postgres-workspace postgres-chat redis kafka identity workspace chat gateway
```

Copy the env file:

```bash
cp frontend/.env.example frontend/.env
```

The local frontend env should contain:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

Install dependencies and start the dev server:

```bash
cd frontend
npm install
npm run dev -- -p 3005
```

Open:

```bash
http://localhost:3005
```

## Build and lint

```bash
cd frontend
npm run lint
npm run build
```

## Important environment behavior

`NEXT_PUBLIC_API_BASE_URL` is a public browser variable. For Docker local development it should normally stay as:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

Use a different value only if the gateway is exposed at a different URL.

## Main app flows

- Sign up and sign in through the gateway.
- Create or join a workspace.
- Create public or private channels.
- Invite workspace members to private channels.
- Send messages through Socket.IO.
- React, reply, and edit messages within the allowed time window.
- Open channel settings to manage members and channel visibility.

## Notes for GitHub users

Do not commit real `.env` files. Keep provider secrets such as Google OAuth, SMTP, Resend, and Cloudinary values outside Git.
