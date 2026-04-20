import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

export { firebaseConfig };
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

let storageInstance = null;
try {
  storageInstance = getStorage(app);
} catch (error) {
  console.warn("Firebase Storage is not available yet:", error);
}
export const storage = storageInstance;