# Credits

JDK Learning System is a learning management system for the Polytechnic College of La Union. This file lists what it is built on.

## Design

- The onboarding screens follow mockups supplied by the project owner.
- Logo: the Polytechnic College of La Union seal (`assets/pclu-seal.png`).

## Content

- The two starter courses (Digital Literacy, Networking Basics) are seeded into the database by
  `supabase/migrations/20261116b_phase2_seed_bundled_courses.sql` and `20261117b_phase4_seed_dl_pretest.sql`; instructors edit them in the app.
  They were drafted with Claude (Anthropic). A human subject-matter reviewer should check accuracy before learners use them.

## Software

| Package | Use | License |
|---|---|---|
| React, React DOM | UI | MIT |
| Vite | Build tool | MIT |
| vite-plugin-pwa | Service worker and precache | MIT |
| Tailwind CSS | Styling | MIT |
| React Router | Navigation | MIT |
| lucide-react | Icons | ISC |
| Dexie | IndexedDB (offline storage) | Apache-2.0 |
| pdf-lib, @pdf-lib/fontkit | Certificate PDFs and uploaded fonts | MIT |
| qrcode | QR code on certificates | MIT |
| zod | Content and input validation | MIT |
| @supabase/supabase-js | Auth, database, realtime client | MIT |
| Capacitor | Android app wrapper | MIT |

### Chatbot backend (`ChatBot/`)

| Package | Use | License |
|---|---|---|
| FastAPI, Uvicorn | Web API server | MIT, BSD-3-Clause |
| Pydantic, pydantic-settings | Request validation and settings | MIT |
| SQLAlchemy | Read-only database access | MIT |
| openai (Python SDK) | OpenAI-compatible client used for OpenRouter | Apache-2.0 |
| httpx | Supabase sign-in checks | BSD-3-Clause |
| psycopg | PostgreSQL driver | LGPL-3.0 |
| pytest | Backend tests (development only) | MIT |

## Services

- Supabase: authentication and Postgres database (Row Level Security enabled).
- Supabase Edge Functions and pg_cron: invitation emails.
- Cloudflare Workers: hosting for the web app.
- Web Speech API: device text to speech for "Listen" on module pages.
- OpenRouter: hosts the AI models behind the chatbot (free models, tried in order).
- Vercel: hosting for the chatbot backend (`ChatBot/vercel.json`).

## Features

- JDK Assistant (`src/components/ChatWidget.jsx`, `ChatBot/app/assistant.py`): floating learning assistant for signed-in learners, with saved FAQ and glossary answers when offline (`src/lib/offlineAnswer.js`).
- Analytics assistant (`ChatBot/app/agent.py`, `ChatBot/app/sql_guard.py`): administrator-only chat over anonymous, read-only analytics views (`supabase/migrations/20261124c_analytics_views.sql`).
- The assistant chat panel layout follows a mockup supplied by the project owner.

## Testing tools (development only)

- Node.js built-in test runner.
- PGlite: in-process Postgres that runs every migration and checks the database rules.

## Notes

- License names above are the packages' published licenses as commonly listed. Confirm against each package's `LICENSE` file in `node_modules/` before distributing.
- AI assistance: the app code, chatbot backend, SQL and tests were written with Claude Code (Anthropic). AI chatbot answers come from third-party models and can be wrong; they are not a substitute for the lessons.
- Adaptive features are fixed rules, not a trained AI model.
