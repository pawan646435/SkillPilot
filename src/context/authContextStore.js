// src/context/authContextStore.js
import { createContext, useContext } from "react";

export const AuthContext = createContext({ user: null, authReady: false });

export function useAuth() {
  return useContext(AuthContext);
}
