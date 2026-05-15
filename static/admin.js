/* ════════════════════════════════════════════════════════════
   SMARTPRINT ADMIN DASHBOARD — JAVASCRIPT
   ════════════════════════════════════════════════════════════ */

// ════════════════════════════════════════════
// CONFIGURATION & STATE
// ════════════════════════════════════════════

const CONFIG = {
    SUPABASE_URL: "https://vapixsmaytuvvvvzcpou.supabase.co",
    SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcGl4c21heXR1dnZ2emNwb3UiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczMDM2OTQ4OCwiZXhwIjoyMDQ1OTQ1NDg4fQ.XJ8X8_X1l4VXfW8gOvNzPcQhz5NhVKNADNvZKCuAiIw"
  };

  const DEMO_MODE = true;
  
  const STATE = {
    allOrders: [],
    filteredOrders: [],
    connectionStatus: false,
    currentTab: "pesanan",
    searchQuery: "",
    statusFilter: "all"
  };
  
  // ════════════════════════════════════════════
  // INITIALIZATION
  // ════════════════════════════════════════════
  
  /**
   * Initialize admin dashboard on load
   */
  async function initAdmin() {
    try {
      setupEventListeners();
      await loadOrders();
      ensureDemoOrders();
      updateAdminStats();
      renderOrderTable();
      initializeChart();
    } catch (e) {
      console.error("[Admin Init] Error:", e);
      showToast("Error initializing dashboard", "error");
    }
  }
  
  /**
   * Setup all event listeners
   */
  function setupEventListeners() {
    // Tab buttons - now handled via onclick in HTML
    // Search and filter
    const searchInput = document.getElementById("search-input");
    const statusFilter = document.getElementById("status-filter");
  
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        STATE.searchQuery = e.target.value.toLowerCase();
        filterOrders();
        renderOrderTable();
      });
    }
  
    if (statusFilter) {
      statusFilter.addEventListener("change", (e) => {
        STATE.statusFilter = e.target.value;
        filterOrders();
        renderOrderTable();
      });
    }
  }
  
  // ════════════════════════════════════════════
  // DATA OPERATIONS
  // ════════════════════════════════════════════
  
  /**
   * Load orders from Supabase REST API or localStorage fallback
   */
  async function loadOrders() {
    try {
      const headers = {
        Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      };
  
      const response = await fetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/orders?select=*`,
        { headers }
      );
  
      if (response.ok) {
        STATE.allOrders = await response.json();
        STATE.connectionStatus = true;
        updateConnectionStatus(true);
      } else {
        throw new Error(`API responded with ${response.status}`);
      }
    } catch (e) {
      console.warn("[Load Orders] Supabase failed, falling back to localStorage");
  
      // Fallback to localStorage (legacy key + key dari landing page)
      const stored = localStorage.getItem("allOrders") || localStorage.getItem("sp_local_orders");
      if (stored) {
        try {
          STATE.allOrders = JSON.parse(stored);
        } catch (err) {
          console.error("[Load Orders] localStorage parse error:", err);
          STATE.allOrders = [];
        }
      }
  
      STATE.connectionStatus = false;
      updateConnectionStatus(false);
    }
  
    filterOrders();
  }

  function ensureDemoOrders() {
    if (!DEMO_MODE) return;
    if (Array.isArray(STATE.allOrders) && STATE.allOrders.length > 0) return;

    const now = new Date();
    const mkDate = (m) => new Date(now.getTime() - m * 60000).toISOString();
    STATE.allOrders = [
      { order_id: "SP-DEMO-1001", nama: "Alya Putri", wa: "081234567890", file_name: "Makalah-PAI.docx", pages: 12, copies: 1, total: 24500, location: "gedung-a", status: "pending", created_at: mkDate(8) },
      { order_id: "SP-DEMO-1002", nama: "Rizky Maulana", wa: "082233445566", file_name: "Skripsi-Bab4.pdf", pages: 48, copies: 2, total: 192500, location: "perpustakaan", status: "confirmed", created_at: mkDate(20) },
      { order_id: "SP-DEMO-1003", nama: "Nadia Safitri", wa: "085712349999", file_name: "Laporan-Praktikum.docx", pages: 18, copies: 1, total: 36500, location: "gedung-b", status: "printing", created_at: mkDate(34) },
      { order_id: "SP-DEMO-1004", nama: "Dimas Pratama", wa: "081298765432", file_name: "Proposal-KKN.pdf", pages: 22, copies: 1, total: 44500, location: "sekretariat", status: "done", created_at: mkDate(61) }
    ];

    localStorage.setItem("sp_local_orders", JSON.stringify(STATE.allOrders));
    filterOrders();
  }
  
  /**
   * Filter orders by search query and status
   */
  function filterOrders() {
    STATE.filteredOrders = STATE.allOrders.filter((order) => {
      // Status filter
      if (STATE.statusFilter !== "all" && order.status !== STATE.statusFilter) {
        return false;
      }
  
      // Search filter (search in nama, order_id, wa, location)
      if (STATE.searchQuery) {
        const searchableText = `${order.order_id} ${order.nama} ${order.wa} ${order.location}`.toLowerCase();
        if (!searchableText.includes(STATE.searchQuery)) {
          return false;
        }
      }
  
      return true;
    });
  }
  
  /**
   * Update order status via PATCH request
   */
  async function updateOrderStatus(orderId, newStatus) {
    try {
      const headers = {
        Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      };
  
      const response = await fetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/orders?order_id=eq.${orderId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() })
        }
      );
  
      if (response.ok) {
        // Update local state
        const orderIdx = STATE.allOrders.findIndex((o) => o.order_id === orderId);
        if (orderIdx !== -1) {
          STATE.allOrders[orderIdx].status = newStatus;
          STATE.allOrders[orderIdx].updated_at = new Date().toISOString();
        }
  
        localStorage.setItem("allOrders", JSON.stringify(STATE.allOrders));
        filterOrders();
        renderOrderTable();
        updateAdminStats();
  
        showToast(`Order ${orderId} marked as ${newStatus}`, "success");
        return true;
      } else {
        throw new Error(`API error: ${response.status}`);
      }
    } catch (e) {
      console.error("[Update Status] Error:", e);
      showToast("Failed to update order status", "error");
      return false;
    }
  }
  
  // ════════════════════════════════════════════
  // UI OPERATIONS
  // ════════════════════════════════════════════
  
  /**
   * Switch between tabs (Pesanan, Pesan, Revenue)
   */
  function switchTab(tab, element) {
    STATE.currentTab = tab;
  
    // Update tab buttons
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    if (element) element.classList.add("active");
  
    // Update tab content
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active");
    });
    const tabEl = document.getElementById(`${tab}-tab`);
    if (tabEl) tabEl.classList.add("active");
  
    // Update chart if revenue tab
    if (tab === "revenue") {
      setTimeout(() => updateChart(), 100);
    }
  }
  
  /**
   * Update connection status indicator
   */
  function updateConnectionStatus(isConnected) {
    const statusDot = document.querySelector(".status-dot");
    const statusText = document.querySelector(".header-status");
  
    if (!statusDot) return;
  
    if (isConnected) {
      statusDot.classList.remove("disconnected");
      statusDot.classList.add("connected");
      if (statusText) statusText.textContent = "● Connected to Supabase";
    } else {
      statusDot.classList.remove("connected");
      statusDot.classList.add("disconnected");
      if (statusText) statusText.textContent = "● Using Local Cache";
    }
  }
  
  /**
   * Render order table
   */
  function renderOrderTable() {
    const tbody = document.getElementById("orders-body");
    if (!tbody) return;
  
    if (STATE.filteredOrders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-message">
            No orders found ${STATE.searchQuery || STATE.statusFilter !== "all" ? "matching filters" : ""}
          </td>
        </tr>
      `;
      return;
    }
  
    tbody.innerHTML = STATE.filteredOrders
      .map((order) => createOrderRow(order))
      .join("");
  
    // Attach event listeners to action buttons
    document.querySelectorAll(".btn-status").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const orderId = btn.dataset.orderId;
        const newStatus = btn.dataset.status;
        await updateOrderStatus(orderId, newStatus);
      });
    });
  
    document.querySelectorAll(".btn-whatsapp").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const orderId = btn.dataset.orderId;
        const order = STATE.allOrders.find((o) => o.order_id === orderId);
        if (order && order.wa) {
          window.open(`https://wa.me/${order.wa}`, "_blank");
        }
      });
    });
  }
  
  /**
   * Create HTML for a single order row
   */
  function createOrderRow(order) {
    const createdDate = new Date(order.created_at);
    const dateStr = createdDate.toLocaleDateString("id-ID", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  
    const statusStyles = {
      pending: "pending",
      confirmed: "confirmed",
      printing: "printing",
      done: "done",
      cancelled: "cancelled"
    };
  
    const fileName = order.file_url ? order.file_url.split("/").pop().slice(0, 15) : "—";
  
    return `
      <tr>
        <td><span class="order-id">#${order.order_id}</span></td>
        <td>${order.nama}</td>
        <td>${order.wa}</td>
        <td>${fileName}</td>
        <td>${order.pages || "—"}</td>
        <td>Rp ${parseInt(order.total || 0).toLocaleString("id-ID")}</td>
        <td>${order.location || "—"}</td>
        <td>
          <span class="status-badge ${statusStyles[order.status] || "pending"}">
            ${formatStatus(order.status)}
          </span>
        </td>
        <td>${dateStr}</td>
        <td>
          <div class="action-buttons">
            ${createStatusButtons(order)}
            <button class="btn-small btn-whatsapp" data-order-id="${order.order_id}" title="Open WhatsApp">
              📱 WA
            </button>
          </div>
        </td>
      </tr>
    `;
  }
  
  /**
   * Create status change buttons for order
   */
  function createStatusButtons(order) {
    const currentStatus = order.status;
    const buttons = [];
  
    if (currentStatus !== "confirmed") {
      buttons.push(`
        <button class="btn-small btn-status" data-order-id="${order.order_id}" data-status="confirmed">
          ✓ Konfirm
        </button>
      `);
    }
  
    if (currentStatus !== "printing") {
      buttons.push(`
        <button class="btn-small btn-status" data-order-id="${order.order_id}" data-status="printing">
          ⟳ Cetak
        </button>
      `);
    }
  
    if (currentStatus !== "done") {
      buttons.push(`
        <button class="btn-small btn-status" data-order-id="${order.order_id}" data-status="done">
          ✓✓ Sudah Bayar
        </button>
      `);
    }
  
    return buttons.join("");
  }
  
  // ════════════════════════════════════════════
  // STATISTICS & CALCULATIONS
  // ════════════════════════════════════════════
  
  /**
   * Update admin dashboard statistics
   */
  function updateAdminStats() {
    const totalOrders = STATE.allOrders.length;
    const pendingOrders = STATE.allOrders.filter((o) => o.status === "pending").length;
    const printingOrders = STATE.allOrders.filter((o) => o.status === "printing").length;
    const doneOrders = STATE.allOrders.filter((o) => o.status === "done").length;
  
    // Update stat cards
    updateStatCard("stat-total", totalOrders, totalOrders > 0 ? 100 : 0);
    updateStatCard("stat-pending", pendingOrders, totalOrders > 0 ? (pendingOrders / totalOrders) * 100 : 0);
    updateStatCard("stat-printing", printingOrders, totalOrders > 0 ? (printingOrders / totalOrders) * 100 : 0);
    updateStatCard("stat-done", doneOrders, totalOrders > 0 ? (doneOrders / totalOrders) * 100 : 0);
  
    // Update message select
    updateMessageSelect();
  
    // Update revenue
    updateRevenueCalculations("all");
  }
  
  /**
   * Update individual stat card
   */
  function updateStatCard(id, value, percentage) {
    const card = document.getElementById(id);
    if (!card) return;
  
    const valueEl = card.querySelector(".stat-value");
    const barFill = card.querySelector(".stat-bar-fill");
  
    if (valueEl) valueEl.textContent = value;
    if (barFill) barFill.style.width = `${Math.min(percentage, 100)}%`;
  }
  
  /**
   * Calculate and update revenue statistics
   */
  function updateRevenueCalculations(period = "all") {
    if (!STATE.allOrders.length) {
      updateRevenueCardValue("total-revenue", 0);
      updateRevenueCardValue("rev-today", 0);
      updateRevenueCardValue("rev-week", 0);
      updateRevenueCardValue("rev-month", 0);
      updateRevenueCardValue("rev-average", 0);
      return;
    }
  
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
  
    // Total revenue (all done orders)
    const totalRevenue = STATE.allOrders
      .filter((o) => o.status === "done")
      .reduce((sum, o) => sum + parseInt(o.total || 0), 0);
  
    // Today's revenue
    const todayRevenue = STATE.allOrders
      .filter((o) => {
        const orderDate = new Date(o.created_at);
        return orderDate >= today && o.status === "done";
      })
      .reduce((sum, o) => sum + parseInt(o.total || 0), 0);
  
    // Week's revenue
    const weekRevenue = STATE.allOrders
      .filter((o) => {
        const orderDate = new Date(o.created_at);
        return orderDate >= weekAgo && o.status === "done";
      })
      .reduce((sum, o) => sum + parseInt(o.total || 0), 0);
  
    // Month's revenue
    const monthRevenue = STATE.allOrders
      .filter((o) => {
        const orderDate = new Date(o.created_at);
        return orderDate >= monthAgo && o.status === "done";
      })
      .reduce((sum, o) => sum + parseInt(o.total || 0), 0);
  
    // Average per order
    const doneOrders = STATE.allOrders.filter((o) => o.status === "done").length;
    const avgRevenue = doneOrders > 0 ? Math.round(totalRevenue / doneOrders) : 0;
  
    updateRevenueCardValue("total-revenue", totalRevenue);
    updateRevenueCardValue("rev-today", todayRevenue);
    updateRevenueCardValue("rev-week", weekRevenue);
    updateRevenueCardValue("rev-month", monthRevenue);
    updateRevenueCardValue("rev-average", avgRevenue);
  }
  
  /**
   * Update revenue card display
   */
  function updateRevenueCardValue(id, amount) {
    const card = document.getElementById(id);
    if (card) {
      card.textContent = `Rp ${amount.toLocaleString("id-ID")}`;
    }
  }
  
  /**
   * Update message select dropdown with current orders
   */
  function updateMessageSelect() {
    const select = document.getElementById("message-select");
    if (!select) return;
  
    const options = STATE.allOrders
      .filter((o) => o.status !== "done" && o.status !== "cancelled")
      .map((o) => `<option value="${o.order_id}">#${o.order_id} - ${o.nama}</option>`)
      .join("");
  
    select.innerHTML = `<option value="">Select an order...</option>${options}`;
  }
  
  // ════════════════════════════════════════════
  // CHART OPERATIONS (Chart.js)
  // ════════════════════════════════════════════
  
  let revenueChart = null;
  
  /**
   * Initialize revenue chart
   */
  function initializeChart() {
    const chartCanvas = document.getElementById("revenue-chart");
    if (!chartCanvas) return;
  
    try {
      if (typeof Chart === "undefined") {
        console.warn("[Chart] Chart.js not available");
        return;
      }
  
      const ctx = chartCanvas.getContext("2d");
      const chartData = calculateChartData();
  
      revenueChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: chartData.labels,
          datasets: [
            {
              label: "Revenue (Rp)",
              data: chartData.data,
              backgroundColor: "rgba(0, 229, 180, 0.2)",
              borderColor: "#00e5b4",
              borderWidth: 2,
              borderRadius: 6,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              labels: {
                color: "#eef0f6"
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: "#5a6278"
              },
              grid: {
                color: "rgba(255, 255, 255, 0.05)"
              }
            },
            x: {
              ticks: {
                color: "#5a6278"
              },
              grid: {
                display: false
              }
            }
          }
        }
      });
    } catch (e) {
      console.error("[Chart Init] Error:", e);
    }
  }
  
  /**
   * Calculate data for revenue chart (last 7 days)
   */
  function calculateChartData() {
    const labels = [];
    const data = [];
  
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString("id-ID", { month: "short", day: "numeric" }));
  
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  
      const dayRevenue = STATE.allOrders
        .filter((o) => {
          const orderDate = new Date(o.created_at);
          return orderDate >= dayStart && orderDate < dayEnd && o.status === "done";
        })
        .reduce((sum, o) => sum + parseInt(o.total || 0), 0);
  
      data.push(dayRevenue);
    }
  
    return { labels, data };
  }
  
  /**
   * Update chart with new data
   */
  function updateChart() {
    if (!revenueChart) return;
  
    const chartData = calculateChartData();
    revenueChart.data.labels = chartData.labels;
    revenueChart.data.datasets[0].data = chartData.data;
    revenueChart.update();
  }
  
  // ════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ════════════════════════════════════════════
  
  /**
   * Format status text for display
   */
  function formatStatus(status) {
    const statusMap = {
      pending: "Menunggu",
      confirmed: "Dikonfirmasi",
      printing: "Sedang Cetak",
      done: "Selesai",
      cancelled: "Batal"
    };
    return statusMap[status] || status;
  }
  
  /**
   * Show toast notification
   */
  function showToast(message, type = "info") {
    try {
      const toast = document.getElementById("toast");
      if (!toast) return;
  
      toast.textContent = message;
      toast.classList.add("show");
  
      // Remove type classes
      toast.classList.remove("error", "warning", "success");
  
      // Add type class if not default info
      if (type !== "info") {
        toast.classList.add(type);
      }
  
      setTimeout(() => {
        toast.classList.remove("show");
      }, 3000);
    } catch (e) {
      console.error("[Toast] Error:", e);
    }
  }
  
  /**
   * Logout admin
   */
  function logoutAdmin() {
    if (confirm("Are you sure you want to logout?")) {
      sessionStorage.removeItem("adminLogged");
      window.location.href = "index.html";
    }
  }
  
  /**
   * Close admin panel
   */
  function closeAdmin() {
    window.history.back();
  }
  
  /**
   * Send predefined notification
   */
  function sendNotification(status) {
    try {
      const phoneEl = document.getElementById("notif-wa");
      const orderIdEl = document.getElementById("notif-order-id");
  
      const phone = phoneEl ? phoneEl.value.trim() : "";
      const orderId = orderIdEl ? orderIdEl.value.trim() : "";
  
      if (!phone) {
        showToast("Please enter WhatsApp number", "warning");
        return;
      }
  
      const messages = {
        confirmed: "✅ Pesanan Anda telah dikonfirmasi! Kami siap mencetak dokumen Anda.",
        printing: "🖨️ Pesanan Anda sedang diproses. Harap tunggu beberapa saat.",
        done: "🎉 Pesanan Anda sudah selesai! Silakan ambil di lokasi yang telah ditentukan."
      };
  
      const message = `${messages[status] || ""} ${orderId ? `[${orderId}]` : ""}`;
      const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  
      window.open(waLink, "_blank");
      showToast("WhatsApp opened successfully", "success");
    } catch (e) {
      console.error("[Send Notification] Error:", e);
      showToast("Error opening WhatsApp", "error");
    }
  }
  
  /**
   * Send custom message
   */
  function sendCustomMessage() {
    try {
      const phoneEl = document.getElementById("notif-wa");
      const messageEl = document.getElementById("custom-message");
  
      const phone = phoneEl ? phoneEl.value.trim() : "";
      const message = messageEl ? messageEl.value.trim() : "";
  
      if (!phone) {
        showToast("Please enter WhatsApp number", "warning");
        return;
      }
  
      if (!message) {
        showToast("Please enter message", "warning");
        return;
      }
  
      const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(waLink, "_blank");
  
      if (messageEl) messageEl.value = "";
      if (phoneEl) phoneEl.value = "";
  
      showToast("WhatsApp opened successfully", "success");
    } catch (e) {
      console.error("[Send Custom Message] Error:", e);
      showToast("Error opening WhatsApp", "error");
    }
  }
  
  // ════════════════════════════════════════════
  // DOCUMENT READY
  // ════════════════════════════════════════════
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdmin);
  } else {
    initAdmin();
  }