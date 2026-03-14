// src/pages/News.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { Newspaper, Search, ExternalLink, RefreshCw, Clock, X, Bookmark, BookmarkCheck, Sparkles } from "lucide-react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

const GNEWS_KEY = import.meta.env.VITE_GNEWS_API_KEY;

const CATEGORIES = [
  { id: "technology", label: "All Tech" },
  { id: "ai", label: "AI", query: "artificial intelligence OR machine learning" },
  { id: "webdev", label: "Web Dev", query: "javascript OR react OR nextjs OR css OR webdev" },
  { id: "security", label: "Security", query: "cybersecurity OR hacking OR data breach" },
  { id: "startups", label: "Startups", query: "startup funding OR tech startup" },
  { id: "opensource", label: "Open Source", query: "open source OR github release" },
];

const INTEREST_KEYWORDS = {
  ai: ["ai", "artificial intelligence", "machine learning", "llm", "agent", "openai", "gemini", "groq"],
  webdev: ["javascript", "react", "nextjs", "css", "frontend", "typescript", "node"],
  security: ["security", "cyber", "vulnerability", "breach", "hacking", "ransomware"],
  startups: ["startup", "funding", "venture", "acquisition", "founder"],
  opensource: ["open source", "github", "release", "maintainer", "linux"],
};

function getDailyBrief(articles) {
  const top = articles.slice(0, 5);
  const topics = new Set();

  for (const article of top) {
    const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
    Object.entries(INTEREST_KEYWORDS).forEach(([topic, keywords]) => {
      if (keywords.some((keyword) => text.includes(keyword))) {
        topics.add(topic);
      }
    });
  }

  return {
    generatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    highlights: top.map((item) => item.title).filter(Boolean),
    focus: Array.from(topics).map((id) => CATEGORIES.find((c) => c.id === id)?.label).filter(Boolean),
  };
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewsCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3 animate-pulse">
      <div className="h-40 rounded-xl bg-white/5" />
      <div className="w-1/3 h-3 rounded-lg bg-white/5" />
      <div className="w-full h-4 rounded-lg bg-white/5" />
      <div className="w-3/4 h-4 rounded-lg bg-white/5" />
      <div className="w-1/4 h-3 rounded-lg bg-white/5" />
    </div>
  );
}

