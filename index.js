import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

// ✅ Siparişler için header
const ORDER_HEADERS = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_ORDER_API_KEY}:${process.env.TRENDYOL_ORDER_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckOrders",
  Accept: "application/json"
};

// ✅ Root
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Siparişler endpoint (son 15 gün)
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
          headers: ORDER_HEADERS,
          params: {
            startDate,
            endDate: now,
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

    console.log(`✅ Toplam sipariş (son 15 gün): ${allOrders.length}`);
    res.json(allOrders);
  } catch (error) {
    console.error("Orders API Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Orders fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
