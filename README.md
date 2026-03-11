# SaverHunt: Premium Price Comparison & Social Commerce

SaverHunt is a high-performance monorepo featuring a FastAPI backend (`engine/`) and an Expo-powered React Native frontend (`mobile/`).

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (3.10+)
- **Redis** (Required for Celery tasks/scraping)
- **Supabase Account** (For Auth & Database)

---

### 2. Backend Setup (`engine/`)

Navigate to the engine directory and start the API.

```bash
cd engine
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

> [!NOTE]
> The backend runs on `http://127.0.0.1:8000`. Ensure your `.env` file in `engine/` is populated with `SUPABASE_URL`, `SUPABASE_KEY`, and `GENAI_API_KEY`.

#### Running Background Workers (Scrapers)
To enable live price scraping, you must run a Celery worker:
```bash
celery -A tasks.celery_app worker --loglevel=info
```

---

### 3. Frontend Setup (`mobile/`)

Navigate to the mobile directory and start the Expo development server.

```bash
cd mobile
npm install
npx expo start
```

- **iOS**: Press `i` to open in Simulator.
- **Android**: Press `a` to open in Emulator.
- **Physical Device**: Scan the QR code with the Expo Go app.

> [!IMPORTANT]
> Ensure your `.env` file in `mobile/` has:
> - `EXPO_PUBLIC_SUPABASE_URL`
> - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
> - `EXPO_PUBLIC_FASTAPI_URL` (Set this to your local IP if testing on a physical device)

---

## 🛠 Features
- **Premium Auth**: Glassmorphic login with Supabase integration.
- **Cinematic Onboarding**: Immersive first-time user experience.
- **AR Showrooms**: Mix & match outfits with 360-degree views.
- **Team Up & Save**: Social commerce for group discounts.
- **AI Gift Concierge**: Gemini-powered personalized gift guides.
- **TikTok-style Feed**: High-performance vertical scrolling deal reel.
