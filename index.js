import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json()); // 🔥 Webhook POST için gerekli

const PORT = process.env.PORT || 8080;
const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";
const TRENDYOL_INT_BASE_URL = "https://api.trendyol.com";

// ---- Orders Auth ----
const ORDER_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_ORDER_API_KEY}:${process.env.TRENDYOL_ORDER_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckApp",
  Accept: "application/json",
};

// ---- Vendor Info Auth ----
const VENDOR_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_VENDOR_API_KEY}:${process.env.TRENDYOL_VENDOR_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckVendorInformation",
  Accept: "application/json",
};

// ---- Webhook Auth ----
const WEBHOOK_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_WEBHOOK_API_KEY}:${process.env.TRENDYOL_WEBHOOK_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckWebhook",
  Accept: "application/json",
};

app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Orders endpoint
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let allOrders = [];
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - 15 * DAY;

    let page = 0;
    const size = 50;

    while (true) {
      const response = await axios.get(
        `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`,
        {
          headers: ORDER_AUTH_HEADER,
          params: {
            startDate,
            endDate: now,
            page,
            size,
            orderByCreatedDate: true,
          },
        }
      );

      const content = response.data?.content || [];
      if (content.length === 0) break;

      const simplified = content.map((order) => ({
        orderNumber: order.orderNumber,
        customerFirstName: order.customerFirstName,
        customerLastName: order.customerLastName,
        productName: order.lines?.[0]?.productName || "",
        grossAmount: order.grossAmount,
        status: order.status,
        orderDate: order.orderDate,
      }));

      allOrders = allOrders.concat(simplified);
      if (content.length < size) break;
      page++;
    }

    res.json(allOrders);
  } catch (error) {
    console.error("Orders API Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Orders fetch failed" });
  }
});

// ✅ Vendor Info endpoint
app.get("/api/trendyol/vendor/addresses", async (req, res) => {
  try {
    const url = `${TRENDYOL_INT_BASE_URL}/integration/sellers/${process.env.TRENDYOL_VENDOR_SELLER_ID}/addresses`;
    const response = await axios.get(url, { headers: VENDOR_AUTH_HEADER });
    res.json(response.data);
  } catch (error) {
    console.error("Vendor API Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Vendor info fetch failed" });
  }
});

// ✅ Webhook Endpoint (test amaçlı)
app.post("/api/trendyol/webhook", (req, res) => {
  console.log("📩 Yeni Webhook Geldi:", JSON.stringify(req.body, null, 2));
  res.status(200).json({ success: true });
});

// ✅ Webhook Status Test (manuel kontrol)
app.get("/api/trendyol/webhook/status", async (req, res) => {
  try {
    const response = await axios.get(
      `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_WEBHOOK_SELLER_ID}/webhooks`,
      { headers: WEBHOOK_AUTH_HEADER }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Webhook Status Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Webhook status fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
