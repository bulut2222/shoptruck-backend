import express from "express";
import axios from "axios";
import https from "https";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
import dotenv from "dotenv";
import admin from "firebase-admin";
import nodemailer from "nodemailer";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;
const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

/* ===========================
   🔐 Firebase Admin
=========================== */
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

/* ===========================
   ✉️ Mail
=========================== */
const mailer = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 465),
  secure: String(process.env.MAIL_SECURE || "true") === "true",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/* ===========================
   🛒 Trendyol Genel Auth
=========================== */
const AUTH_HEADER = {
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`
    ).toString("base64"),
  "User-Agent": "ShopTruckUnified",
  Accept: "application/json",
};

/* ---------- Root ---------- */
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Aktif (Tek Anahtar Trendyol Entegrasyonu) 🚀");
});

/* ---------- Ürün Listesi ---------- */
app.get("/api/trendyol/products", async (req, res) => {
  try {
    const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/products`;
    console.log("🟢 Trendyol ürün isteği:", url);

    const r = await axios.get(url, {
      headers: AUTH_HEADER,
      params: { page: 0, size: 100 },
      httpsAgent,
    });

    const products =
      r.data?.content?.map((p) => ({
        id: p.id,
        name: p.productName,
        stock: p.quantity,
        barcode: p.barcode,
        category: p.category?.name,
        brand: p.brand?.name,
        price: p.listPrice?.price,
        discountedPrice: p.salePrice?.price,
        image: p.images?.[0]?.url || "",
        approved: p.approved,
      })) || [];

    res.json({
      message: "✅ Trendyol ürün listesi alındı",
      count: products.length,
      data: products,
    });
  } catch (err) {
    console.error("🛑 Trendyol ürün hatası:", err.response?.data || err.message);
    res.status(500).json({
      error: "Ürün listesi alınamadı",
      details: err.response?.data || err.message,
    });
  }
});

/* ---------- Sipariş Listesi ---------- */
/* ---------- Sipariş Listesi (Son 15 Gün) ---------- */
/* ---------- Sipariş Listesi (Son 100 Gün - Yeni Siparişler Üstte) ---------- */
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    const now = Date.now();
    const hundredDaysAgo = now - 15 * 24 * 60 * 60 * 1000;

    const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`;
    console.log("🟢 Trendyol sipariş isteği (15 gün - TÜM DURUMLAR):", url);
    console.log(`📅 Aralık: ${hundredDaysAgo} → ${now}`);

    const r = await axios.get(url, {
      headers: AUTH_HEADER,
      params: {
        startDate: hundredDaysAgo,
        endDate: now,
        orderByField: "CreatedDate",
        orderByDirection: "DESC",
        page: 0,
        size: 200,
        // ⚠️ status parametresi gönderilmiyor (tüm durumlar gelsin)
      },
      httpsAgent,
    });

    let orders =
      r.data?.content
        ?.map((o) => ({
          id: o.id,
          customer: `${o.customerFirstName || ""} ${o.customerLastName || ""}`.trim(),
          totalPrice: o.totalPrice,
          orderDate: o.orderDate,
          status: o.status,
          cargoTrackingNumber: o.cargoTrackingNumber,
          city: o.shipmentAddress?.city,
        }))
        .sort((a, b) => b.orderDate - a.orderDate) || [];

    res.json({
      message: "✅ Trendyol son 15 gün TÜM sipariş listesi (yeniden eskiye) alındı",
      count: orders.length,
      data: orders,
    });
  } catch (err) {
    console.error("🛑 Trendyol sipariş hatası:", err.message);
    res.status(500).json({ error: "Trendyol siparişleri alınamadı", details: err.message });
  }
});





/* ---------- Sunucu ---------- */
app.listen(PORT, () => {
  console.log(`🚀 Backend aktif: http://localhost:${PORT}`);
});
