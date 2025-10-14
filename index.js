import express from "express";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";
import admin from "firebase-admin";
import nodemailer from "nodemailer";

dotenv.config();
const app = express();
const agent = new https.Agent({ rejectUnauthorized: false });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;
const TRENDYOL_BASE_URL = process.env.TRENDYOL_BASE_URL;

// ---------- FIREBASE ----------
try {
  const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: firebasePrivateKey,
      }),
    });
    console.log("✅ Firebase Admin başlatıldı");
  }
} catch (err) {
  console.error("🛑 Firebase Admin Hatası:", err.message);
}
const db = admin.apps.length ? admin.firestore() : null;

// ---------- MAİL ----------
const mailer = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: process.env.MAIL_SECURE === "true",
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

// ---------- AUTH HEADERS ----------
const makeAuth = (key, secret, userAgent) => ({
  Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"),
  "User-Agent": userAgent,
  Accept: "application/json",
});

const ORDER_HEADER = makeAuth(
  process.env.TRENDYOL_ORDER_API_KEY,
  process.env.TRENDYOL_ORDER_API_SECRET,
  "ShopTruckOrder"
);
const PRODUCT_HEADER = makeAuth(
  process.env.TRENDYOL_ORDER_API_KEY,
  process.env.TRENDYOL_ORDER_API_SECRET,
  "ShopTruckProduct"
);
const VENDOR_HEADER = makeAuth(
  process.env.TRENDYOL_VENDOR_API_KEY,
  process.env.TRENDYOL_VENDOR_API_SECRET,
  "ShopTruckVendor"
);
const WEBHOOK_HEADER = makeAuth(
  process.env.TRENDYOL_WEBHOOK_API_KEY,
  process.env.TRENDYOL_WEBHOOK_API_SECRET,
  "ShopTruckWebhook"
);

// ---------- ROUTES ----------
app.get("/", (req, res) => res.send("✅ ShopTruck Backend Canlı 🚀"));

// 🔸 Siparişler
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - 7 * DAY;
    const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`;
    const { data } = await axios.get(url, {
      headers: ORDER_HEADER,
      params: { startDate, endDate: now, page: 0, size: 50 },
    });
    res.json(data.content || []);
  } catch (err) {
    console.error("🛑 Orders Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Orders fetch failed" });
  }
});

// 🔸 Ürünler
app.get("/api/trendyol/products", async (req, res) => {
  try {
    const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/products`;
    const { data } = await axios.get(url, { headers: PRODUCT_HEADER, httpsAgent: agent });
    res.json(data.content || []);
  } catch (err) {
    console.error("🛑 Products Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Products fetch failed" });
  }
});

// 🔸 Vendor
app.get("/api/trendyol/vendor/addresses", async (req, res) => {
  try {
    const url = `${TRENDYOL_BASE_URL}/integration/sellers/${process.env.TRENDYOL_VENDOR_SELLER_ID}/addresses`;
    const { data } = await axios.get(url, { headers: VENDOR_HEADER });
    res.json(data);
  } catch (err) {
    console.error("🛑 Vendor Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Vendor fetch failed" });
  }
});

// ---------- SERVER ----------
app.listen(PORT, () => console.log(`🚀 ShopTruck backend aktif: http://localhost:${PORT}`));
