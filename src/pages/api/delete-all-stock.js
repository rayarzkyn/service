// pages/api/delete-all-stock.js
import { getFirestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("stokBarang").get();
    const batch = db.batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    res.status(200).json({ message: "Semua stok dihapus" });
  } catch (err) {
    console.error("Gagal hapus stok:", err);
    res.status(500).json({ error: err.message });
  }
}
