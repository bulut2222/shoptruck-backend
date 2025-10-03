import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

const AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckApp",
  Accept: "application/json"
};

// ✅ Root
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Siparişler endpoint (Son 30 gün, tüm sayfaları getir)
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let allOrders = [];
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - (30 * DAY); // ✅ sadece son 30 gün
    const size = 50;

    let page = 0;
    while (true) {
      console.log(`📦 Sayfa: ${page} (${new Date(startDate).toISOString()} - ${new Date(now).toISOString()})`);

      const response = await axios.get(
        `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`,
        {
          headers: AUTH_HEADER,
          params: { startDate, endDate: now, page, size, orderByCreatedDate: true }
        }
      );

      const content = response.data?.content || [];
      if (content.length === 0) break; // ✅ başka sipariş yoksa çık

      const simplified = content.map((order) => ({
        orderNumber: order.orderNumber,
        customerFirstName: order.customerFirstName,
        customerLastName: order.customerLastName,
        productName: order.lines?.[0]?.productName || "",
        grossAmount: order.grossAmount,
        status: order.status,
        orderDate: order.orderDate
      }));

      allOrders = allOrders.concat(simplified);

      if (content.length < size) break; // ✅ son sayfa
      page++;
    }

    // 🔑 Duplicate temizle + tarihe göre sırala
    const uniqueOrders = Object.values(
      allOrders.reduce((acc, order) => {
        acc[order.orderNumber] = order;
        return acc;
      }, {})
    ).sort((a, b) => b.orderDate - a.orderDate);

    console.log(`✅ Toplam sipariş çekildi: ${uniqueOrders.length}`);
    res.json(uniqueOrders);
  } catch (error) {
    console.error("Orders API Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: "Orders fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
