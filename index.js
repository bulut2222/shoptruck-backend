// index.js
import express from "express";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";
import admin from "firebase-admin";
import nodemailer from "nodemailer";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;
const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

/* ============ 🔐 Firebase Admin ============ */
try {
  const key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
    console.log("✅ Firebase Admin başlatıldı");
  }
} catch (e) {
  console.error("🛑 Firebase Admin hata:", e.message);
}

const db = admin.apps.length ? admin.firestore() : null;

/* ============ ✉️ Mail (SMTP) ============ */
const mailer = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 465),
  secure: String(process.env.MAIL_SECURE || "true") === "true",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/* ============ 🛒 Trendyol Auth ============ */
const AUTH_HEADER = {
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`
    ).toString("base64"),
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json",
  Referer: "https://partner.trendyol.com",
  Origin: "https://partner.trendyol.com",
  Connection: "keep-alive",
};

/* ---------- Root ---------- */
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Aktif (Sipariş + Satıcı Bilgisi) 🚀");
});

/* ---------- 📦 Sipariş Listesi (Son 15 Gün) ---------- */
/* ---------- 📦 Sipariş Listesi (15 Günlük, Tüm Sayfalar Güvenli) ---------- */
app.get("/api/trendyol/orders", async (req, res) => {
  try {
   const now = Date.now() + 3 * 60 * 60 * 1000; // 3 saat ileri
    const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;

    const allOrders = [];
    let page = 0;
    const maxPageLimit = 20; // En fazla 20 sayfa (20x200 = 4000 sipariş)

    while (page < maxPageLimit) {
      const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`;

      const response = await axios.get(url, {
        headers: AUTH_HEADER,
        params: {
          startDate: fifteenDaysAgo,
          endDate: now,
          orderByField: "CreatedDate",
          orderByDirection: "DESC",
          page,
          size: 200,
        },
        httpsAgent,
      });

      const pageData = response.data?.content || [];

      for (const o of pageData) {
        allOrders.push({
          orderNumber: o.id,
          customerFirstName: o.customerFirstName || "",
          customerLastName: o.customerLastName || "",
          productName:
            o.lines && o.lines.length > 0 ? o.lines[0].productName : "—",
          grossAmount: o.totalPrice || 0,
          status: o.status || "Unknown",
          orderDate: o.orderDate || Date.now(),
        });
      }

      const isLastPage = response.data?.last === true;
      if (isLastPage || pageData.length === 0) break;

      page++;
    }

    res.json(allOrders);
  } catch (err) {
    console.error("🛑 Trendyol sipariş hatası:", err.response?.data || err.message);
    res.status(500).json({
      error: "Sipariş listesi alınamadı",
      details: err.response?.data || err.message,
    });
  }
});


/* ---------- 🏪 Satıcı (Vendor) Adresleri ---------- */
app.get("/api/trendyol/vendor/addresses", async (req, res) => {
  try {
    const url = `https://api.trendyol.com/integration/sellers/${process.env.TRENDYOL_SELLER_ID}/addresses`;
    const r = await axios.get(url, { headers: AUTH_HEADER, httpsAgent });

    if (!r.data || typeof r.data !== "object") {
      return res.json([]);
    }

    res.json(r.data);
  } catch (err) {
    console.error("🛑 Vendor API hatası:", err.response?.data || err.message);
    res.status(500).json({
      error: "Satıcı adres bilgileri alınamadı",
      details: err.response?.data || err.message,
    });
  }
});

/* ---------- Sunucu ---------- */
app.listen(PORT, () => {
  console.log(`🚀 Backend aktif: http://localhost:${PORT}`);
});
