// src/context/AuthContext.jsx
import { useEffect, useState } from "react";
import { AuthContext } from "./authContextStore";

// Loads firebase/auth lazily (matches the previous per-page pattern) so public pages
// that never touch auth state don't pull the Firebase bundle into the initial load.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let isMounted = true;

    const initAuthListener = async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([
          import("../lib/firebase"),
          import("firebase/auth"),
        ]);

        if (!isMounted) return;

        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser || null);
          setAuthReady(true);
        });
      } catch {
        if (isMounted) setAuthReady(true);
      }
    };

    initAuthListener();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, authReady }}>
      {children}
    </AuthContext.Provider>
  );
}
