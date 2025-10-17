// webhook-create.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const WEBHOOK_CREATE_URL = `https://api.trendyol.com/integration/webhook/sellers/${process.env.TRENDYOL_SELLER_ID}/webhooks`;

const payload = {
  url: "https://shoptruck-backend-production.up.railway.app/api/webhook",
  username: process.env.TRENDYOL_API_KEY,
  password: process.env.TRENDYOL_API_SECRET,
  authenticationType: "BASIC_AUTHENTICATION",
  apiKey: process.env.TRENDYOL_API_KEY,
  subscribedStatuses: ["CREATED", "SHIPPED", "DELIVERED"]
};

axios.post(WEBHOOK_CREATE_URL, payload, {
  headers: {
    "Content-Type": "application/json",
    Authorization:
      "Basic " +
      Buffer.from(
        `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`
      ).toString("base64"),
  },
})
.then((res) => {
  console.log("✅ Webhook oluşturuldu:", res.data);
})
.catch((err) => {
  console.error("🛑 Webhook oluşturulamadı:", err.response?.data || err.message);
});
