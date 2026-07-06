// src/routePrefetch.js
// Triggers a route's React.lazy() import ahead of the actual navigation click,
// on hover/focus of its nav link. This is the same dynamic import() each
// lazy() call in App.jsx already uses — calling it early just warms the
// browser's module cache so the click itself has nothing left to fetch.
// Purely an optimization: if a hover never happens (e.g. touch/keyboard-only
// navigation without prior focus), the click still works exactly as before.

const prefetchers = {
  "/": () => import("./pages/Home"),
  "/login": () => import("./pages/Login"),
  "/register": () => import("./pages/Register"),
  "/news": () => import("./pages/News"),
  "/jobs": () => import("./pages/Jobs"),
  "/interview": () => import("./pages/InterviewSetup"),
  "/dashboard": () => import("./pages/dashboard/DashboardOverview"),
  "/dashboard/assessments": () => import("./pages/dashboard/Assessments"),
  "/dashboard/problems": () => import("./pages/dashboard/Problems"),
  "/dashboard/candidates": () => import("./pages/dashboard/Candidates"),
  "/dashboard/clash-history": () => import("./pages/dashboard/ClashHistory"),
  "/dashboard/clash-questions": () => import("./pages/dashboard/ClashQuestions"),
  "/dashboard/account": () => import("./pages/dashboard/Account"),
  "/dashboard/settings": () => import("./pages/dashboard/Settings"),
};

const attempted = new Set();

export function prefetchRoute(path) {
  const loader = prefetchers[path];
  if (!loader || attempted.has(path)) return;

  attempted.add(path);
  loader().catch(() => {
    // Best-effort only — if this fails (e.g. offline), let the real
    // navigation's own lazy import retry rather than surfacing an error here.
    attempted.delete(path);
  });
}