function NewsCard({ article, index, isSaved, onToggleSave }) {
  return (
    <Motion.a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="group flex flex-col p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 cursor-pointer"
    >
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onToggleSave(article);
          }}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-mono transition-colors ${
            isSaved
              ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
              : "text-neutral-500 border-white/10 bg-white/[0.02] hover:text-white"
          }`}
        >
          {isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
          {isSaved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Image */}
      {article.image && (
        <div className="relative mb-4 overflow-hidden rounded-xl aspect-video bg-white/5">
          <img
            src={article.image}
            alt={article.title}
            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { e.target.parentElement.style.display = "none"; }}
          />
        </div>
      )}

      {/* Source + Time */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-emerald-400 truncate max-w-[60%]">
          {article.source?.name || "Unknown"}
        </span>
        <span className="flex items-center gap-1 text-xs text-neutral-600">
          <Clock className="w-3 h-3" />
          {timeAgo(article.publishedAt)}
        </span>
      </div>

      {/* Title */}
      <h3 className="flex-1 mb-2 text-sm font-semibold leading-snug transition-colors text-neutral-200 group-hover:text-white line-clamp-2">
        {article.title}
      </h3>

      {/* Description */}
      {article.description && (
        <p className="mb-3 text-xs leading-relaxed text-neutral-600 line-clamp-2">
          {article.description}
        </p>
      )}

      {/* Read more */}
      <div className="flex items-center gap-1 mt-auto text-xs transition-colors text-neutral-600 group-hover:text-neutral-400">
        <ExternalLink className="w-3 h-3" />
        Read article
      </div>
    </Motion.a>
  );
}

export default function News() {
  const [user, setUser] = useState(null);
  const [articles, setArticles] = useState([]);
  const [savedArticles, setSavedArticles] = useState({});
  const [viewMode, setViewMode] = useState("feed");
  const [selectedInterests, setSelectedInterests] = useState(["ai", "webdev"]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);

  const storagePrefix = user?.uid ? `skillpilot-news-${user.uid}` : "skillpilot-news-anon";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(`${storagePrefix}-bookmarks`);
    const interests = localStorage.getItem(`${storagePrefix}-interests`);

    if (saved) {
      try {
        setSavedArticles(JSON.parse(saved));
      } catch {
        setSavedArticles({});
      }
    } else {
      setSavedArticles({});
    }

    if (interests) {
      try {
        const parsed = JSON.parse(interests);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedInterests(parsed);
        }
      } catch {
        setSelectedInterests(["ai", "webdev"]);
      }
    }
  }, [storagePrefix]);

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}-bookmarks`, JSON.stringify(savedArticles));
  }, [savedArticles, storagePrefix]);

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}-interests`, JSON.stringify(selectedInterests));
  }, [selectedInterests, storagePrefix]);

  const fetchNews = useCallback(async (cat, query, pageNum, append = false) => {
    if (!GNEWS_KEY) {
      setError("Missing VITE_GNEWS_API_KEY in your .env file.");
      setLoading(false);
      return;
    }

    if (!append) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      let url;
      const searchTerm = query || cat.query;

      if (searchTerm && cat.id !== "technology") {
        url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(searchTerm)}&lang=en&max=9&page=${pageNum}&token=${GNEWS_KEY}`;
      } else if (query) {
        url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=9&page=${pageNum}&token=${GNEWS_KEY}`;
      } else {
        url = `https://gnews.io/api/v4/top-headlines?category=technology&lang=en&max=9&page=${pageNum}&token=${GNEWS_KEY}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const newArticles = data.articles || [];
      setArticles((prev) => append ? [...prev, ...newArticles] : newArticles);
      setHasMore(newArticles.length === 9);
    } catch (e) {
      setError(e.message || "Failed to fetch news.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load + category/search changes
  useEffect(() => {
    setPage(1);
    setArticles([]);
    fetchNews(activeCategory, searchQuery, 1, false);
  }, [activeCategory, searchQuery, fetchNews]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchNews(activeCategory, searchQuery, nextPage, true);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
  };

  const toggleBookmark = (article) => {
    if (!article?.url) return;

    setSavedArticles((prev) => {
      const next = { ...prev };
      if (next[article.url]) {
        delete next[article.url];
      } else {
        next[article.url] = {
          ...article,
          savedAt: Date.now(),
        };
      }
      return next;
    });
  };

  const toggleInterest = (interestId) => {
    setSelectedInterests((prev) => {
      if (prev.includes(interestId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== interestId);
      }
      return [...prev, interestId];
    });
  };

  const rankedArticles = useMemo(() => {
    if (searchQuery || activeCategory.id !== "technology") {
      return articles;
    }

    return [...articles].sort((a, b) => {
      const score = (article) => {
        const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
        return selectedInterests.reduce((sum, interestId) => {
          const keywords = INTEREST_KEYWORDS[interestId] || [];
          const matches = keywords.filter((keyword) => text.includes(keyword)).length;
          return sum + matches;
        }, 0);
      };

      return score(b) - score(a);
    });
  }, [articles, selectedInterests, searchQuery, activeCategory.id]);

  const displayedArticles = viewMode === "saved"
    ? Object.values(savedArticles).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    : rankedArticles;

  const dailyBrief = useMemo(() => {
    const localKey = `${storagePrefix}-daily-brief-${new Date().toISOString().slice(0, 10)}`;
    const cached = localStorage.getItem(localKey);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fall through and regenerate below.
      }
    }

    const brief = getDailyBrief(rankedArticles);
    localStorage.setItem(localKey, JSON.stringify(brief));
    return brief;
  }, [rankedArticles, storagePrefix]);

  return (
    <div className="flex flex-col w-full gap-8 p-6 mx-auto my-8 max-w-7xl md:p-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 text-4xl font-semibold tracking-tight text-white font-display">
            Tech News
          </h1>
          <p className="text-sm text-neutral-400">
            Latest from the world of tech, AI, and open source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("feed")}
            className={`px-3 py-2 rounded-xl border text-xs font-mono transition-colors ${
              viewMode === "feed"
                ? "text-white border-white/20 bg-white/10"
                : "text-neutral-500 border-white/10 bg-white/[0.02] hover:text-white"
            }`}
          >
            For You
          </button>
          <button
            onClick={() => setViewMode("saved")}
            className={`px-3 py-2 rounded-xl border text-xs font-mono transition-colors ${
              viewMode === "saved"
                ? "text-white border-white/20 bg-white/10"
                : "text-neutral-500 border-white/10 bg-white/[0.02] hover:text-white"
            }`}
          >
            Saved ({Object.keys(savedArticles).length})
          </button>
          <button
            onClick={() => fetchNews(activeCategory, searchQuery, 1, false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-400 rounded-xl border border-white/10 bg-white/[0.03] hover:text-white hover:border-white/20 transition-all duration-200"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Daily Brief */}
      {viewMode === "feed" && displayedArticles.length > 0 && (
        <div className="p-5 border rounded-2xl border-emerald-400/20 bg-emerald-400/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-300" />
            <h2 className="text-sm font-semibold text-emerald-300 font-display">Daily Briefing</h2>
            <span className="text-[11px] text-neutral-500 font-mono">Generated {dailyBrief.generatedAt}</span>
          </div>
          {dailyBrief.focus.length > 0 && (
            <p className="mb-3 text-xs text-neutral-400">
              Focus topics: <span className="text-neutral-200">{dailyBrief.focus.join(", ")}</span>
            </p>
          )}
          <ul className="grid gap-2 md:grid-cols-2">
            {dailyBrief.highlights.slice(0, 4).map((headline, idx) => (
              <li key={`${headline}-${idx}`} className="text-xs text-neutral-300 line-clamp-1">
                {idx + 1}. {headline}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-600" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search tech news..."
          className="w-full pl-11 pr-12 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-300 placeholder-neutral-700 focus:outline-none focus:border-white/20 transition-colors font-mono"
        />
        {searchInput && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute transition-colors -translate-y-1/2 right-4 top-1/2 text-neutral-600 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Category Tabs */}
      <div className="flex gap-2 pb-1 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat); setSearchQuery(""); setSearchInput(""); }}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
              activeCategory.id === cat.id
                ? "bg-white/10 border-white/20 text-white"
                : "bg-white/[0.02] border-white/5 text-neutral-500 hover:text-white hover:border-white/10"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Personalization */}
      {viewMode === "feed" && (
        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
          <p className="mb-3 font-mono text-xs text-neutral-500">Personalize your feed</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter((cat) => cat.id !== "technology").map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleInterest(cat.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  selectedInterests.includes(cat.id)
                    ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
                    : "text-neutral-500 border-white/10 bg-white/[0.02] hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      <AnimatePresence>
        {error && (
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 text-center border rounded-2xl bg-rose-400/5 border-rose-400/20"
          >
            <p className="mb-2 text-sm text-rose-400">{error}</p>
            {!GNEWS_KEY && (
              <p className="font-mono text-xs text-neutral-600">
                Add VITE_GNEWS_API_KEY=your_key to your .env file. Get a free key at gnews.io
              </p>
            )}
          </Motion.div>
        )}
      </AnimatePresence>

      {/* Articles Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <NewsCardSkeleton key={i} />
          ))}
        </div>
      ) : displayedArticles.length === 0 && !error ? (
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center min-h-[300px] rounded-2xl bg-white/[0.02] border border-white/5 text-center p-8"
        >
          <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-white/5">
            <Newspaper className="w-8 h-8 text-neutral-600" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-white font-display">
            {viewMode === "saved" ? "No saved articles yet" : "No articles found"}
          </h3>
          <p className="text-sm text-neutral-500">
            {viewMode === "saved"
              ? "Save any article to read it later from this tab."
              : "Try a different category or search term."}
          </p>
        </Motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {displayedArticles.map((article, i) => (
              <NewsCard
                key={`${article.url}-${i}`}
                article={article}
                index={i}
                isSaved={Boolean(savedArticles[article.url])}
                onToggleSave={toggleBookmark}
              />
            ))}
            {loadingMore &&
              Array.from({ length: 3 }).map((_, i) => <NewsCardSkeleton key={`skel-${i}`} />)
            }
          </div>

          {/* Load More */}
          {viewMode === "feed" && hasMore && !loadingMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                className="px-6 py-3 text-sm font-medium text-neutral-400 rounded-xl border border-white/10 bg-white/[0.03] hover:text-white hover:border-white/20 transition-all duration-200"
              >
                Load more articles
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
