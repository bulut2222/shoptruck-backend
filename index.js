// index.js
import express from "express";
import axios from "axios";
import dotenv from "dotenv";

// Ortam değişkenlerini yükle
dotenv.config();
const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Port
const PORT = process.env.PORT || 8080;

// Trendyol Base URLs
const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";
const TRENDYOL_INT_BASE_URL = "https://api.trendyol.com";

// ---------- AUTH HEADERS ----------
const ORDER_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_ORDER_API_KEY}:${process.env.TRENDYOL_ORDER_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckApp",
  Accept: "application/json",
};

const VENDOR_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_VENDOR_API_KEY}:${process.env.TRENDYOL_VENDOR_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckVendor",
  Accept: "application/json",
};

const WEBHOOK_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_WEBHOOK_API_KEY}:${process.env.TRENDYOL_WEBHOOK_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckWebhook",
  Accept: "application/json",
};

// ---------- ROOT TEST ----------
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Aktif (Railway) 🚀");
});

// ---------- ORDERS ----------
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - 15 * DAY;

    const response = await axios.get(
      `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`,
      {
        headers: ORDER_AUTH_HEADER,
        params: { startDate, endDate: now, page: 0, size: 50 },
      }
    );

    const data = response.data?.content?.map((o) => ({
      orderNumber: o.orderNumber,
      customer: `${o.customerFirstName} ${o.customerLastName}`,
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

// ---------- VENDOR INFO ----------
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

// ---------- WEBHOOK ----------
app.post("/api/trendyol/webhook", (req, res) => {
  console.log("📩 Yeni Webhook Geldi (Railway):");
  console.log(JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// ---------- WEBHOOK STATUS ----------
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
