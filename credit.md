# Credits

JDK Learning System is an offline-first adaptive learning app. This file lists what it is built on.

## Design

- The nine screen mockups in `images-mockup/` (Welcome to Learning Path) are the UI design source supplied by the project owner.

## Content

- Digital Literacy lessons and questions: `src/data/`.
- Networking Basics lessons, activities, glossary and 48 assessment questions: `src/content/networking-basics/`. Drafted with Claude (Anthropic). A human subject-matter reviewer should check accuracy before learners use it.

## Software

| Package | Use | License |
|---|---|---|
| React, React DOM | UI | MIT |
| Vite | Build tool | MIT |
| vite-plugin-pwa | Service worker and precache | MIT |
| Tailwind CSS | Styling | MIT |
| React Router | Navigation | MIT |
| lucide-react | Icons | ISC |
| Recharts | Charts | MIT |
| Dexie | IndexedDB (offline storage) | Apache-2.0 |
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
- Web Speech API: browser or device text to speech for Auditory mode.
- OpenRouter: hosts the AI models behind the chatbot (free models, tried in order).
- Vercel: hosting for the web app.

## Features

- JDK Assistant (`src/components/ChatWidget.jsx`, `ChatBot/app/assistant.py`): floating learning assistant for signed-in learners, with saved FAQ and glossary answers when offline (`src/lib/offlineAnswer.js`).
- Analytics assistant (`ChatBot/app/agent.py`, `ChatBot/app/sql_guard.py`): administrator-only chat over anonymous, read-only analytics views (`supabase_analytics.sql`).
- The assistant chat panel layout follows a mockup supplied by the project owner.

## Testing tools (development only)

- Node.js built-in test runner.
- PGlite: in-process Postgres used to check `supabase_setup.sql`.
- Playwright (playwright-core) with Microsoft Edge: headless browser checks.

## Notes

- License names above are the packages' published licenses as commonly listed. Confirm against each package's `LICENSE` file in `node_modules/` before distributing.
- AI assistance: the app code, chatbot backend, SQL and tests were written with Claude Code (Anthropic). AI chatbot answers come from third-party models and can be wrong; they are not a substitute for the lessons.
- Adaptive features are fixed rules, not a trained AI model.
