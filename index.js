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

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Siparişler endpoint
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let { startDate, endDate, page = 0, size = 20 } = req.query;

    const now = Date.now();

    if (!startDate || !endDate) {
      endDate = now;
      startDate = now - (30 * 24 * 60 * 60 * 1000); // son 30 gün
    }

    // String geldiyse Number'a çevir
    startDate = Number(startDate);
    endDate = Number(endDate);

    const response = await axios.get(
      `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`,
      {
        headers: AUTH_HEADER,
        params: { startDate, endDate, page, size }
      }
    );

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

    // Gelen datayı sadeleştir, Product.java ile uyumlu hale getir
    const simplified = (response.data.content || []).map((p) => ({
      id: p.productId.toString(),
      name: p.productName,
      category: p.categoryName || "Genel",
      price: p.listPrice?.value || 0,
      stock: p.quantity || 0,
      createdAt: new Date().getTime() // Trendyol JSON’da yok → fake timestamp
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
