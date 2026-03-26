const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://ybtfepdqzbgmtlsiisvp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlidGZlcGRxemJnbXRsc2lpc3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzk2OTksImV4cCI6MjA4OTYxNTY5OX0.snBdoxPEfKhSxQrwBC3v8OgOCiuOFx8P1ESy_Cyshpc"
);

async function checkOrders() {
  const { data, error } = await supabase.from("marketplace_orders").select("id, status, order_created_at");
  if (error) console.error("Error:", error);
  console.log("Total orders in DB:", data?.length);

  const counts = (data || []).reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  console.log("Order Statuses in DB:", Object.entries(counts).map(([k,v])=> `${k}: ${v}`).join(", "));
  
  const thisMonth = data?.filter(r => new Date(r.order_created_at) >= new Date('2026-03-01'));
  console.log("Orders in March 2026:", thisMonth?.length);
  
  const completedThisMonth = thisMonth?.filter(r => ['DELIVERED', 'COMPLETED', 'PARTIALLY_DELIVERED'].includes(r.status?.toUpperCase()));
  console.log("Completed/Delivered in March 2026:", completedThisMonth?.length);
}
checkOrders();
