# SkillPilot 🚀

SkillPilot is a sophisticated, AI-enhanced platform designed for modern interview preparation, coding assessments, and competitive real-time coding experiences. It bridges the gap between learning and hiring by providing high-fidelity simulations for both candidates and recruiters.

---

## 🏗️ Project Architecture

SkillPilot follows a modern **Serverless/Micro-Backend architecture** designed for scalability and low-latency real-time interactions:

- **Frontend Hub**: A high-performance Single Page Application (SPA) built with React and Vite. It leverages real-time listeners for collaborative features (like Code Battles) and a modular component system for a premium user experience.
- **Backend Infrastructure**: Powered by **Firebase Cloud Functions (Generation 2)**. This layer acts as a secure proxy to sensitive external APIs and handles complex server-side logic (e.g., code evaluation, AI interview processing, scheduling).
- **Real-time Engine**: Utilizes **Firestore** for multi-user synchronization in Code Battles and high-availability data storage.
- **AI Domain**: Integrates **LLM (Groq)** via proxy functions to handle live interview persona simulation and final feedback reporting.

---

## 🛠️ Tech Stack

### Frontend
- **Core**: React 19 + Vite 7 (High-speed HMR and build optimization)
- **Styling**: Vanilla CSS + Tailwind CSS (Custom glassmorphism design system)
- **Animations**: Framer Motion (Fluid transitions and micro-interactions)
- **Icons**: Lucide React
- **Editor**: Monaco Editor (The core of VS Code) for the IDE experience

### Backend & Infrastructure
- **Cloud Provider**: Google Firebase (deployed in `asia-south1`)
- **Serverless**: Firebase Cloud Functions (Node.js)
- **Database**: Firestore (NoSQL, real-time sync)
- **Authentication**: Firebase Auth (Social Login + Email/Password)
- **Secret Management**: `.env` driven backend configurations

### External Integrations
- **AI Engine**: Groq SDK (Powered by Llama 3 / Mixtral)
- **Job Engine**: JSearch API (Optimized for India-only job discovery)
- **News Engine**: GNews API (Personalized tech news feed)

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
3. Setup Firebase:
   - Ensure your Firebase project is configured in `src/lib/firebase.js`.
   - Deploy backend functions located in `firebase-backend/proxy functions for api key/functions`.
4. Run locally:
   ```bash
   npm run dev
   ```

---

## 👤 Credits

**Made with ❤️ by Pawan**
