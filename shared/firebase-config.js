// shared/firebase-config.js -- Sharma Garments ADMIN
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc,
  query, where, orderBy,
  onSnapshot, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBMOK1OZIFNcIIKNP4QNB2DCy_XYO5kh8Q",
  authDomain:        "sharma-garments.firebaseapp.com",
  projectId:         "sharma-garments",
  storageBucket:     "sharma-garments.firebasestorage.app",
  messagingSenderId: "46124208935",
  appId:             "1:46124208935:web:886af763a1a3b4c3824f02"
};

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
export const db   = getFirestore(app);
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence)
  .catch(function(e) { console.warn("Persistence:", e); });

export {
  collection, doc,
  getDoc, getDocs,
  setDoc, addDoc,
  updateDoc, deleteDoc,
  query, where, orderBy,
  onSnapshot, increment, serverTimestamp
};
export { signInWithEmailAndPassword, signOut };
export const SHOP_ID = "sharma-garments";









