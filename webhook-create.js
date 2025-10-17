// webhook-create.js
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// 📌 Trendyol Webhook Oluşturma Endpoint'i
const WEBHOOK_CREATE_URL = `https://api.trendyol.com/integration/webhook/sellers/${process.env.TRENDYOL_SELLER_ID}/webhooks`;

// 📌 Webhook payload'u
const payload = {
  url: "https://shoptruck-trendyol-production.up.railway.app/api/trendyol/webhook", // ✅ Railway'de açık olan backend adresin
  authenticationType: "API_KEY", // Trendyol zorunlu alan
  apiKey: process.env.TRENDYOL_API_KEY, // .env'den alınır
  subscribedStatuses: ["CREATED", "SHIPPED", "DELIVERED"] // Trendyol sipariş durumları
};

// 📌 Webhook isteğini gönder
axios.post(WEBHOOK_CREATE_URL, payload, {
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Basic " + Buffer.from(`${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`).toString("base64")
  }
})
.then(res => {
  console.log("✅ Webhook oluşturuldu:", res.data);
})
.catch(err => {
  console.error("🛑 Webhook oluşturulamadı:", err.response?.data || err.message);
});
