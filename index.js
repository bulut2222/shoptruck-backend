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

// 🧾 Fatura entegrasyonu
const INVOICE_AUTH_HEADER = {
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.TRENDYOL_INVOICE_API_KEY}:${process.env.TRENDYOL_INVOICE_API_SECRET}`
    ).toString("base64"),
  "User-Agent": "ShopTruckInvoice",
  Accept: "application/json",
};

// ---------- Helper: Order detayını Trendyol’dan çek ----------
async function fetchOrderDetailsByNumber(orderNumber) {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const startDate = now - 15 * DAY;

  const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`;
  const paramsPrimary = { orderNumber, page: 0, size: 50, orderByCreatedDate: true };

  let r = await axios.get(url, { headers: ORDER_AUTH_HEADER, params: paramsPrimary });
  let content = r.data?.content || [];
  if (content.length > 0) return content[0];

  const paramsFallback = {
    startDate,
    endDate: now,
    page: 0,
    size: 200,
    orderByCreatedDate: true,
  };
  r = await axios.get(url, { headers: ORDER_AUTH_HEADER, params: paramsFallback });
  content = r.data?.content || [];
  const found = content.find((o) => String(o.orderNumber) === String(orderNumber));
  return found || null;
}

// ---------- Root ----------
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Aktif (Railway + Firebase + Invoice) 🚀");
});

// ---------- Siparişler ----------
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

// ---------- Fatura Entegrasyonu ----------
app.get("/api/trendyol/invoices", async (req, res) => {
  try {
    const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_INVOICE_SELLER_ID}/invoices`;
    const r = await axios.get(url, { headers: INVOICE_AUTH_HEADER });
    res.json(r.data);
  } catch (err) {
    console.error("🛑 Invoice Fetch Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Invoice fetch failed" });
  }
});

app.post("/api/trendyol/invoices/create", async (req, res) => {
  try {
    const payload = req.body;
    const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_INVOICE_SELLER_ID}/invoices`;
    const response = await axios.post(url, payload, { headers: INVOICE_AUTH_HEADER });
    res.json({ success: true, result: response.data });
  } catch (err) {
    console.error("🛑 Invoice Create Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Invoice creation failed" });
  }
});

// ---------- Webhook ----------
app.post("/api/trendyol/webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    console.log("📩 Yeni Webhook Geldi:", JSON.stringify(payload, null, 2));

    const orderNumber =
      payload?.orderNumber ||
      payload?.data?.orderNumber ||
      payload?.data?.order?.orderNumber;

    let orderDetail = null;
    if (orderNumber) {
      try {
        orderDetail = await fetchOrderDetailsByNumber(orderNumber);
      } catch (e) {
        console.warn("⚠️ Order detail çekilemedi:", e.message);
      }
    }

    const doc = {
      event: payload?.event || "UNKNOWN",
      orderNumber: String(orderNumber || ""),
      status: payload?.status || payload?.data?.status || orderDetail?.status || "",
      timestamp: payload?.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      customer:
        (payload?.data?.customerFirstName && payload?.data?.customerLastName)
          ? `${payload.data.customerFirstName} ${payload.data.customerLastName}`
          : `${orderDetail?.customerFirstName || ""} ${orderDetail?.customerLastName || ""}`.trim(),
      productName:
        payload?.data?.productName || orderDetail?.lines?.[0]?.productName || "",
      grossAmount:
        payload?.data?.grossAmount || orderDetail?.grossAmount || 0,
      raw: payload,
    };

    await db.collection("WebhookLogs").add(doc);

    const title = "📦 Yeni Trendyol Siparişi";
    const body = `#${orderNumber}\n👤 ${doc.customer}\n🛍️ ${doc.productName}\n💰 ${doc.grossAmount}₺\nDurum: ${doc.status}`;

    await admin.messaging().send({
      topic: "trendyol",
      notification: { title, body },
      data: {
        orderNumber: String(orderNumber || ""),
        status: String(doc.status || ""),
        customer: String(doc.customer || "Bilinmiyor"),
        productName: String(doc.productName || ""),
        amount: String(doc.grossAmount || "0"),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("🛑 Webhook Error:", err.stack || err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ---------- SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Backend aktif: http://localhost:${PORT}`);
});
