import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

// Ortak header
const generateAuthHeaders = (apiKey, apiSecret, supplierId, agent) => ({
  Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
  SupplierId: supplierId,
  "User-Agent": agent,
  Accept: "application/json"
});

// ✅ Test endpoint
app.get("/", (req, res) => {
  res.send("✅ ShopTruck Backend Çalışıyor 🚀");
});

// ✅ Siparişler endpoint (orders)
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    let allOrders = [];
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - 15 * DAY;

    let page = 0;
    const size = 50;

    const headers = generateAuthHeaders(
      process.env.TRENDYOL_ORDER_API_KEY,
      process.env.TRENDYOL_ORDER_API_SECRET,
      process.env.TRENDYOL_ORDER_SELLER_ID,
      "ShopTruckOrders"
    );

    while (true) {
      const response = await axios.get(
        `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_ORDER_SELLER_ID}/orders`,
        {
          headers,
          params: { startDate, endDate: now, page, size }
        }
      );

      const content = response.data?.content || [];
      if (content.length === 0) break;

      const simplified = content.map(order => ({
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

    res.json(allOrders);
  } catch (error) {
    console.error("Orders API Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Orders fetch failed" });
  }
});

// ✅ İadeler endpoint (claims)
app.get("/api/trendyol/returns", async (req, res) => {
  try {
    let allReturns = [];
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - 15 * DAY;

    let page = 0;
    const size = 50;

    const headers = generateAuthHeaders(
      process.env.TRENDYOL_RETURN_API_KEY,
      process.env.TRENDYOL_RETURN_API_SECRET,
      process.env.TRENDYOL_RETURN_SELLER_ID,
      "ShopTruckReturns"
    );

    while (true) {
      const response = await axios.get(
        `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_RETURN_SELLER_ID}/claims`,
        {
          headers,
          params: { startDate, endDate: now, page, size }
        }
      );

      const content = response.data?.content || [];
      if (content.length === 0) break;

      const simplified = content.map(ret => ({
        claimId: ret.claimId,
        orderNumber: ret.orderNumber,
        customerName: ret.customerName,
        reason: ret.reason,
        status: ret.claimItemStatus,
        createdDate: ret.createdDate
      }));

      allReturns = allReturns.concat(simplified);

      if (content.length < size) break;
      page++;
    }

    res.json(allReturns);
  } catch (error) {
    console.error("Returns API Error:", error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Returns fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
