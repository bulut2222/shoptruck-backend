import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

// 🔑 Auth bilgisi (Base64 encode)
const token = Buffer.from(
  `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`
).toString("base64");

const AUTH_HEADER = {
  Authorization: `Basic ${token}`,
  "User-Agent": "Trendyol Integrator",
  Accept: "application/json"
};

// ✅ Tarih formatını timestamp’e çeviren helper
function toTimestamp(dateStr) {
  return new Date(dateStr).getTime();
}

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Siparişler endpoint
// ✅ Siparişler endpoint (Sadeleştirilmiş response)
// ✅ Siparişler endpoint (Son 30 gün default)
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let { startDate, endDate, page = 0, size = 20 } = req.query;

    // Eğer tarih gelmezse → son 30 gün
    if (!startDate || !endDate) {
      const now = new Date();
      endDate = now.getTime(); // Bugün
      startDate = new Date(now.setDate(now.getDate() - 30)).getTime(); // 30 gün önce
    } else {
      if (isNaN(startDate)) startDate = toTimestamp(startDate);
      if (isNaN(endDate)) endDate = toTimestamp(endDate);
    }

    const response = await axios.get(
      `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`,
      {
        headers: AUTH_HEADER,
        params: { startDate, endDate, page, size }
      }
    );

    // Sadeleştirilmiş response
    const simplified = (response.data.content || []).map((order) => ({
      orderNumber: order.orderNumber,
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      productName: order.lines?.[0]?.productName || "",
      grossAmount: order.grossAmount,
      status: order.status,
      orderDate: order.orderDate,
    }));

    res.json(simplified);
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

    res.json(response.data.content || []);
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
