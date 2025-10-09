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
  const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: firebasePrivateKey,
      }),
    });
    console.log("✅ Firebase Admin başarıyla başlatıldı");
  }
} catch (error) {
  console.error("🛑 Firebase Admin başlatılamadı:", error.message);
}

// ---------- Firestore ----------
const db = admin.apps.length ? admin.firestore() : null;

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
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const startDate = now - 15 * DAY;

  const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`;

  try {
    const primary = await axios.get(url, {
      headers: ORDER_AUTH_HEADER,
      params: { orderNumber, page: 0, size: 20, orderByCreatedDate: true },
    });
    const content = primary.data?.content || [];
    if (content.length > 0) return content[0];
  } catch {}

  const fallback = await axios.get(url, {
    headers: ORDER_AUTH_HEADER,
    params: { startDate, endDate: now, page: 0, size: 200, orderByCreatedDate: true },
  });
  const content = fallback.data?.content || [];
  return content.find((o) => String(o.orderNumber) === String(orderNumber)) || null;
}

// ---------- Root ----------
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Aktif (Firebase + Webhook) 🚀");
});

// ---------- Orders ----------
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
      timestamp: payload?.timestamp || payload?.data?.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      customerFirstName: payload?.data?.customerFirstName || orderDetail?.customerFirstName || "",
      customerLastName: payload?.data?.customerLastName || orderDetail?.customerLastName || "",
      customer:
        payload?.data?.customerFirstName && payload?.data?.customerLastName
          ? `${payload.data.customerFirstName} ${payload.data.customerLastName}`
          : [orderDetail?.customerFirstName, orderDetail?.customerLastName].filter(Boolean).join(" "),
      productName: payload?.data?.productName || orderDetail?.lines?.[0]?.productName || "",
      grossAmount: payload?.data?.grossAmount || orderDetail?.grossAmount || 0,
      raw: payload,
    };

    if (db) await db.collection("WebhookLogs").add(doc);

    const title = "📦 Yeni Trendyol Siparişi";
    const body = `#${orderNumber || "N/A"}\n👤 ${doc.customer || "Bilinmiyor"}\n🛍️ ${doc.productName || "-"}\n💰 ${doc.grossAmount || 0}₺\nDurum: ${doc.status || "-"}`;

    if (admin.apps.length)
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

    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM || process.env.MAIL_USER,
        to: "bulutkeles16@gmail.com",
        subject: `Yeni Sipariş: #${orderNumber || "N/A"}`,
        html: `
          <h3>Yeni Sipariş Alındı</h3>
          <p><b>Sipariş No:</b> ${orderNumber || "-"}</p>
          <p><b>Durum:</b> ${doc.status || "-"}</p>
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
