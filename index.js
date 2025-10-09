import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import admin from "firebase-admin";
import nodemailer from "nodemailer";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;
const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";
const TRENDYOL_INT_BASE_URL = "https://api.trendyol.com";

// ---------- FIREBASE ADMIN ----------
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin başarıyla başlatıldı (Railway env)");
  }
} catch (error) {
  console.error("🛑 Firebase Admin başlatılamadı:", error.message);
}

// Firestore ref
const db = admin.firestore();

// ---------- Nodemailer (Gmail SMTP) ----------
const mailer = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 465),
  secure: String(process.env.MAIL_SECURE || "true") === "true",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ---------- AUTH HEADERS ----------
const ORDER_AUTH_HEADER = {
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.TRENDYOL_ORDER_API_KEY}:${process.env.TRENDYOL_ORDER_API_SECRET}`
    ).toString("base64"),
  "User-Agent": "ShopTruckApp",
  Accept: "application/json",
};

const VENDOR_AUTH_HEADER = {
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.TRENDYOL_VENDOR_API_KEY}:${process.env.TRENDYOL_VENDOR_API_SECRET}`
    ).toString("base64"),
  "User-Agent": "ShopTruckVendor",
  Accept: "application/json",
};

const WEBHOOK_AUTH_HEADER = {
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.TRENDYOL_WEBHOOK_API_KEY}:${process.env.TRENDYOL_WEBHOOK_API_SECRET}`
    ).toString("base64"),
  "User-Agent": "ShopTruckWebhook",
  Accept: "application/json",
};

// ---------- Helper: Order detayını Trendyol’dan çek ----------
async function fetchOrderDetailsByNumber(orderNumber) {
  // Trendyol Orders endpoint orderNumber filtresi destekliyor.
  // Bazı hesaplarda orderNumber tek başına yetmezse tarihle de daraltırız (fallback).
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const startDate = now - 15 * DAY;

  const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`;
  const paramsPrimary = {
    orderNumber,
    page: 0,
    size: 50,
    orderByCreatedDate: true,
  };

  // 1) Direkt orderNumber ile dene
  let r = await axios.get(url, { headers: ORDER_AUTH_HEADER, params: paramsPrimary });
  let content = r.data?.content || [];
  if (content.length > 0) return content[0];

  // 2) Fallback: son 15 güne bak, eşleşen orderNumber’ı bul
  const paramsFallback = {
    startDate,
    endDate: now,
    page: 0,
    size: 200,
    orderByCreatedDate: true,
  };
  r = await axios.get(url, { headers: ORDER_AUTH_HEADER, params: paramsFallback });
  content = r.data?.content || [];
  const found = content.find(o => String(o.orderNumber) === String(orderNumber));
  return found || null;
}

// ---------- Root ----------
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Aktif (Railway + Firebase) 🚀");
});

// ---------- Orders (listeleme örneği) ----------
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - 15 * DAY;

    const response = await axios.get(
      `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`,
      {
        headers: ORDER_AUTH_HEADER,
        params: { startDate, endDate: now, page: 0, size: 50, orderByCreatedDate: true },
      }
    );

    const data =
      response.data?.content?.map((o) => ({
        orderNumber: o.orderNumber,
        customer: `${o.customerFirstName} ${o.customerLastName}`.trim(),
        productName: o.lines?.[0]?.productName || "",
        amount: o.grossAmount,
        status: o.status,
        orderDate: o.orderDate,
      })) || [];

    res.json(data);
  } catch (err) {
    console.error("🛑 Orders API Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Orders fetch failed" });
  }
});

// ---------- Vendor Info ----------
app.get("/api/trendyol/vendor/addresses", async (req, res) => {
  try {
    const url = `${TRENDYOL_INT_BASE_URL}/integration/sellers/${process.env.TRENDYOL_VENDOR_SELLER_ID}/addresses`;
    const r = await axios.get(url, { headers: VENDOR_AUTH_HEADER });
    res.json(r.data);
  } catch (err) {
    console.error("🛑 Vendor API Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Vendor info fetch failed" });
  }
});

// ---------- Webhook ----------
app.post("/api/trendyol/webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    console.log("📩 Yeni Webhook Geldi:", JSON.stringify(payload, null, 2));

    // 1) Order number’ı al
    const orderNumber =
      payload?.orderNumber ||
      payload?.data?.orderNumber ||
      payload?.data?.order?.orderNumber;

    // 2) Trendyol’dan detayları çek (mümkünse)
    let orderDetail = null;
    if (orderNumber) {
      try {
        orderDetail = await fetchOrderDetailsByNumber(orderNumber);
      } catch (e) {
        console.warn("⚠️ Order detail çekilemedi:", e.message);
      }
    }

    // 3) Firestore’a kaydet
    const doc = {
      event: payload?.event || "UNKNOWN",
      orderNumber: String(orderNumber || ""),
      status: payload?.status || payload?.data?.status || orderDetail?.status || "",
      timestamp: payload?.timestamp || payload?.data?.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),

      // Zenginleştirilmiş alanlar (varsa):
      customerFirstName: orderDetail?.customerFirstName || "",
      customerLastName: orderDetail?.customerLastName || "",
      customer: [orderDetail?.customerFirstName, orderDetail?.customerLastName].filter(Boolean).join(" "),
      shippingAddress:
        orderDetail?.shipmentAddress
          ? `${orderDetail.shipmentAddress?.fullName || ""} ${orderDetail.shipmentAddress?.address1 || ""} ${orderDetail.shipmentAddress?.city || ""}`.trim()
          : "",
      productName: orderDetail?.lines?.[0]?.productName || "",
      grossAmount: orderDetail?.grossAmount || null,
      raw: payload,
    };

    await db.collection("WebhookLogs").add(doc);

    // 4) Push Bildirim (topic: trendyol)
    const title = "Yeni Trendyol Siparişi";
    const body = `#${orderNumber || "N/A"} - ${doc.status || ""}`;
    await admin.messaging().send({
      topic: "trendyol",
      notification: { title, body },
      data: {
        orderNumber: String(orderNumber || ""),
        status: String(doc.status || ""),
      },
    });

    // 5) E-posta gönder
    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM || process.env.MAIL_USER,
        to: "bulutkeles16@gmail.com",
        subject: `Yeni Sipariş: #${orderNumber || "N/A"}`,
        html: `
          <h3>Yeni Sipariş Alındı</h3>
          <p><b>Sipariş No:</b> ${orderNumber || "-"}</p>
          <p><b>Durum:</b> ${doc.status || "-"}</p>
          <p><b>Tarih:</b> ${new Date(doc.timestamp).toLocaleString("tr-TR")}</p>
          <hr/>
          <p><b>Müşteri:</b> ${doc.customer || "-"}</p>
          <p><b>Ürün:</b> ${doc.productName || "-"}</p>
          <p><b>Tutar:</b> ${doc.grossAmount ?? "-"}</p>
        `,
      });
    } catch (e) {
      console.warn("⚠️ E-posta gönderilemedi:", e.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("🛑 Webhook Error:", err.stack || err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ---------- Webhook Status ----------
app.get("/api/trendyol/webhook/status", async (req, res) => {
  try {
    const r = await axios.get(
      `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_WEBHOOK_SELLER_ID}/webhooks`,
      { headers: WEBHOOK_AUTH_HEADER }
    );
    res.json(r.data);
  } catch (err) {
    console.error("🛑 Webhook Status Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Webhook status fetch failed" });
  }
});

// ---------- SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Backend aktif: http://localhost:${PORT}`);
});
