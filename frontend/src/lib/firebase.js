// src/lib/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // <-- NEW IMPORT

const firebaseConfig = {
  apiKey: "AIzaSyAvZqiODwLo-mRPBVK7CLN2Q028hECQS7A",
  authDomain: "myproject-a48d7.firebaseapp.com",
  projectId: "myproject-a48d7",
  storageBucket: "myproject-a48d7.firebasestorage.app",
  messagingSenderId: "782768669643",
  appId: "1:782768669643:web:e3ebf7f6cce592d5132c4e",
  measurementId: "G-QMF1MCMR0C"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // <-- INITIALIZE STORAGE

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

export { app, auth, db, storage, googleProvider, githubProvider };