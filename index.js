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
   🔐 FIREBASE ADMIN
=========================== */
try {
  const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
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

const db = admin.apps.length ? admin.firestore() : null;

/* ===========================
   ✉️ NODEMAILER
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
   🛒 TRENDYOL ENTEGRASYONU
=========================== */

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

const PRODUCT_AUTH_HEADER = {
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.TRENDYOL_PRODUCT_API_KEY}:${process.env.TRENDYOL_PRODUCT_API_SECRET}`
    ).toString("base64"),
  "User-Agent": "ShopTruckProduct",
  Accept: "application/json",
};

// 🔍 Sipariş detaylarını getir
async function fetchOrderDetailsByNumber(orderNumber) {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const startDate = now - 15 * DAY;

  const url = `${TRENDYOL_BASE_URL}/sellers/${process.env.TRENDYOL_PRODUCT_SELLER_ID}/products`;

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

/* ---------- Root ---------- */
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Aktif (Firebase + Trendyol) 🚀");
});

/* ---------- Orders ---------- */
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
        customerFirstName: o.customerFirstName,
        customerLastName: o.customerLastName,
        grossAmount: o.grossAmount,
        productName: o.lines?.[0]?.productName || "",
        status: o.status,
        orderDate: o.orderDate,
      })) || [];

    res.json(data);
  } catch (err) {
    console.error("🛑 Orders API Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Orders fetch failed" });
  }
});

/* ---------- Vendor Info ---------- */
app.get("/api/trendyol/vendor/addresses", async (req, res) => {
  try {
    const url = `https://api.trendyol.com/integration/sellers/${process.env.TRENDYOL_VENDOR_SELLER_ID}/addresses`;
    const r = await axios.get(url, { headers: VENDOR_AUTH_HEADER });

    if (typeof r.data !== "object" || r.data.includes?.("<html")) {
      return res.json({
        addresses: [],
        message: "Trendyol Vendor API HTML döndürdü (Cloudflare engeli olabilir).",
      });
    }

    res.json(r.data);
  } catch (err) {
    console.error("🛑 Vendor API Error:", err.response?.data || err.message);
    res.status(200).json({
      addresses: [],
      message: "Trendyol Vendor API şu anda erişilemiyor.",
      error: String(err.response?.data || err.message).substring(0, 500),
    });
  }
});

/* ---------- Webhook ---------- */
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

/* ---------- Webhook Status ---------- */
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

/* ---------- Products ---------- */
app.get("/api/trendyol/products", async (req, res) => {
  try {
    const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_PRODUCT_SELLER_ID}/products`;
    console.log("🟢 Trendyol ürün isteği gönderiliyor:", url);

    const response = await axios.get(url, {
      headers: PRODUCT_AUTH_HEADER,
      params: { page: 0, size: 100 },
      httpsAgent,
    });

    const products =
      response.data.content.map((p) => ({
        id: p.id,
        name: p.productName,
        barcode: p.barcode,
        stockCode: p.stockCode,
        brand: p.brand?.name || "-",
        category: p.category?.name || "-",
        quantity: p.quantity,
        salePrice: p.listPrice?.price || 0,
        discountedPrice: p.salePrice?.price || 0,
        approved: p.approved,
        image: p.images?.[0]?.url || "",
      })) || [];

    res.json(products);
  } catch (err) {
    console.error("🛑 Products API Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Products fetch failed",
      details: err.response?.data || err.message,
    });
  }
});

/* ---------- SERVER ---------- */
app.listen(PORT, () => {
  console.log(`🚀 Backend aktif: http://localhost:${PORT}`);
});
