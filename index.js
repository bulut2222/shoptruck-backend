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

// ✅ Siparişler endpoint → TÜM GEÇMİŞ siparişleri çek
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let allOrders = [];
    const DAY = 24 * 60 * 60 * 1000;
    const BLOCK = 30 * DAY;
    const firstOrderDate = new Date("2022-01-01").getTime(); 
    const now = Date.now();

    let startDate = firstOrderDate;

    while (startDate <= now) {
      let endDate = Math.min(startDate + BLOCK, now);
      let page = 0;
      const size = 50;

      while (true) {
        console.log(`📦 Tarih: ${new Date(startDate).toISOString()} - ${new Date(endDate).toISOString()} | Sayfa ${page}`);

        const response = await axios.get(
          `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`,
          {
            headers: AUTH_HEADER,
            params: { 
              startDate, 
              endDate, 
              page, 
              size, 
              orderByCreatedDate: true 
            }
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
          orderDate: order.orderDate
        }));

        allOrders = allOrders.concat(simplified);

        if (content.length < size) break;
        page++;
      }

      // 🔑 sonraki bloğa geçerken overlap bırak → hiçbir gün kaybolmaz
      startDate = endDate - DAY;
    }

    // 🔑 Duplicate temizle
    const uniqueOrders = Object.values(
      allOrders.reduce((acc, order) => {
        acc[order.orderNumber] = order;
        return acc;
      }, {})
    );

    // 🔑 Tarihe göre sırala (en yeni en üstte)
    uniqueOrders.sort((a, b) => b.orderDate - a.orderDate);

    console.log(`✅ Toplam sipariş: ${uniqueOrders.length}`);
    res.json(uniqueOrders);
  } catch (error) {
    console.error("Orders API Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Orders fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
