// 파일명: src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 제공해주신 인증 정보
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAVeygtj4HdWQYGY30goWQhJYKpQd61v5w",
  authDomain: "infosys-pos-a1af9.firebaseapp.com",
  projectId: "infosys-pos-a1af9",
  storageBucket: "infosys-pos-a1af9.firebasestorage.app",
  messagingSenderId: "741960346104",
  appId: "1:741960346104:web:dc89e807d4858d61874e0d",
  measurementId: "G-CHBNBW2WZB"
};

// Firebase 초기화 및 Firestore DB 객체 내보내기
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
