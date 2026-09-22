# Gateway Engine

A stateless proxy gateway built with Node.js, Express, and TypeScript. It routes pages through a path-prefixed proxy, rewrites relative assets, and keeps navigation inside the gateway shell.

## Architecture
The proxy uses a path-prefixed architecture (`/__p/URL`). Each request carries its target URL, so the server does not need per-user target state.

## Features
- **Stateless Proxying**: No server-side target caching or global variables.
- **Header Manipulation**: Removes headers that prevent embedding and sets a browser-like User-Agent.
- **Relative Path Resolution**: Injects `<base>` tags to fix broken assets (CSS, JS, Images) on destination sites.
- **Domain Blacklisting**: Custom User-Agent routing logic based on the target domain.

## Tech Stack
- [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware)

## Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/gateway-engine.git](https://github.com/yourusername/gateway-engine.git)
   cd gateway-engine
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   HOST=localhost
   DEFAULT_ENGINE=https://duckduckgo.com/?q=
   ```

## Usage

Start the development server:
```bash
npm run dev
```

For a production-style local run:

```bash
npm start
```

Run the TypeScript validation without starting the server:

```bash
npm run typecheck
```
The engine UI will be available at `http://localhost:3000/`.

## Project Structure
```text
gateway-engine/
├── .env
├── .gitignore
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.json
├── public/
│   └── css/
│       ├── shell.css
│       └── style.css
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── env.config.ts
│   ├── middlewares/
│   │   └── error.middleware.ts
│   ├── proxy/
│   │   └── proxy.handler.ts
│   ├── routes/
│   │   ├── engine.routes.ts
│   │   └── view.routes.ts
│   └── utils/
│       └── url.parser.ts
└── views/
    ├── index.ejs
    └── shell.ejs
```
