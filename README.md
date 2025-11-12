# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/015b1ef1-7fa9-4aa0-bbad-1d7334be0f80

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/015b1ef1-7fa9-4aa0-bbad-1d7334be0f80) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/015b1ef1-7fa9-4aa0-bbad-1d7334be0f80) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Deploy to Vercel

This project is a Vite + React SPA and works great on Vercel.

- Prerequisites: Node.js 18+, Vercel account and CLI (optional).
- Build command: `npm run build`
- Output directory: `dist`

### Configure Environment Variables

Add the following keys in Vercel Project Settings → Environment Variables (or in a local `.env` file). All keys must start with `VITE_` to be available in the client bundle.

- `VITE_DEFAULT_CHAIN_ID` — chain id (e.g. `22469`)
- `VITE_DEFAULT_CHAIN_NAME` — chain name (e.g. `HII Testnet`)
- `VITE_DEFAULT_CHAIN_RPC_URL` — RPC URL (e.g. `https://rpc-sb.teknix.dev`)
- `VITE_DEFAULT_CHAIN_EXPLORER` — explorer tx base (optional)
- `VITE_SUBGRAPH_URL` — GraphQL subgraph endpoint
- `VITE_V4_POOL_MANAGER` — Uniswap V4 PoolManager
- `VITE_V4_POSITION_MANAGER` — Uniswap V4 PositionManager
- `VITE_V4_STATE_VIEW` — Uniswap V4 StateView
- `VITE_V4_PERMIT2` — Permit2 address
- `VITE_V4_QUOTER` — V4 Quoter (optional)
- `VITE_V4_UNIVERSAL_ROUTER` — Universal Router (optional)

You can copy `.env.example` to create your own `.env.development` and `.env.production`.

### Deploy Steps

1. Push code to GitHub.
2. Import the repo in Vercel.
3. Add environment variables as above (Production/Preview/Development scopes as needed).
4. Vercel auto-detects Vite and will build and deploy.
