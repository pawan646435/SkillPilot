# SkillPilot 🚀

SkillPilot is a sophisticated, AI-enhanced platform designed for modern interview preparation, coding assessments, and competitive real-time coding experiences. It bridges the gap between learning and hiring by providing high-fidelity simulations for both candidates and recruiters.

---

## 🏗️ Project Architecture

SkillPilot follows a **standalone FastAPI backend on Cloud Run** architecture designed for scalability and low-latency real-time interactions:

- **Frontend Hub**: A high-performance Single Page Application (SPA) built with React and Vite. It leverages real-time listeners for collaborative features (like Code Battles) and a modular component system for a premium user experience.
- **Backend Infrastructure**: Powered by a **FastAPI service on Google Cloud Run** (see `backend/README.md`) — a secure proxy to sensitive external APIs that handles complex server-side logic (e.g., code evaluation, AI interview processing, RAG-grounded multi-agent interviews). Replaces the earlier Firebase Cloud Functions + Vercel serverless split (see `docs/backend-migration-explained.md`).
- **Real-time Engine**: Utilizes **Firestore** for multi-user synchronization in Code Battles and high-availability data storage.
- **AI Domain**: Integrates **LLM (Groq)** via the FastAPI backend to handle live interview persona simulation and final feedback reporting.

---

## 🛠️ Tech Stack

### Frontend
- **Core**: React 19 + Vite 7 (High-speed HMR and build optimization)
- **Styling**: Vanilla CSS + Tailwind CSS (Custom glassmorphism design system)
- **Animations**: Framer Motion (Fluid transitions and micro-interactions)
- **Icons**: Lucide React
- **Editor**: Monaco Editor (The core of VS Code) for the IDE experience

### Backend & Infrastructure
- **Cloud Provider**: Google Cloud Run (deployed in `asia-south1`)
- **Backend**: FastAPI (Python) — see `backend/README.md`
- **Database**: Firestore (NoSQL, real-time sync)
- **Authentication**: Firebase Auth (Social Login + Email/Password)
- **Secret Management**: Google Secret Manager (`--set-secrets`) in production, `.env` locally

### External Integrations
- **AI Engine**: Groq SDK (Powered by Llama 3 / Mixtral)
- **Job Engine**: JSearch API (Optimized for India-only job discovery)
- **News Engine**: Currents API (Personalized tech news feed)

---

## 🌟 Key Features

### ⚔️ Code Battle (Clash)
- Real-time 1v1 coding competitions.
- Automatic question generation with categories like DSA, System Design, and Frontend.
- Live opponent activity tracking.
- Intelligent code execution and test-case evaluation.
- Dynamic randomization ensuring unique question sets every battle.

### 🤖 AI Interviews
- Voice and text-based interactive interviews.
- Real-time AI feedback and professional performance reports.
- Customizable difficulty and stack selection.

### 💼 Career Hub
- India-only job search engine powered by real-time data.
- Personalized tech news feed to stay updated with the industry.

### 📊 Recruiter Dashboard
- End-to-end assessment management.
- Candidate invitation system.
- Detailed result analytics and problem creation suite.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Setup Firebase & backend:
   - Ensure your Firebase project is configured in `src/lib/firebase.js`.
   - Run the FastAPI backend locally per `backend/README.md`, and point `VITE_API_BASE_URL` (see `.env.example`) at it.
4. Run locally:
   ```bash
   npm run dev
   ```

---

## 👤 Credits

**Made with ❤️ by Pawan**
