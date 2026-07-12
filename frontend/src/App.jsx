// src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SmoothScroll from "./components/SmoothScroll";
import CustomCursor from "./components/CustomCursor";
import ClashMobileBlock from "./pages/ClashMobileBlock";
import { useIsMobileDevice } from "./hooks/useIsMobileDevice";

// Public Pages
const MainLayout = lazy(() => import("./components/MainLayout"));
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const LandingPage = lazy(() => import("./pages/LandingPage"));

//jobs page
const Jobs = lazy(() => import("./pages/Jobs"));

// Dashboard Pages
const DashboardLayout = lazy(() => import("./components/DashboardLayout"));
const DashboardOverview = lazy(() => import("./pages/dashboard/DashboardOverview"));
const ClashHistory = lazy(() => import("./pages/dashboard/ClashHistory"));
const ClashQuestions = lazy(() => import("./pages/dashboard/ClashQuestions"));

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

// AI Interview Pages -- Classic flow, unchanged
const InterviewSetup = lazy(() => import("./pages/InterviewSetup"));
const InterviewRoom = lazy(() => import("./pages/InterviewRoom"));
const InterviewReport = lazy(() => import("./pages/InterviewReport"));

// AI Interview Pages -- mode selection + AI Panel flow (new)
const ModeSelect = lazy(() => import("./pages/ModeSelect"));
const PanelSetup = lazy(() => import("./pages/PanelSetup"));
const PanelRoom = lazy(() => import("./pages/PanelRoom"));
const PanelReport = lazy(() => import("./pages/PanelReport"));

// Dev-only test page (not linked from any nav, DEV-build only -- see route below)
const PanelTest = import.meta.env.DEV ? lazy(() => import("./pages/dev/PanelTest")) : null;

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-neutral-400 font-mono text-sm">
      Loading page...
    </div>
  );
}

// Decides BEFORE Clash's module ever loads (its Monaco Editor import, its
// Firestore listeners, its boot-sequence animation all live inside that
// lazy-loaded module) whether to render it at all. On a real mobile device,
// <Clash /> is simply never the result of this render -- React's lazy()
// only triggers the dynamic import() when a lazy component actually gets
// rendered, so ClashMobileBlock (a plain, dependency-free component) is the
// only thing that ever mounts for a phone-sized touch device.
function ClashGate() {
  const isMobile = useIsMobileDevice();
  return isMobile ? <ClashMobileBlock /> : <Clash />;
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
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/interview" element={<InterviewSetup />} />
              <Route path="/interview/select" element={<ModeSelect />} />
              <Route path="/interview/panel" element={<PanelSetup />} />
            </Route>

            {/* THE HACKER TERMINAL THEME */}
            <Route path="/terminal" element={<LandingPage />} />

            {/* FULL SCREEN INTERFACES - Lenis disabled on these */}
            <Route path="/assessment/invite/:token" element={<InviteVerify />} />
            <Route path="/assessment/take/:id" element={<TakeAssessment />} />
            <Route path="/clash" element={<ClashGate />} />

            {/* AI INTERVIEW - Full screen for room & report (Classic, unchanged) */}
            <Route path="/interview/room" element={<InterviewRoom />} />
            <Route path="/interview/report" element={<InterviewReport />} />

            {/* AI PANEL INTERVIEW - full screen for room & report */}
            <Route path="/interview/panel/room" element={<PanelRoom />} />
            <Route path="/interview/panel/report" element={<PanelReport />} />

            {/* DEV-ONLY TEST PAGE (import.meta.env.DEV only, stripped from production builds) */}
            {import.meta.env.DEV && <Route path="/dev/panel-test" element={<PanelTest />} />}

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

              {/* CLASH */}
              <Route path="clash-history" element={<ClashHistory />} />
              <Route path="clash-questions" element={<ClashQuestions />} />

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
