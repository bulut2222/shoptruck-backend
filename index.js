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
   ✉️  NODEMAILER
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
   🌸 ÇİÇEKSEPETİ ENTEGRASYONU
   (Yeni POST endpoint’leri)
=========================== */
const CICEKSEPETI_BASE_URL =
  (process.env.CICEKSEPETI_BASE_URL || "https://apis.ciceksepeti.com/api/v1").replace(/\/+$/, "");

const CICEKSEPETI_AUTH_HEADER = {
  "x-api-key": process.env.CICEKSEPETI_API_KEY,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "ShopTruckCicekSepeti",
};

// küçük yardımcı: rate limit mesajını sez ve 429 dön
function tryRateLimit(res, payload) {
  const txt =
    (typeof payload === "string" && payload) ||
    payload?.Message ||
    payload?.message ||
    payload?.error ||
    "";

  if (typeof txt === "string" && /limit|aşım|10\s*dakika/i.test(txt)) {
    // kalan süreyi (saniye) yakalamaya çalış
    const m = txt.match(/(\d+)\s*saniye/i);
    const retrySec = m ? Number(m[1]) : 600;
    return res.status(429).json({
      error: "Limit aşımı! Aynı endpoint'e 10 dakikada 1 kez istek atabilirsiniz.",
      retryAfterSeconds: retrySec,
      details: txt,
    });
  }
  return null;
}

// ✅ Ping: 1 ürün çekerek basit bağlantı testi
app.get("/api/ciceksepeti/ping", async (req, res) => {
  try {
    const url = `${CICEKSEPETI_BASE_URL}/products/v1/GetProducts`;
    const r = await axios.post(
      url,
      {
        SellerId: process.env.CICEKSEPETI_SELLER_ID,
        Page: 1,
        PageSize: 1,
      },
      { headers: CICEKSEPETI_AUTH_HEADER, httpsAgent }
    );

    if (tryRateLimit(res, r.data)) return;

    res.json({ message: "✅ ÇiçekSepeti API bağlantısı aktif", sample: r.data });
  } catch (err) {
    const payload = err.response?.data || err.message;
    if (tryRateLimit(res, payload)) return;
    res.status(500).json({ error: "Ping başarısız", details: payload });
  }
});

// ✅ Siparişleri getir (Yeni endpoint)
app.get("/api/ciceksepeti/orders", async (req, res) => {
  try {
    const url = `${CICEKSEPETI_BASE_URL}/orders/v1/GetOrders`;
    const r = await axios.post(
      url,
      {
        SellerId: process.env.CICEKSEPETI_SELLER_ID,
        Page: Number(req.query.page || 1),
        PageSize: Number(req.query.pageSize || 20),
      },
      { headers: CICEKSEPETI_AUTH_HEADER, httpsAgent }
    );

    if (tryRateLimit(res, r.data)) return;

    // beklenen tipik şema: { Data: { Items: [...] } }
    const items = r.data?.Data?.Items || r.data?.data || r.data?.items || [];
    const orders = items.map((o) => ({
      orderNumber: o.OrderNumber ?? o.orderNumber,
      customerName: o.CustomerName ?? o.customerName,
      totalAmount: o.TotalAmount ?? o.totalAmount,
      orderDate: o.OrderDate ?? o.orderDate,
      status: o.Status ?? o.status,
    }));

    res.json(orders);
  } catch (err) {
    const payload = err.response?.data || err.message;
    if (tryRateLimit(res, payload)) return;
    const status = err.response?.status || 500;
    if (status === 404) {
      return res.status(404).json({ error: "Orders endpoint bulunamadı (404)" });
    }
    res.status(500).json({ error: "ÇiçekSepeti siparişleri alınamadı", details: payload });
  }
});

// ✅ Ürünleri getir (Yeni endpoint)
app.get("/api/ciceksepeti/products", async (req, res) => {
  try {
    const url = `${CICEKSEPETI_BASE_URL}/products/v1/GetProducts`;
    const r = await axios.post(
      url,
      {
        SellerId: process.env.CICEKSEPETI_SELLER_ID,
        Page: Number(req.query.page || 1),
        PageSize: Number(req.query.pageSize || 50),
      },
      { headers: CICEKSEPETI_AUTH_HEADER, httpsAgent }
    );

    if (tryRateLimit(res, r.data)) return;

    const items = r.data?.Data?.Items || r.data?.data || r.data?.items || [];
    const products =
      items.map((p) => ({
        id: p.ProductId ?? p.productId ?? p.Id,
        name: p.ProductName ?? p.productName ?? p.Name,
        price: p.Price ?? p.price,
        stock: p.StockQuantity ?? p.stockQuantity,
        category: p.CategoryName ?? p.categoryName,
        barcode: p.Barcode ?? p.barcode,
      })) || [];

    res.json(products);
  } catch (err) {
    const payload = err.response?.data || err.message;
    if (tryRateLimit(res, payload)) return;
    const status = err.response?.status || 500;
    if (status === 404) {
      return res.status(404).json({ error: "Products endpoint bulunamadı (404)" });
    }
    res.status(500).json({ error: "ÇiçekSepeti ürünleri alınamadı", details: payload });
  }
});

/* ===========================
   🛒 TRENDYOL (mevcut hali)
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

// (eski yardımcı fonksiyonun bırakıyorum — gerekirse düzenlersin)
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
  res.send("✅ ShopTruck Backend Aktif (Firebase + Webhook) 🚀");
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
      console.warn("⚠️ Trendyol Vendor API HTML döndürdü (Cloudflare).");
      return res.json({
        addresses: [],
        message: "Trendyol Vendor API HTML döndürdü (Cloudflare engeli olabilir).",
      });
    }

    if (!r.data || Object.keys(r.data).length === 0) {
      console.warn("⚠️ Vendor addresses boş döndü.");
      return res.json({ addresses: [], message: "Boş sonuç döndü" });
    }

    if (typeof r.data === "string" && r.data.includes("<html")) {
      console.warn("⚠️ Trendyol HTML döndürdü (Cloudflare Engeli)");
      return res.json({ addresses: [], message: "Trendyol engeli (HTML döndü)" });
    }
    res.json(r.data);
  } catch (err) {
    console.error("🛑 Vendor API Error:", err.response?.data || err.message);
    res.status(200).json({
      addresses: [],
      message: "Trendyol Vendor API şu anda erişilemiyor (Cloudflare engeli olabilir).",
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

    const title = "📦 Yeni Trendyol Siparişi";
    const body = `#${orderNumber || "N/A"}\n👤 ${doc.customer || "Bilinmiyor"}\n🛍️ ${
      doc.productName || "-"
    }\n💰 ${doc.grossAmount || 0}₺\nDurum: ${doc.status || "-"}`;

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

    console.log("🟢 Trendyol ürün cevabı geldi:", response.status);

    if (typeof response.data !== "object" || !response.data.content) {
      console.warn("⚠️ Trendyol HTML veya beklenmedik içerik döndürdü.");
      return res.status(200).json({
        error: "Cloudflare veya Trendyol HTML döndürdü",
        raw: typeof response.data === "string" ? response.data.slice(0, 200) : response.data,
      });
    }

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
