## Co-Pet

Shared virtual pet (2 users) built with Next.js + TypeScript + Tailwind.

## Supabase setup

- **Create a Supabase project**
- **Set env vars**: copy `.env.example` to `.env.local` and fill:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- **Create the `pet_state` table**
  - Option A (recommended): use the Supabase CLI and run the migration in `supabase/migrations/20260415190000_create_pet_state.sql`
  - Option B: paste that SQL into the Supabase SQL Editor and run it

## Verify it works

Start the dev server:

```bash
npm run dev
```

Then, test the API:

```bash
curl -X POST "http://localhost:3000/api/pet-state" \
  -H "content-type: application/json" \
  -d '{"mood":"happy","hunger_level":25}'
curl "http://localhost:3000/api/pet-state"
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.


## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
