import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

// 🔑 Auth bilgisi
const AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckApp",
  Accept: "application/json"
};

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Siparişler endpoint → TÜM geçmişi çek (90 gün parçalar halinde)
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    // Eğer frontend’den tarih gelmezse → 2019'dan bugüne kadar tarasın
    let startDate = new Date("2019-01-01").getTime();
    let endDate = Date.now();

    let allOrders = [];

    const DAY = 24 * 60 * 60 * 1000;
    const RANGE = 90 * DAY; // 90 gün aralık

    while (startDate < endDate) {
      let rangeEnd = Math.min(startDate + RANGE, endDate);
      let page = 0;
      const size = 50;

      while (true) {
        console.log(`📦 Tarih ${new Date(startDate).toISOString()} - ${new Date(rangeEnd).toISOString()} | Sayfa ${page}`);

        const response = await axios.get(
          `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`,
          {
            headers: AUTH_HEADER,
            params: {
              startDate,
              endDate: rangeEnd,
              page,
              size,
              orderByCreatedDate: true
            }
          }
        );

        const content = response.data?.content || [];
        console.log(`➡️ ${content.length} sipariş bulundu`);

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

      // sıradaki tarih aralığına geç
      startDate = rangeEnd + 1;
    }

    console.log(`✅ Toplam sipariş: ${allOrders.length}`);
    res.json(allOrders);
  } catch (error) {
    console.error("Orders API Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Orders fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
