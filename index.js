import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

// 🔑 Auth
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

// ✅ Siparişler endpoint → Son 40 gün (7 günlük bloklarla)
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let allOrders = [];
    const DAY = 24 * 60 * 60 * 1000;
    const BLOCK = 7 * DAY; // her blok 1 hafta
    const now = Date.now();

    // ✅ sadece son 40 gün
    let startDate = now - 45 * DAY;

    while (startDate < now) {
      let endDate = Math.min(startDate + BLOCK, now);
      let page = 0;
      const size = 50;

      while (true) {
        console.log(
          `📦 Tarih aralığı: ${new Date(startDate).toISOString()} - ${new Date(
            endDate
          ).toISOString()} | Sayfa ${page}`
        );

        const response = await axios.get(
          `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`,
          {
            headers: AUTH_HEADER,
            params: {
              startDate,
              endDate,
              page,
              size,
              orderByCreatedDate: true,
              status: "ALL" // tüm sipariş statüleri
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
          orderDate: order.orderDate,
          createdDate: order.createdDate,
          shipmentCreatedDate: order.shipmentCreatedDate,
          packageCreatedDate: order.packageCreatedDate
        }));

        allOrders = allOrders.concat(simplified);

        if (content.length < size) break;
        page++;
      }

      startDate = endDate + 1;
    }

    // 🔑 Duplicate temizle + en güncel tarihe göre sırala
    const uniqueOrders = Object.values(
      allOrders.reduce((acc, order) => {
        acc[order.orderNumber] = order;
        return acc;
      }, {})
    ).sort((a, b) => {
      const dateA = Math.max(
        a.orderDate || 0,
        a.createdDate || 0,
        a.shipmentCreatedDate || 0,
        a.packageCreatedDate || 0
      );
      const dateB = Math.max(
        b.orderDate || 0,
        b.createdDate || 0,
        b.shipmentCreatedDate || 0,
        b.packageCreatedDate || 0
      );
      return dateB - dateA;
    });

    console.log(`✅ Toplam sipariş (son 40 gün): ${uniqueOrders.length}`);
    res.json(uniqueOrders);
  } catch (error) {
    console.error("Orders API Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Orders fetch failed" });
  }
});

// ✅ Ürünler endpoint
app.get("/api/trendyol/products", async (req, res) => {
  try {
    const { page = 0, size = 50, approved = true } = req.query;

    const response = await axios.get(
      `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/products`,
      {
        headers: AUTH_HEADER,
        params: { page, size, approved }
      }
    );

    const simplified = (response.data.content || []).map((p) => ({
      id: p.productId.toString(),
      name: p.productName,
      category: p.categoryName || "Genel",
      price: p.listPrice?.value || 0,
      stock: p.quantity || 0,
      createdAt: new Date().getTime()
    }));

    res.json(simplified);
  } catch (error) {
    console.error("Products API Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Products fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
