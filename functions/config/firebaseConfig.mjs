import admin from "firebase-admin";

// 🔥 Evitar inicialización múltiple de Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "live-copernico", // Cambia por tu bucket de Firebase Storage
  });
}

const bucket = admin.storage().bucket();
const firestore = admin.firestore();

export { admin, bucket, firestore };