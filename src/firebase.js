import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Konfigurasi proyek Firebase "Urgent Chat" milik Anda.
// apiKey di sini AMAN untuk terlihat publik — keamanan sesungguhnya
// diatur lewat Firestore Security Rules, bukan dari config ini.
const firebaseConfig = {
  apiKey: "AIzaSyBJbpZkv-fQdQ1iWHoGKby2Gc4CiFprsy0",
  authDomain: "chaturgent-121b7.firebaseapp.com",
  projectId: "chaturgent-121b7",
  storageBucket: "chaturgent-121b7.firebasestorage.app",
  messagingSenderId: "138483682625",
  appId: "1:138483682625:web:29d6df3c1872a358b3e5c0",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
