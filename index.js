import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// ---- Temel URL'ler ----
const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";
const TRENDYOL_INT_BASE_URL = "https://api.trendyol.com";

// ---- Sipariş Auth ----
const ORDER_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_ORDER_API_KEY}:${process.env.TRENDYOL_ORDER_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckApp",
  Accept: "application/json",
};

// ---- Satıcı Bilgileri Auth ----
const VENDOR_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_VENDOR_API_KEY}:${process.env.TRENDYOL_VENDOR_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckVendorInformation",
  Accept: "application/json",
};

// ---- İade Auth ----
const RETURN_AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.TRENDYOL_RETURN_API_KEY}:${process.env.TRENDYOL_RETURN_API_SECRET}`
  ).toString("base64")}`,
  "User-Agent": "ShopTruckReturnIntegration",
  Accept: "application/json",
};

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Orders endpoint (Son 15 Gün)
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
    res.status(error.response?.status || 500).json({
      error: "Orders fetch failed",
    });
  }
});

// ✅ Vendor Info endpoint (Satıcı Bilgileri)
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

// ✅ Returns endpoint (İade İşlemleri - GÜNCELLENDİ)
app.get("/api/trendyol/returns", async (req, res) => {
  try {
    // ⚙️ Yeni doğru endpoint (Artık /return/v2 yok!)
    const trendyolUrl = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_RETURN_SELLER_ID}/returns?page=0&size=10`;

    // ScraperAPI ile Trendyol'a proxy üzerinden bağlan
    const scraperUrl = `https://api.scraperapi.com?api_key=${process.env.SCRAPERAPI_KEY}&url=${encodeURIComponent(trendyolUrl)}`;

    const response = await axios.get(scraperUrl, {
      headers: RETURN_AUTH_HEADER,
      timeout: 30000,
    });

    // Trendyol bazen HTML döndürebiliyor, bu kontrol onu engeller
    if (typeof response.data === "string" && response.data.includes("<html")) {
      throw new Error("Trendyol API HTML döndürdü, muhtemelen endpoint yanlış veya kimlik doğrulama hatalı.");
    }

    res.json(response.data);
  } catch (error) {
    console.error("Return API Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Return info fetch failed" });
  }
});

// ✅ Sunucu Başlat
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
