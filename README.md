# SkillPilot

SkillPilot is a React + Vite platform for interview preparation, coding assessments, and competitive coding experiences.

It includes:

- Public landing experience with authentication
- AI interview flow (setup, live interview room, final report)
- Dashboard for assessments, problems, candidates, and settings
- Public tech news feed with personalization and saved articles

## Tech Stack

- React 19
- React Router 7
- Vite 7
- Firebase (Auth, Firestore, Storage)
- Framer Motion
- Tailwind CSS
- Lucide React

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Create production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Environment Variables

Create a `.env` file in the project root and add the keys below:

```env
VITE_GROQ_API_KEY=your_groq_key
VITE_GNEWS_API_KEY=your_gnews_key
```

Notes:

- The AI interview service uses `VITE_GROQ_API_KEY`.
- The News page uses `VITE_GNEWS_API_KEY`.

## Run Locally

```bash
npm install
npm run dev
```

## Routing Overview

Public routes:

- `/`
- `/login`
- `/register`
- `/news`
- `/terminal`
- `/clash`

AI interview routes:

- `/interview`
- `/interview/room`
- `/interview/report`

Assessment routes:

- `/assessment/invite/:token`
- `/assessment/take/:id`

Dashboard routes:

- `/dashboard`
- `/dashboard/assessments`
- `/dashboard/problems`
- `/dashboard/candidates`
- `/dashboard/account`
- `/dashboard/settings`

## Performance Optimizations Implemented

- Route-level lazy loading in `src/App.jsx`
- Suspense fallback for route loading states
- Lazy Firebase auth listener loading on public pages (`src/pages/Home.jsx`, `src/components/PublicNavbar.jsx`)
- Manual Vite chunk splitting for `firebase`, `react-vendor`, `router`, `motion`, and `icons`

## Project Structure

```text
skillpilot/
├── package.json
├── package-lock.json
├── README.md
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── public/
│   └── vite.svg
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── index.css
    ├── components/
    │   ├── BackgroundGlow.jsx
    │   ├── CustomCursor.jsx
    │   ├── DashboardLayout.jsx
    │   ├── MainLayout.jsx
    │   ├── Navbar.jsx
    │   ├── Noise.jsx
    │   ├── PublicNavbar.jsx
    │   └── SmoothScroll.jsx
    ├── lib/
    │   └── firebase.js
    ├── services/
    │   └── geminiService.js
    └── pages/
        ├── Clash.jsx
        ├── Home.jsx
        ├── Interview.jsx
        ├── InterviewReport.jsx
        ├── InterviewRoom.jsx
        ├── InterviewSetup.jsx
        ├── InviteVerify.jsx
        ├── LandingPage.jsx
        ├── Login.jsx
        ├── News.jsx
        ├── Register.jsx
        ├── TakeAssessment.jsx
        └── dashboard/
            ├── Account.jsx
            ├── AssessmentDetail.jsx
            ├── AssessmentResults.jsx
            ├── Assessments.jsx
            ├── CandidateResult.jsx
            ├── Candidates.jsx
            ├── CreateAssessment.jsx
            ├── CreateProblem.jsx
            ├── DashboardOverview.jsx
            ├── EditAssessment.jsx
            ├── EditProblem.jsx
            ├── InviteCandidates.jsx
            ├── ProblemDetail.jsx
            ├── Problems.jsx
            └── Settings.jsx
```

## Deployment Notes

- Run `npm run build` before deployment.
- Serve the `dist/` folder from your static hosting provider.
- Ensure environment variables are configured in your hosting platform.
