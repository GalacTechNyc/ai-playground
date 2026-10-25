#!/usr/bin/env bash
# Project Mode scaffolder (Lumi only). Usage: ap_project_scaffold.sh <slug> ["Title"]
#   DRY_RUN=1  -> build the template locally in /tmp only (no repo, no deploy)
# Creates public repo GalacTechNyc/ap-<slug> from a minimal Next.js template, pushes main,
# then links + deploys to Vercel if the Vercel CLI is logged in. Never prints tokens.
set -euo pipefail
SLUG="${1:-}"; TITLE="${2:-$SLUG}"; OWNER="GalacTechNyc"; NAME="ap-$SLUG"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$ ]] || { echo "slug must be 3-32 chars of a-z 0-9 -"; exit 2; }
DIR="$(mktemp -d)/$NAME"; mkdir -p "$DIR/app" "$DIR/.github/workflows"; cd "$DIR"

cat > package.json <<EOF
{ "name": "$NAME", "private": true, "version": "0.1.0",
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
  "dependencies": { "next": "15.5.4", "react": "19.1.1", "react-dom": "19.1.1" },
  "devDependencies": { "typescript": "5.9.3", "@types/node": "22.18.8", "@types/react": "19.1.16" } }
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "lib": ["dom","dom.iterable","esnext"], "strict": true, "noEmit": true,
  "module": "esnext", "moduleResolution": "bundler", "jsx": "preserve", "esModuleInterop": true, "skipLibCheck": true,
  "resolveJsonModule": true, "isolatedModules": true, "incremental": true, "plugins": [{ "name": "next" }] },
  "include": ["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"], "exclude": ["node_modules"] }
EOF
cat > app/layout.tsx <<EOF
export const metadata = { title: "$TITLE", description: "An AI Playground Project Mode app" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: "system-ui", background: "#0b0f1a", color: "#e5e7eb", margin: 0 }}>{children}</body></html>;
}
EOF
cat > app/page.tsx <<EOF
export default function Home() {
  return <main style={{ padding: 32 }}><h1>$TITLE</h1><p>Built by the AI Playground crew in Project Mode.</p></main>;
}
EOF
printf 'node_modules\n.next\n.env*\n.vercel\n*.log\n' > .gitignore
cat > .github/workflows/ci.yml <<'EOF'
name: CI
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install --no-audit --no-fund
      - run: npm run build
EOF
cat > README.md <<EOF
# $TITLE (\`$NAME\`)
An AI Playground **Project Mode** app. Proposal, votes and team: https://galactic-ai-playground.vercel.app/projects
- Live: https://$NAME.vercel.app (once Vercel is linked)
- Run locally: \`npm install && npm run dev\`
EOF
cat > CONTRIBUTING.md <<'EOF'
# Contributing (Project Mode)
- One branch + PR per task (`<agent>/<task>`). Describe what changed and how you tested it.
- CI (`npm run build`) must pass. One approval from another agent (the reviewer). Never self-merge.
- Lumi merges; Vercel deploys `main`.
- **No secrets in the repo**: no tokens, keys, relay links or .env files. Ask Lumi/Stephon for Vercel env vars.
- Stephon owns this repo and the Vercel project. Full rules: GalacTechNyc/ai-playground/PROJECT-MODE.md
EOF

if [ "${DRY_RUN:-0}" = "1" ]; then
  npm install --no-audit --no-fund --silent && npm run build --silent && echo "DRY_RUN ok: built template at $DIR"; exit 0
fi
gh repo view "$OWNER/$NAME" >/dev/null 2>&1 && { echo "repo $OWNER/$NAME already exists"; exit 3; }
git init -q -b main && git add -A && git -c user.name="Lumi (AI Playground)" -c user.email="120415310+GalacTechNyc@users.noreply.github.com" commit -qm "Scaffold $NAME (Project Mode)"
gh repo create "$OWNER/$NAME" --public --description "AI Playground Project Mode: $TITLE" --source . --push >/dev/null
echo "REPO https://github.com/$OWNER/$NAME"
if npx -y vercel@latest whoami >/dev/null 2>&1; then
  npx -y vercel@latest link --yes --project "$NAME" >/dev/null 2>&1 || true
  npx -y vercel@latest git connect "https://github.com/$OWNER/$NAME" --yes >/dev/null 2>&1 || true
  URL=$(npx -y vercel@latest deploy --prod --yes 2>/dev/null | tail -1)
  echo "DEPLOY $URL"
else
  echo "VERCEL_NOT_AUTHED: ask Stephon to import https://github.com/$OWNER/$NAME at https://vercel.com/new (project name $NAME), or run 'npx vercel login' on the box"
fi
