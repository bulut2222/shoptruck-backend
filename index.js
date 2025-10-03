import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

// 🔑 Auth bilgisi (Base64 encode)
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

// ✅ Siparişler endpoint → TÜM GEÇMİŞ siparişler
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let { startDate, endDate } = req.query;

    // Eğer frontend’den tarih gelmezse → 2010 yılından bugüne kadar
    if (!startDate || !endDate) {
      startDate = new Date("2010-01-01").getTime(); // çok eski bir tarih
      endDate = Date.now(); // şu an
    }

    startDate = Number(startDate);
    endDate = Number(endDate);

    let allOrders = [];
    let page = 0;
    const size = 50;

    while (true) {
      console.log(`📦 Fetching page ${page}...`);

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
      console.log(`➡️ Sayfa ${page} sipariş: ${content.length}`);

      if (content.length === 0) break; // içerik yoksa çık

      // sadeleştirme
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

      if (content.length < size) break; // son sayfa
      page++;
    }

    console.log(`✅ Toplam sipariş: ${allOrders.length}`);
    res.json(allOrders);
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
