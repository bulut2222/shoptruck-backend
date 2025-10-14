// webhook-tester.js
import axios from "axios";

const webhookUrl = "https://shoptruck-trendyol-production.up.railway.app/api/trendyol/webhook";

const fakeOrder = {
  id: 123456789,
  customerFirstName: "Ahmet",
  customerLastName: "Yılmaz",
  totalPrice: 299.99,
  orderDate: new Date().toISOString(),
  status: "Created",
  cargoTrackingNumber: "ABC123456789",
  shipmentAddress: {
    city: "İstanbul",
  },
  items: [
    {
      productName: "Test Ürünü",
      quantity: 2,
      price: 149.99,
    },
  ],
};

async function sendWebhook() {
  try {
    const res = await axios.post(webhookUrl, fakeOrder, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("✅ Webhook gönderildi:", res.data);
  } catch (err) {
    console.error("🛑 Webhook gönderimi başarısız:", err.response?.data || err.message);
  }
}

sendWebhook(); // bunu yaptım bu geldi