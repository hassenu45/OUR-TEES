/* Our Tees - API Wrapper (Local Mode, No Server Needed)
   All operations go through DB (localStorage).
   This file keeps the same interface so admin.js / store.js need no changes. */

const API = {
  /* ── Settings ── */
  async getSettings() {
    return DB.getSettings();
  },

  async getAdminSettings() {
    return DB.getAdminSettings();
  },

  async updateSettings(data) {
    return DB.updateSettings(data);
  },

  /* ── Products ── */
  async getProducts() {
    return DB.getProducts();
  },

  async getProduct(id) {
    return DB.getProduct(id);
  },

  async createProduct(data) {
    return DB.createProduct(data);
  },

  async updateProduct(id, data) {
    return DB.updateProduct(id, data);
  },

  async deleteProduct(id) {
    return DB.deleteProduct(id);
  },

  async createProductWithFormData(formData) {
    const data = {};
    formData.forEach((value, key) => {
      if (key === 'images') return;
      data[key] = value;
    });
    const images = formData.getAll('images').filter(f => f instanceof File);
    if (images.length) {
      data.images = await Promise.all(images.map(fileToDataUrl));
      data.image = data.images[0];
    }
    if (!data.images || !data.images.length) {
      throw Object.assign(new Error('No image'), { code: 'NO_IMAGE' });
    }
    return DB.createProduct(data);
  },

  async uploadProductImage(id, file) {
    const dataUrl = await fileToDataUrl(file);
    return DB.updateProduct(id, { image: dataUrl, images: [dataUrl] });
  },

  /* ── Orders ── */
  async getOrders() {
    return DB.getOrders();
  },

  async submitOrder(data) {
    return DB.createOrder(data);
  },

  async updateOrderStatus(id, status) {
    return DB.updateOrderStatus(id, status);
  },

  async deleteOrder(id) {
    return DB.deleteOrder(id);
  },

  /* ── Auth (removed - direct access) ── */
  async checkAuth() {
    return { authenticated: true, isAdmin: true, name: 'Admin' };
  },

  /* ── Chat ── */
  async sendChat(message, history) {
    return DB.sendChat(message, history);
  },
};

/* ── Helpers ── */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ── Formatting (unchanged) ── */
function formatPrice(price, symbol) {
  return `${parseFloat(price).toFixed(2)} ${symbol || 'ر.س'}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
