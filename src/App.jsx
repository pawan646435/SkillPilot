// src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SmoothScroll from "./components/SmoothScroll";
import CustomCursor from "./components/CustomCursor";

// Public Pages
const MainLayout = lazy(() => import("./components/MainLayout"));
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const LandingPage = lazy(() => import("./pages/LandingPage"));

// Dashboard Pages
const DashboardLayout = lazy(() => import("./components/DashboardLayout"));
const DashboardOverview = lazy(() => import("./pages/dashboard/DashboardOverview"));

// Dashboard Account Page
const Account = lazy(() => import("./pages/dashboard/Account"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));

// Assessment Pages
const Assessments = lazy(() => import("./pages/dashboard/Assessments"));
const CreateAssessment = lazy(() => import("./pages/dashboard/CreateAssessment"));
const AssessmentDetail = lazy(() => import("./pages/dashboard/AssessmentDetail"));
const EditAssessment = lazy(() => import("./pages/dashboard/EditAssessment"));
const InviteCandidates = lazy(() => import("./pages/dashboard/InviteCandidates"));
const AssessmentResults = lazy(() => import("./pages/dashboard/AssessmentResults"));
const CandidateResult = lazy(() => import("./pages/dashboard/CandidateResult"));

// Problem Pages
const Problems = lazy(() => import("./pages/dashboard/Problems"));
const CreateProblem = lazy(() => import("./pages/dashboard/CreateProblem"));
const ProblemDetail = lazy(() => import("./pages/dashboard/ProblemDetail"));
const EditProblem = lazy(() => import("./pages/dashboard/EditProblem"));

// Candidates Page
const Candidates = lazy(() => import("./pages/dashboard/Candidates"));

// News Page
const News = lazy(() => import("./pages/News"));

// Interfaces
const InviteVerify = lazy(() => import("./pages/InviteVerify"));
const TakeAssessment = lazy(() => import("./pages/TakeAssessment"));
const Clash = lazy(() => import("./pages/Clash"));

// AI Interview Pages
const InterviewSetup = lazy(() => import("./pages/InterviewSetup"));
const InterviewRoom = lazy(() => import("./pages/InterviewRoom"));
const InterviewReport = lazy(() => import("./pages/InterviewReport"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-neutral-400 font-mono text-sm">
      Loading page...
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SmoothScroll>
        <CustomCursor />

        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* PUBLIC ROUTES */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/news" element={<News />} />
            </Route>

            {/* THE HACKER TERMINAL THEME */}
            <Route path="/terminal" element={<LandingPage />} />

            {/* FULL SCREEN INTERFACES - Lenis disabled on these */}
            <Route path="/assessment/invite/:token" element={<InviteVerify />} />
            <Route path="/assessment/take/:id" element={<TakeAssessment />} />
            <Route path="/clash" element={<Clash />} />

            {/* AI INTERVIEW - Full screen, Lenis disabled */}
            <Route path="/interview" element={<InterviewSetup />} />
            <Route path="/interview/room" element={<InterviewRoom />} />
            <Route path="/interview/report" element={<InterviewReport />} />

            {/* DASHBOARD ROUTES WITH SIDEBAR */}
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<DashboardOverview />} />

              {/* ASSESSMENTS CRUD */}
              <Route path="assessments" element={<Assessments />} />
              <Route path="assessments/create" element={<CreateAssessment />} />
              <Route path="assessments/:id" element={<AssessmentDetail />} />
              <Route path="assessments/:id/edit" element={<EditAssessment />} />
              <Route path="assessments/:id/invite" element={<InviteCandidates />} />
              <Route path="assessments/:id/results" element={<AssessmentResults />} />
              <Route path="assessments/:id/results/:candidateId" element={<CandidateResult />} />

              {/* PROBLEMS CRUD */}
              <Route path="problems" element={<Problems />} />
              <Route path="problems/create" element={<CreateProblem />} />
              <Route path="problems/:id" element={<ProblemDetail />} />
              <Route path="problems/:id/edit" element={<EditProblem />} />

              {/* CANDIDATES */}
              <Route path="candidates" element={<Candidates />} />

              {/* ACCOUNT & SETTINGS */}
              <Route path="account" element={<Account />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </SmoothScroll>
    </BrowserRouter>
  );
}

export default App;
