import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC05HSkbvTIgL3oEv4H_-wbvzoPmfoS-Dc",
  authDomain: "field-general-cd4fa.firebaseapp.com",
  projectId: "field-general-cd4fa",
  storageBucket: "field-general-cd4fa.firebasestorage.app",
  messagingSenderId: "1028414472180",
  appId: "1:1028414472180:web:a1ebfcd7fd30b7305603a1",
  measurementId: "G-7GJ53SM7NC",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
