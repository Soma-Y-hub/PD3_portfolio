import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBwOVux9kyEbfNveX3PiYisLW0cskOWc6I",
  authDomain: "pd3v1-82e29.firebaseapp.com",
  databaseURL: "https://pd3v1-82e29-default-rtdb.firebaseio.com",
  projectId: "pd3v1-82e29"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
