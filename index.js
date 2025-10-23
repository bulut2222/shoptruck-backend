/* ---------- 📦 Sipariş Listesi (Son 15 Gün / Tüm Siparişler) ---------- */
app.get("/api/trendyol/orders", async (req, res) => {
  try {
    const now = Date.now();
    const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;

    const allOrders = [];
    let page = 0;
    let hasNext = true;

    while (hasNext) {
      const url = `${TRENDYOL_BASE_URL}/suppliers/${process.env.TRENDYOL_SELLER_ID}/orders`;

      const response = await axios.get(url, {
        headers: AUTH_HEADER,
        params: {
          startDate: fifteenDaysAgo,
          endDate: now,
          orderByField: "CreatedDate",
          orderByDirection: "DESC",
          page,
          size: 200,
          // status: "Created", // ❌ Bu satırı kaldırdık, tüm statüler gelecek
        },
        httpsAgent,
      });

      const pageData = response.data?.content || [];

      for (const o of pageData) {
        allOrders.push({
          orderNumber: o.id,
          customerFirstName: o.customerFirstName || "",
          customerLastName: o.customerLastName || "",
          productName:
            o.lines && o.lines.length > 0 ? o.lines[0].productName : "—",
          grossAmount: o.totalPrice || 0,
          status: o.status || "Unknown",
          orderDate: o.orderDate || Date.now(),
        });
      }

      hasNext = !response.data?.last;
      page++;
    }

    res.json(allOrders);
  } catch (err) {
    console.error("🛑 Trendyol sipariş hatası:", err.response?.data || err.message);
    res.status(500).json({
      error: "Sipariş listesi alınamadı",
      details: err.response?.data || err.message,
    });
  }
});
