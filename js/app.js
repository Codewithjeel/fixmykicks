/**
 * FixMyKicks Delhi — Storefront, Multi-Photo Hover/Click Slider, Brand Manager & 100% WhatsApp Ordering
 * - Zero payment screens or payment mentions: 100% of orders & inquiries go directly to WhatsApp
 * - Multi-photo horizontal slider on shoe cards (hover auto-slide, cursor scrub, arrow click, indicator click & touch swipe)
 * - Instant 1-Click "Order Now" on WhatsApp + Multi-Pair "WhatsApp Order Bag" for ordering multiple shoes together
 * - Custom Shoe Request form, Live Video/Photo WhatsApp request, Price Range filter, Active Filter pills & Keyboard navigation
 * - Admin-only system file upload (multiple photos per shoe, cover photo selection) & dynamic Brand Management
 */

const state = {
  allProducts: [],
  filteredProducts: [],
  brands: [],
  activeBrand: 'All',
  activeCategory: 'All',
  activeGender: 'All',
  activeSize: 'All',
  activePriceRange: 'All',
  searchQuery: '',
  sortBy: 'newest',
  currentPage: 1,
  itemsPerPage: 24,
  selectedSizes: {},         // { [productId]: 'UK 8' }
  activeCardImageIdx: {},    // { [productId]: 0 }
  hoverTimers: {},           // { [productId]: intervalId }
  lastHoverScrubTs: {},      // { [productId]: timestamp }
  touchStartX: {},           // { [productId]: number }
  orderBag: JSON.parse(localStorage.getItem('fmk_whatsapp_bag') || '[]'), // [{ key, id, name, brand, price, size, image }]
  modalProduct: null,
  modalImageIndex: 0,
  stagedUploadImages: [],    // Array of dataURLs/paths from system file picker
  isAdmin: sessionStorage.getItem('fmk_admin_unlocked') === 'true',
  adminPin: localStorage.getItem('fmk_admin_pin') || 'YashFixMyKicks@6290',
  whatsappNumber: (localStorage.getItem('fmk_whatsapp_number') && localStorage.getItem('fmk_whatsapp_number') !== '919876543210')
    ? localStorage.getItem('fmk_whatsapp_number')
    : '917303039323',
  secondaryWhatsappNumber: '916378599513',
  instagramUrl: 'https://www.instagram.com/fixmykickss.in',
  telegramUrl: 'https://t.me/yashaswani77',
  storeAddress: localStorage.getItem('fmk_store_address') || 'Karol Bagh, New Delhi - 110005'
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadStoreSettings();
  await loadBrands();
  await refreshInventory();
  initSearchAndFilterListeners();
  initPhotoDropzoneDragAndDrop();
  initKeyboardShortcuts();
  updateStoreSettingsUI();
  updateAdminUI();
  renderOrderBagUI();
  initLiveAutoSync();
});

/**
 * Keyboard shortcuts for customer modal navigation (Left/Right arrows slide photos, Esc closes modals)
 */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const productModal = document.getElementById('product-modal');
    const isProductModalOpen = productModal && !productModal.classList.contains('hidden');

    if (isProductModalOpen) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepModalImage(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepModalImage(1);
      } else if (e.key === 'Escape') {
        closeProductModal();
      }
      return;
    }

    if (e.key === 'Escape') {
      closeOrderBagDrawer();
      closeSizeChartModal();
      closeBrandsModal();
      closeAddProductModal();
      closeSettingsModal();
      closeAdminLoginModal();
    }
  });
}

/**
 * Load store settings from server or localStorage
 */
async function loadStoreSettings() {
  if (localStorage.getItem('fmk_whatsapp_number') === '919876543210') {
    localStorage.setItem('fmk_whatsapp_number', '917303039323');
    state.whatsappNumber = '917303039323';
  }
  if (!localStorage.getItem('fmk_admin_pin') || localStorage.getItem('fmk_admin_pin') === '8080') {
    localStorage.setItem('fmk_admin_pin', 'YashFixMyKicks@6290');
    state.adminPin = 'YashFixMyKicks@6290';
  }
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.whatsappNumber && data.whatsappNumber !== '919876543210') {
        state.whatsappNumber = data.whatsappNumber;
        localStorage.setItem('fmk_whatsapp_number', data.whatsappNumber);
      }
      if (data.secondaryWhatsappNumber) {
        state.secondaryWhatsappNumber = data.secondaryWhatsappNumber;
      }
      if (data.instagramUrl) {
        state.instagramUrl = data.instagramUrl;
      }
      if (data.telegramUrl) {
        state.telegramUrl = data.telegramUrl;
      }
      if (data.storeAddress) {
        state.storeAddress = data.storeAddress;
        localStorage.setItem('fmk_store_address', data.storeAddress);
      }
      if (data.adminPin) {
        state.adminPin = data.adminPin;
        localStorage.setItem('fmk_admin_pin', data.adminPin);
      }
    }
  } catch (_) {}
}

/**
 * Load brands from BrandsAPI and render across Header, Footer, Upload Select & Brands Modal
 */
async function loadBrands() {
  state.brands = await window.BrandsAPI.fetchAll();
  renderBrandsUI();
}

function escapeHtmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderBrandsUI(selectedBrandInForm) {
  // 1. Header Brand Navigation Bar
  const headerBar = document.getElementById('header-brands-bar');
  if (headerBar) {
    const allBtnClass = state.activeBrand === 'All'
      ? 'bg-[#111111] text-white'
      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100';

    let html = `
      <button onclick="filterByBrand('All')" data-brand="All" class="brand-nav-btn px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${allBtnClass}">
        All Footwear
      </button>
    `;

    state.brands.forEach(brand => {
      const isActive = state.activeBrand.toLowerCase() === brand.toLowerCase();
      const btnClass = isActive
        ? 'bg-[#111111] text-white'
        : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100';
      const safeBrand = escapeHtmlAttr(brand);
      html += `
        <button onclick="filterByBrand('${safeBrand}')" data-brand="${safeBrand}" class="brand-nav-btn px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${btnClass}">
          ${safeBrand}
        </button>
      `;
    });

    if (state.isAdmin) {
      html += `
        <button onclick="openBrandsModal()" class="ml-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border border-dashed border-[#D90429] text-[#D90429] hover:bg-red-50 transition-all flex items-center gap-1 shrink-0">
          <i class="fa-solid fa-plus text-[10px]"></i> Add Brand
        </button>
      `;
    }

    headerBar.innerHTML = html;
  }

  // 2. Footer Brands List
  const footerList = document.getElementById('footer-brands-list');
  if (footerList) {
    footerList.innerHTML = state.brands.slice(0, 8).map(brand => {
      const safeBrand = escapeHtmlAttr(brand);
      return `<li><button onclick="filterByBrand('${safeBrand}')" class="hover:text-white transition-colors">${safeBrand}</button></li>`;
    }).join('');
  }

  // 3. Upload Shoe Modal Brand Select Dropdown
  const brandSelect = document.getElementById('new-shoe-brand');
  if (brandSelect) {
    const currentVal = selectedBrandInForm || brandSelect.value || state.brands[0] || 'Nike';
    brandSelect.innerHTML = state.brands.map(brand => {
      const safeBrand = escapeHtmlAttr(brand);
      const isSelected = brand.toLowerCase() === currentVal.toLowerCase() ? 'selected' : '';
      return `<option value="${safeBrand}" ${isSelected}>${safeBrand}</option>`;
    }).join('');
  }

  // 4. Manage Brands Modal List
  const manageList = document.getElementById('manage-brands-list');
  if (manageList) {
    if (state.brands.length === 0) {
      manageList.innerHTML = `<div class="p-4 text-center text-xs text-neutral-500">No brands added yet.</div>`;
    } else {
      manageList.innerHTML = state.brands.map(brand => {
        const safeBrand = escapeHtmlAttr(brand);
        const count = state.allProducts.filter(p => (p.brand || '').toLowerCase() === brand.toLowerCase()).length;
        return `
          <div class="flex items-center justify-between py-2.5 px-3.5 hover:bg-white transition-colors">
            <div class="flex items-center gap-2.5">
              <span class="font-bold text-xs text-neutral-900">${safeBrand}</span>
              <span class="text-[11px] text-neutral-400 font-medium">(${count} ${count === 1 ? 'shoe' : 'shoes'})</span>
            </div>
            <button 
              type="button"
              onclick="handleDeleteBrand('${safeBrand}')" 
              class="text-neutral-400 hover:text-[#D90429] text-xs px-2 py-1 rounded transition-colors"
              title="Remove brand">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;
      }).join('');
    }
  }
}

/**
 * Refresh shoe inventory from server / IndexedDB
 */
async function refreshInventory() {
  state.allProducts = await window.InventoryAPI.fetchAll();

  // Ensure any brand present on uploaded shoes is also in state.brands
  let brandsChanged = false;
  for (const shoe of state.allProducts) {
    if (shoe.brand && !state.brands.some(b => b.toLowerCase() === shoe.brand.toLowerCase())) {
      state.brands.push(shoe.brand);
      brandsChanged = true;
    }
  }
  if (brandsChanged) {
    renderBrandsUI();
  }

  // Initialize active image index for each shoe (no size pre-selected by default)
  state.allProducts.forEach(shoe => {
    if (state.activeCardImageIdx[shoe.id] === undefined) {
      state.activeCardImageIdx[shoe.id] = 0;
    }
  });

  applyFiltersAndRender();
  renderBrandsUI();
  if (typeof catalogSyncHash !== 'undefined') {
    catalogSyncHash = computeCatalogHash(state.allProducts);
  }
}

let catalogSyncHash = '';

function computeCatalogHash(products) {
  if (!Array.isArray(products)) return '';
  return products.map(p => `${p.id}:${p.price}:${p.inStock}:${(p.sizes || []).join(',')}:${(p.images || []).length}`).join('|');
}

/**
 * Ultra-fast Live Background Auto-Sync
 * Reflects new shoe uploads, price edits, or deletions across all phones & laptops in ~5 seconds
 * with zero page reload required.
 */
function initLiveAutoSync() {
  catalogSyncHash = computeCatalogHash(state.allProducts);
  let pollInterval = null;
  let isChecking = false;

  const checkLiveSync = async () => {
    if (isChecking) return;
    isChecking = true;

    try {
      // Do not interrupt if admin is currently typing in the Add / Edit shoe modal
      const addModal = document.getElementById('add-product-modal');
      const isEditingForm = addModal && !addModal.classList.contains('hidden');

      const latestProducts = await window.InventoryAPI.fetchAll();
      const newHash = computeCatalogHash(latestProducts);

      if (newHash && newHash !== catalogSyncHash) {
        const prevCount = state.allProducts.length;
        const newCount = latestProducts.length;
        catalogSyncHash = newHash;
        state.allProducts = latestProducts;

        // Auto-discover newly added brands
        let brandsChanged = false;
        for (const shoe of state.allProducts) {
          if (shoe.brand && !state.brands.some(b => b.toLowerCase() === shoe.brand.toLowerCase())) {
            state.brands.push(shoe.brand);
            brandsChanged = true;
          }
        }
        if (brandsChanged) renderBrandsUI();

        // Initialize active image index
        state.allProducts.forEach(shoe => {
          if (state.activeCardImageIdx[shoe.id] === undefined) {
            state.activeCardImageIdx[shoe.id] = 0;
          }
        });

        // Re-render catalog smoothly
        applyFiltersAndRender();

        // If another device uploaded new shoe(s), show sleek toast
        if (newCount > prevCount && !isEditingForm) {
          showToast(`🔥 Catalog updated! (${newCount - prevCount} new sneaker${newCount - prevCount > 1 ? 's' : ''})`);
        }
      }
    } catch (_) {
      // Silent catch on background network hiccups
    } finally {
      isChecking = false;
    }
  };

  const startFastPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(checkLiveSync, 5000); // Minimum time: 5 seconds!
  };

  // Immediate sync when tab becomes visible (user unlocks phone or returns from WhatsApp)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(checkLiveSync, 20000);
    } else {
      checkLiveSync();
      startFastPolling();
    }
  });

  // Immediate sync when browser window receives focus
  window.addEventListener('focus', () => {
    checkLiveSync();
  });

  startFastPolling();
}

/**
 * Filter & Sort Event Listeners
 */
function initSearchAndFilterListeners() {
  const searchDesktop = document.getElementById('search-input');
  const searchMobile = document.getElementById('search-input-mobile');

  const handleSearch = (val) => {
    state.searchQuery = val.trim();
    state.currentPage = 1;
    applyFiltersAndRender();
  };

  if (searchDesktop) {
    searchDesktop.addEventListener('input', (e) => {
      if (searchMobile) searchMobile.value = e.target.value;
      handleSearch(e.target.value);
    });
  }

  if (searchMobile) {
    searchMobile.addEventListener('input', (e) => {
      if (searchDesktop) searchDesktop.value = e.target.value;
      handleSearch(e.target.value);
    });
  }

  const categorySelect = document.getElementById('category-filter');
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      state.activeCategory = e.target.value;
      state.currentPage = 1;
      applyFiltersAndRender();
    });
  }

  const sizeSelect = document.getElementById('size-filter');
  if (sizeSelect) {
    sizeSelect.addEventListener('change', (e) => {
      state.activeSize = e.target.value;
      state.currentPage = 1;
      applyFiltersAndRender();
    });
  }

  const priceSelect = document.getElementById('price-filter');
  if (priceSelect) {
    priceSelect.addEventListener('change', (e) => {
      state.activePriceRange = e.target.value;
      state.currentPage = 1;
      applyFiltersAndRender();
    });
  }

  const sortSelect = document.getElementById('sort-filter');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      state.currentPage = 1;
      applyFiltersAndRender();
    });
  }
}

/**
 * Filter by Brand
 */
function filterByBrand(brand) {
  state.activeBrand = brand;
  state.currentPage = 1;

  const headingEl = document.getElementById('active-brand-heading');
  if (headingEl) {
    headingEl.textContent = brand === 'All' ? 'All Footwear' : `${brand} Collection`;
  }

  renderBrandsUI();
  applyFiltersAndRender();

  const catalogEl = document.getElementById('catalog-section');
  if (catalogEl && brand !== 'All') {
    catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Filter by Gender (Men / Women / Unisex / All)
 */
function filterByGender(gender) {
  state.activeGender = gender;
  state.currentPage = 1;

  const validGenders = ['All', 'Men', 'Women', 'Unisex'];
  validGenders.forEach(g => {
    const btn = document.getElementById(`gender-pill-${g}`);
    if (btn) {
      if (g === gender) {
        btn.className = 'gender-nav-pill px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-[#111111] text-white shadow-sm';
      } else {
        btn.className = 'gender-nav-pill px-3.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-all';
      }
    }
  });

  applyFiltersAndRender();
}

/**
 * Reset all active filters
 */
function resetAllFilters() {
  state.activeBrand = 'All';
  state.activeCategory = 'All';
  state.activeGender = 'All';
  state.activeSize = 'All';
  state.activePriceRange = 'All';
  state.searchQuery = '';
  state.sortBy = 'newest';
  state.currentPage = 1;

  const s1 = document.getElementById('search-input');
  const s2 = document.getElementById('search-input-mobile');
  const cat = document.getElementById('category-filter');
  const sz = document.getElementById('size-filter');
  const prc = document.getElementById('price-filter');
  const srt = document.getElementById('sort-filter');
  const headingEl = document.getElementById('active-brand-heading');

  if (s1) s1.value = '';
  if (s2) s2.value = '';
  if (cat) cat.value = 'All';
  if (sz) sz.value = 'All';
  if (prc) prc.value = 'All';
  if (srt) srt.value = 'newest';
  if (headingEl) headingEl.textContent = 'All Footwear';

  const validGenders = ['All', 'Men', 'Women', 'Unisex'];
  validGenders.forEach(g => {
    const btn = document.getElementById(`gender-pill-${g}`);
    if (btn) {
      btn.className = g === 'All'
        ? 'gender-nav-pill px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-[#111111] text-white shadow-sm'
        : 'gender-nav-pill px-3.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-all';
    }
  });

  renderBrandsUI();
  applyFiltersAndRender();
}

/**
 * Render Active Filter Pills so customer can see & remove individual filters easily
 */
function renderActiveFilterPills() {
  const strip = document.getElementById('active-filters-strip');
  if (!strip) return;

  const pills = [];

  if (state.activeBrand !== 'All') {
    pills.push({ label: `Brand: ${state.activeBrand}`, action: "filterByBrand('All')" });
  }
  if (state.activeGender !== 'All') {
    pills.push({ label: `Dept: ${state.activeGender}`, action: "filterByGender('All')" });
  }
  if (state.activeCategory !== 'All') {
    pills.push({ label: `Category: ${state.activeCategory}`, action: "clearSingleFilter('category')" });
  }
  if (state.activeSize !== 'All') {
    pills.push({ label: `Size: ${state.activeSize}`, action: "clearSingleFilter('size')" });
  }
  if (state.activePriceRange !== 'All') {
    const priceLabels = {
      'under-2000': 'Under ₹2,000',
      '2000-3500': '₹2,000 – ₹3,500',
      'above-3500': 'Above ₹3,500'
    };
    pills.push({ label: `Price: ${priceLabels[state.activePriceRange] || state.activePriceRange}`, action: "clearSingleFilter('price')" });
  }
  if (state.searchQuery) {
    pills.push({ label: `Search: "${escapeHtmlAttr(state.searchQuery)}"`, action: "clearSingleFilter('search')" });
  }

  if (pills.length === 0) {
    strip.classList.add('hidden');
    strip.classList.remove('flex');
    strip.innerHTML = '';
    return;
  }

  strip.classList.remove('hidden');
  strip.classList.add('flex');
  strip.innerHTML = `
    <span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mr-1">Active Filters:</span>
    ${pills.map(p => `
      <button onclick="${p.action}" class="px-3 py-1 rounded-full bg-neutral-900 text-white text-xs font-medium flex items-center gap-1.5 hover:bg-[#D90429] transition-colors">
        <span>${p.label}</span>
        <i class="fa-solid fa-xmark text-[10px]"></i>
      </button>
    `).join('')}
    <button onclick="resetAllFilters()" class="text-xs font-semibold text-[#D90429] hover:underline ml-2">
      Clear All
    </button>
  `;
}

function clearSingleFilter(type) {
  if (type === 'category') {
    state.activeCategory = 'All';
    const el = document.getElementById('category-filter');
    if (el) el.value = 'All';
  } else if (type === 'size') {
    state.activeSize = 'All';
    const el = document.getElementById('size-filter');
    if (el) el.value = 'All';
  } else if (type === 'price') {
    state.activePriceRange = 'All';
    const el = document.getElementById('price-filter');
    if (el) el.value = 'All';
  } else if (type === 'search') {
    state.searchQuery = '';
    const s1 = document.getElementById('search-input');
    const s2 = document.getElementById('search-input-mobile');
    if (s1) s1.value = '';
    if (s2) s2.value = '';
  }
  state.currentPage = 1;
  applyFiltersAndRender();
}

/**
 * Filter & Sort Engine
 */
function applyFiltersAndRender() {
  const q = state.searchQuery.toLowerCase();

  let list = state.allProducts.filter(item => {
    if (state.activeBrand !== 'All' && (item.brand || '').toLowerCase() !== state.activeBrand.toLowerCase()) {
      return false;
    }
    if (state.activeCategory !== 'All' && item.category !== state.activeCategory) {
      return false;
    }
    if (state.activeGender !== 'All') {
      const g = (item.gender || 'Men').toLowerCase();
      const targetG = state.activeGender.toLowerCase();
      const isGirls = item.girls_collection === 1 || item.girls_collection === true || g === 'women';
      if (targetG === 'men' && isGirls) return false;
      if (targetG === 'women' && !isGirls) return false;
      if (targetG === 'unisex' && !['unisex', 'all'].includes(g)) return false;
    }
    if (state.activeSize !== 'All') {
      const targetSize = String(state.activeSize).toLowerCase().trim();
      const hasMatchedSize = (item.sizes || []).some(sz => {
        const s = String(sz).toLowerCase();
        if (s === targetSize || s.includes(targetSize)) return true;
        const targetDigits = targetSize.replace(/[^0-9.]/g, '');
        if (targetDigits && s.includes(targetDigits)) return true;
        return false;
      });
      if (!hasMatchedSize) return false;
    }
    if (state.activePriceRange !== 'All') {
      const p = Number(item.price) || 0;
      if (state.activePriceRange === 'under-2000' && p >= 2000) return false;
      if (state.activePriceRange === '2000-3500' && (p < 2000 || p > 3500)) return false;
      if (state.activePriceRange === 'above-3500' && p <= 3500) return false;
    }
    if (q) {
      const hay = `${item.name} ${item.brand} ${item.category} ${item.id} ${item.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (state.sortBy === 'price-low') {
    list.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'price-high') {
    list.sort((a, b) => b.price - a.price);
  } else {
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  state.filteredProducts = list;

  // If user selected a specific UK size filter, automatically pre-select that UK size on matching cards
  if (state.activeSize !== 'All') {
    state.filteredProducts.forEach(shoe => {
      if (shoe.sizes && shoe.sizes.includes(state.activeSize)) {
        state.selectedSizes[shoe.id] = state.activeSize;
      }
    });
  }

  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = list.length.toLocaleString('en-IN');

  renderActiveFilterPills();
  renderProductGrid();
  renderPagination();
}

/**
 * Render Product Grid with Multi-Photo Horizontal Hover & Click Sliders
 */
function renderProductGrid() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  // Clear any running hover timers
  Object.keys(state.hoverTimers).forEach(id => {
    clearInterval(state.hoverTimers[id]);
    delete state.hoverTimers[id];
  });

  // Empty Storefront State (when no shoes uploaded yet)
  if (state.allProducts.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 px-6 text-center bg-[#F5F5F7] rounded-2xl border border-neutral-200">
        <div class="w-14 h-14 rounded-full bg-white border border-neutral-200 mx-auto flex items-center justify-center text-neutral-400 mb-4 shadow-sm">
          <i class="fa-solid fa-box-open text-xl"></i>
        </div>
        <h3 class="font-display text-2xl font-bold uppercase text-neutral-900 mb-2">
          ${state.isAdmin ? 'Your Store Catalog is Ready' : 'New Footwear Catalog Updating'}
        </h3>
        <p class="text-neutral-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
          ${state.isAdmin 
            ? 'Click the button below to upload your first shoe with multiple angle photos directly from your computer or phone.' 
            : 'We are updating our online catalog with fresh arrivals from our Delhi store. Message us directly on WhatsApp or use the Custom Shoe Request form below for immediate stock photos and ordering.'}
        </p>
        ${state.isAdmin ? `
          <div class="flex flex-wrap items-center justify-center gap-3">
            <button onclick="openAddProductModal()" class="px-6 py-3 rounded-lg bg-[#D90429] hover:bg-[#B50321] text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-sm transition-colors">
              <i class="fa-solid fa-upload"></i>
              <span>+ Upload First Shoe (Multi-Photo)</span>
            </button>
            <button onclick="openBrandsModal()" class="px-5 py-3 rounded-lg bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-300 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-colors">
              <i class="fa-solid fa-tags text-[#D90429]"></i>
              <span>+ Add / Manage Brands</span>
            </button>
          </div>
        ` : `
          <div class="flex flex-wrap items-center justify-center gap-3">
            <button onclick="openGeneralWhatsApp()" class="px-6 py-3 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-colors">
              <i class="fa-brands fa-whatsapp text-base"></i>
              <span>Chat With Us on WhatsApp</span>
            </button>
            <a href="#request-pair-section" class="px-5 py-3 rounded-lg bg-[#111111] hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-colors">
              <span>Request a Specific Shoe</span>
            </a>
          </div>
        `}
      </div>
    `;
    return;
  }

  // Filtered Empty State
  if (state.filteredProducts.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-14 px-4 text-center bg-[#F5F5F7] rounded-xl border border-neutral-200">
        <p class="text-neutral-700 font-semibold text-sm mb-2">No footwear matched your selected filter.</p>
        <p class="text-neutral-500 text-xs mb-4">Try resetting filters or request this exact pair directly on WhatsApp.</p>
        <div class="flex items-center justify-center gap-3">
          <button onclick="resetAllFilters()" class="px-5 py-2.5 rounded-lg bg-[#111111] text-white text-xs font-bold uppercase tracking-wider">
            Show All Footwear
          </button>
          <a href="#request-pair-section" class="px-5 py-2.5 rounded-lg bg-[#25D366] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <i class="fa-brands fa-whatsapp"></i> Ask on WhatsApp
          </a>
        </div>
      </div>
    `;
    return;
  }

  const start = (state.currentPage - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const pageItems = state.filteredProducts.slice(start, end);

  grid.innerHTML = pageItems.map(shoe => {
    const images = (shoe.images && shoe.images.length > 0) ? shoe.images : ['assets/logo.jpg'];
    const totalImgs = images.length;
    const currentImgIdx = (state.activeCardImageIdx[shoe.id] || 0) % totalImgs;
    const activeSize = state.selectedSizes[shoe.id] || '';
    const hasDiscount = shoe.mrp && shoe.mrp > shoe.price;
    const discountPct = hasDiscount ? Math.round(((shoe.mrp - shoe.price) / shoe.mrp) * 100) : 0;

    return `
      <article class="product-card rounded-xl overflow-hidden flex flex-col group" data-shoe-id="${shoe.id}">
        
        <!-- Dedicated Card Top Bar (Separates Brand Heading, Photo Counter & Admin Actions from the Photo) -->
        <div class="px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-white border-b border-neutral-100 flex items-center justify-between gap-1 sm:gap-2">
          <div class="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <span class="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded bg-[#F5F5F7] border border-neutral-200 text-neutral-900 font-bold text-[9px] sm:text-[10px] uppercase tracking-wider truncate">
              ${escapeHtmlAttr(shoe.brand)}
            </span>
            ${shoe.gender && shoe.gender !== 'Unisex' ? `
              <span class="px-1 sm:px-1.5 py-0.5 rounded ${shoe.gender === 'Women' ? 'bg-pink-50 text-pink-700 border-pink-200' : 'bg-blue-50 text-blue-700 border-blue-200'} border font-bold text-[8px] sm:text-[9px] uppercase tracking-wider shrink-0">
                ${escapeHtmlAttr(shoe.gender)}
              </span>
            ` : ''}
            ${totalImgs > 1 ? `
              <span id="photo-badge-${shoe.id}" class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-[#111111] text-white font-semibold text-[9px] sm:text-[10px] tracking-wide flex items-center gap-1 shrink-0">
                <i class="fa-regular fa-images text-[8px] sm:text-[9px]"></i>
                <span id="photo-counter-${shoe.id}">1/${totalImgs}</span>
              </span>
            ` : ''}
          </div>

          ${state.isAdmin ? `
            <div class="flex items-center gap-1 shrink-0">
              <button 
                type="button" 
                onclick="openEditProductModal(event, '${shoe.id}')" 
                title="Edit Shoe & Photos"
                class="w-6 sm:w-7 h-6 sm:h-7 rounded-full bg-[#F5F5F7] hover:bg-neutral-900 text-neutral-700 hover:text-white border border-neutral-200 flex items-center justify-center text-[10px] sm:text-[11px] transition-colors">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button 
                type="button" 
                onclick="handleDeleteProduct(event, '${shoe.id}')" 
                title="Delete Shoe"
                class="w-6 sm:w-7 h-6 sm:h-7 rounded-full bg-[#F5F5F7] hover:bg-[#D90429] text-[#D90429] hover:text-white border border-neutral-200 flex items-center justify-center text-[10px] sm:text-[11px] transition-colors">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          ` : `
            <span class="text-[9px] sm:text-[10px] font-medium text-neutral-400 truncate">${escapeHtmlAttr(shoe.gender && shoe.gender !== 'Unisex' ? `${shoe.gender} • ` : '')}${escapeHtmlAttr(shoe.category || 'Footwear')}</span>
          `}
        </div>

        <!-- Multi-Photo Horizontal Image Slider Area (Uniform Square Aspect Ratio + Full Photo View) -->
        <div 
          class="shoe-photo-box cursor-pointer"
          onmouseenter="handleCardMouseEnter('${shoe.id}')"
          onmousemove="handleCardMouseMove(event, '${shoe.id}')"
          onmouseleave="handleCardMouseLeave('${shoe.id}')"
          ontouchstart="handleCardTouchStart(event, '${shoe.id}')"
          ontouchend="handleCardTouchEnd(event, '${shoe.id}')"
          onclick="openProductModal('${shoe.id}')"
        >
          <!-- Horizontal Sliding Track -->
          <div 
            id="slider-track-${shoe.id}" 
            class="card-slider-track" 
            style="transform: translateX(-${currentImgIdx * 100}%);"
          >
            ${images.map((imgSrc, idx) => `
              <div class="card-slider-slide">
                <img 
                  src="${imgSrc}" 
                  alt="${escapeHtmlAttr(shoe.name)} - Angle ${idx + 1}" 
                  loading="lazy"
                  class="pointer-events-none"
                />
              </div>
            `).join('')}
          </div>

          <!-- Multi-Photo Left/Right Click Arrows & Bottom Slide Indicator Bars -->
          ${totalImgs > 1 ? `
            <button 
              type="button"
              onclick="stepCardImage(event, '${shoe.id}', -1)" 
              aria-label="Previous angle"
              class="card-slider-arrow absolute left-1 sm:left-2.5 top-1/2 -translate-y-1/2 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-white/95 hover:bg-[#111111] text-neutral-900 hover:text-white shadow-md border border-neutral-200 flex items-center justify-center text-[10px] sm:text-xs transition-all z-10">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button 
              type="button"
              onclick="stepCardImage(event, '${shoe.id}', 1)" 
              aria-label="Next angle"
              class="card-slider-arrow absolute right-1 sm:right-2.5 top-1/2 -translate-y-1/2 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-white/95 hover:bg-[#111111] text-neutral-900 hover:text-white shadow-md border border-neutral-200 flex items-center justify-center text-[10px] sm:text-xs transition-all z-10">
              <i class="fa-solid fa-chevron-right"></i>
            </button>

            <!-- Bottom Segmented Progress Bars -->
            <div class="absolute bottom-2 inset-x-2 sm:bottom-2.5 sm:inset-x-3 flex items-center gap-1 sm:gap-1.5 z-10">
              ${images.map((_, idx) => `
                <button 
                  type="button"
                  onclick="setCardImage(event, '${shoe.id}', ${idx})" 
                  id="dot-${shoe.id}-${idx}"
                  aria-label="View angle ${idx + 1}"
                  class="h-1 flex-1 rounded-full transition-all ${idx === currentImgIdx ? 'bg-[#D90429]' : 'bg-black/25 hover:bg-black/50'}">
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Card Body -->
        <div class="p-2.5 sm:p-4 flex-1 flex flex-col justify-between bg-white border-t border-neutral-100">
          <div>
            <!-- Title -->
            <h3 
              onclick="openProductModal('${shoe.id}')" 
              class="font-bold text-neutral-900 text-xs sm:text-sm leading-snug line-clamp-1 cursor-pointer hover:text-[#D90429] transition-colors"
              title="${escapeHtmlAttr(shoe.name)}">
              ${escapeHtmlAttr(shoe.name)}
            </h3>

            <!-- Price Row -->
            <div class="mt-1 sm:mt-2 flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
              <span class="font-display font-bold text-base sm:text-lg text-neutral-900">
                ₹${Number(shoe.price).toLocaleString('en-IN')}
              </span>
              ${hasDiscount ? `
                <span class="text-[10px] sm:text-xs text-neutral-400 line-through">
                  ₹${Number(shoe.mrp).toLocaleString('en-IN')}
                </span>
                <span class="text-[9px] sm:text-[11px] font-bold text-[#D90429]">
                  (${discountPct}% OFF)
                </span>
              ` : ''}
            </div>

            <!-- Interactive UK Size Selector (No Size Pre-Selected by Default, Smooth Horizontal Scroll on Mobile) -->
            <div id="size-box-${shoe.id}" class="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-neutral-100 rounded-lg transition-all">
              <div class="flex items-center justify-between text-[10px] sm:text-[11px] mb-1">
                <span class="text-neutral-500 font-semibold uppercase tracking-wider">Size (UK)</span>
                <span id="size-label-${shoe.id}" class="font-bold ${activeSize ? 'text-[#D90429]' : 'text-neutral-400'}">${activeSize ? activeSize.replace('UK ', 'UK ') : 'Select'}</span>
              </div>
              <div class="flex flex-nowrap sm:flex-wrap gap-1 overflow-x-auto no-scrollbar touch-scroll py-0.5">
                ${(shoe.sizes || []).map(sz => `
                  <button 
                    type="button"
                    onclick="selectCardSize('${shoe.id}', '${sz}')"
                    id="size-btn-${shoe.id}-${sz.replace(/\s+/g, '')}"
                    class="size-chip px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] shrink-0 min-w-[26px] text-center ${activeSize === sz ? 'active' : ''}">
                    ${sz.replace('UK ', '')}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Direct WhatsApp Order Action Row (1-Click Order Now + Shortlist to WhatsApp Bag) -->
          <div class="mt-3 sm:mt-4 pt-1 flex items-center gap-1.5 sm:gap-2">
            <button 
              type="button"
              onclick="orderOnWhatsApp('${shoe.id}')"
              class="flex-1 py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg bg-[#111111] hover:bg-[#D90429] text-white font-bold text-[11px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 transition-colors">
              <i class="fa-brands fa-whatsapp text-sm sm:text-base text-emerald-400"></i>
              <span class="truncate">Order Now</span>
            </button>
            <button 
              type="button"
              onclick="addToOrderBag('${shoe.id}')"
              title="Add to WhatsApp Bag to order multiple shoes together"
              class="py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg bg-[#F5F5F7] hover:bg-neutral-200 text-neutral-800 border border-neutral-200 font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 transition-colors shrink-0">
              <i class="fa-solid fa-plus text-[9px] sm:text-[10px] text-[#D90429]"></i>
              <span>Bag</span>
            </button>
          </div>
        </div>

      </article>
    `;
  }).join('');
}

/**
 * Multi-Photo Card Slider Controls (Hover Auto-Slide, Cursor Scrub, Click Arrows & Touch Swipe)
 */
function updateCardSliderDOM(productId, newIdx) {
  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe || !shoe.images || shoe.images.length <= 1) return;

  const total = shoe.images.length;
  const idx = ((newIdx % total) + total) % total;
  state.activeCardImageIdx[productId] = idx;

  const trackEl = document.getElementById(`slider-track-${productId}`);
  if (trackEl) {
    trackEl.style.transform = `translateX(-${idx * 100}%)`;
  }

  const counterEl = document.getElementById(`photo-counter-${productId}`);
  if (counterEl) {
    counterEl.textContent = `${idx + 1}/${total}`;
  }

  shoe.images.forEach((_, i) => {
    const dot = document.getElementById(`dot-${productId}-${i}`);
    if (dot) {
      dot.className = `h-1 flex-1 rounded-full transition-all ${i === idx ? 'bg-[#D90429]' : 'bg-black/25 hover:bg-black/50'}`;
    }
  });
}

function handleCardMouseEnter(productId) {
  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe || !shoe.images || shoe.images.length <= 1) return;

  if ((state.activeCardImageIdx[productId] || 0) === 0) {
    updateCardSliderDOM(productId, 1);
  }

  clearInterval(state.hoverTimers[productId]);
  state.hoverTimers[productId] = setInterval(() => {
    const lastScrub = state.lastHoverScrubTs[productId] || 0;
    if (Date.now() - lastScrub > 900) {
      const curr = state.activeCardImageIdx[productId] || 0;
      updateCardSliderDOM(productId, curr + 1);
    }
  }, 1300);
}

function handleCardMouseMove(event, productId) {
  if (event.target.closest('button')) return;

  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe || !shoe.images || shoe.images.length <= 1) return;

  const rect = event.currentTarget.getBoundingClientRect();
  if (!rect.width) return;

  const relX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const targetIdx = Math.min(shoe.images.length - 1, Math.floor(relX * shoe.images.length));

  state.lastHoverScrubTs[productId] = Date.now();
  if (state.activeCardImageIdx[productId] !== targetIdx) {
    updateCardSliderDOM(productId, targetIdx);
  }
}

function handleCardMouseLeave(productId) {
  clearInterval(state.hoverTimers[productId]);
  delete state.hoverTimers[productId];
  updateCardSliderDOM(productId, 0);
}

function stepCardImage(event, productId, direction) {
  if (event) event.stopPropagation();
  clearInterval(state.hoverTimers[productId]);
  state.lastHoverScrubTs[productId] = Date.now();
  const curr = state.activeCardImageIdx[productId] || 0;
  updateCardSliderDOM(productId, curr + direction);
}

function setCardImage(event, productId, index) {
  if (event) event.stopPropagation();
  clearInterval(state.hoverTimers[productId]);
  state.lastHoverScrubTs[productId] = Date.now();
  updateCardSliderDOM(productId, index);
}

function handleCardTouchStart(event, productId) {
  if (event.touches && event.touches.length > 0) {
    state.touchStartX[productId] = event.touches[0].clientX;
  }
}

function handleCardTouchEnd(event, productId) {
  const startX = state.touchStartX[productId];
  if (startX === undefined || !event.changedTouches || event.changedTouches.length === 0) return;
  const endX = event.changedTouches[0].clientX;
  const diff = startX - endX;
  delete state.touchStartX[productId];

  if (Math.abs(diff) > 35) {
    const curr = state.activeCardImageIdx[productId] || 0;
    updateCardSliderDOM(productId, diff > 0 ? curr + 1 : curr - 1);
  }
}

/**
 * Select Size on Card (Clicking again deselects; no size is pre-selected by default)
 */
function selectCardSize(productId, size) {
  if (state.selectedSizes[productId] === size) {
    delete state.selectedSizes[productId];
  } else {
    state.selectedSizes[productId] = size;
  }

  const chosen = state.selectedSizes[productId] || '';
  const labelEl = document.getElementById(`size-label-${productId}`);
  if (labelEl) {
    labelEl.textContent = chosen || 'None selected';
    labelEl.className = `font-bold ${chosen ? 'text-[#D90429]' : 'text-neutral-400'}`;
  }

  const sizeBox = document.getElementById(`size-box-${productId}`);
  if (sizeBox) {
    sizeBox.classList.remove('ring-2', 'ring-[#D90429]', 'bg-red-50/40', 'p-2');
  }

  const shoe = state.allProducts.find(p => p.id === productId);
  if (shoe && shoe.sizes) {
    shoe.sizes.forEach(sz => {
      const btn = document.getElementById(`size-btn-${productId}-${sz.replace(/\s+/g, '')}`);
      if (btn) {
        if (sz === chosen) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
  }
}

function highlightMissingSize(productId, fromModal = false) {
  showToast('Please select your UK size first before ordering.');
  const targetId = fromModal ? `modal-size-box-${productId}` : `size-box-${productId}`;
  const box = document.getElementById(targetId);
  if (box) {
    box.classList.add('ring-2', 'ring-[#D90429]', 'bg-red-50/40', 'p-2');
    setTimeout(() => {
      box.classList.remove('ring-2', 'ring-[#D90429]', 'bg-red-50/40', 'p-2');
    }, 2200);
  }
}

/**
 * ================= 100% DIRECT WHATSAPP ORDERING & MULTI-PAIR WHATSAPP BAG =================
 */
function orderOnWhatsApp(productId, fromModal = false) {
  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe) return;

  const selectedSize = state.selectedSizes[productId];
  if (!selectedSize) {
    highlightMissingSize(productId, fromModal);
    return;
  }

  const formattedPrice = `₹${Number(shoe.price).toLocaleString('en-IN')}`;

  const message = [
    `Hello FixMyKicks Delhi, I would like to place an order:`,
    ``,
    `Shoe: *${shoe.name}*`,
    `Brand: ${shoe.brand}`,
    `Selected Size: *${selectedSize}*`,
    `Price: *${formattedPrice}*`,
    `Product Code: ${shoe.id}`,
    ``,
    `Please confirm availability and share delivery details.`
  ].join('\n');

  const phone = state.whatsappNumber.replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  showToast(`Opening WhatsApp for ${shoe.name} (${selectedSize})...`);
  window.open(waUrl, '_blank');

  if (fromModal) closeProductModal();
}

/**
 * Request Live Photo / Video of a specific shoe on WhatsApp
 */
function requestLiveVideoOnWhatsApp(productId) {
  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe) return;

  const selectedSize = state.selectedSizes[productId] || 'To be confirmed';
  const message = [
    `Hello FixMyKicks Delhi! Can you please share live photos/video of this shoe on WhatsApp?`,
    ``,
    `Shoe: *${shoe.name}* (${shoe.brand})`,
    `Size Needed: *${selectedSize}*`,
    `Product Code: ${shoe.id}`
  ].join('\n');

  const phone = state.whatsappNumber.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}

/**
 * Share shoe with a friend on WhatsApp
 */
function shareShoeOnWhatsApp(productId) {
  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe) return;

  const formattedPrice = `₹${Number(shoe.price).toLocaleString('en-IN')}`;
  const text = `Check out *${shoe.name}* (${shoe.brand}) at FixMyKicks Delhi — ${formattedPrice} (Code: ${shoe.id})`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/**
 * Custom Shoe Request Form Handler -> Sends directly to WhatsApp
 */
function handleCustomShoeRequest(e) {
  e.preventDefault();
  const brand = (document.getElementById('req-shoe-brand')?.value || '').trim();
  const size = (document.getElementById('req-shoe-size')?.value || '').trim();
  const model = (document.getElementById('req-shoe-model')?.value || '').trim();

  if (!brand || !model) return;
  if (!size) {
    showToast('Please select your UK size in the request form.');
    return;
  }

  const message = [
    `Hello FixMyKicks Delhi! I am looking for a specific pair:`,
    ``,
    `Brand: *${brand}*`,
    `Model / Colorway: *${model}*`,
    `My Size: *${size}*`,
    ``,
    `Please let me know if this pair is available and share photos & price.`
  ].join('\n');

  const phone = state.whatsappNumber.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}

/**
 * Multi-Pair WhatsApp Order Bag (No Payment Gateway — Sends Combined List to WhatsApp)
 */
function saveOrderBag() {
  localStorage.setItem('fmk_whatsapp_bag', JSON.stringify(state.orderBag));
  renderOrderBagUI();
}

function addToOrderBag(productId, fromModal = false) {
  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe) return;

  const size = state.selectedSizes[productId];
  if (!size) {
    highlightMissingSize(productId, fromModal);
    return;
  }

  const key = `${shoe.id}__${size}`;
  const existing = state.orderBag.find(item => item.key === key);

  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
  } else {
    state.orderBag.push({
      key,
      id: shoe.id,
      name: shoe.name,
      brand: shoe.brand,
      price: Number(shoe.price) || 0,
      size,
      qty: 1,
      image: (shoe.images && shoe.images[0]) ? shoe.images[0] : 'assets/logo.jpg'
    });
  }

  saveOrderBag();
  showToast(`Added "${shoe.name}" (${size}) to your WhatsApp Bag!`);
}

function removeFromOrderBag(key) {
  state.orderBag = state.orderBag.filter(item => item.key !== key);
  saveOrderBag();
}

function renderOrderBagUI() {
  const countEl = document.getElementById('order-bag-count');
  const itemsEl = document.getElementById('order-bag-items');
  const totalEl = document.getElementById('order-bag-total');

  const totalCount = state.orderBag.reduce((sum, i) => sum + (i.qty || 1), 0);
  const totalAmount = state.orderBag.reduce((sum, i) => sum + (Number(i.price) * (i.qty || 1)), 0);

  if (countEl) countEl.textContent = totalCount;
  if (totalEl) totalEl.textContent = `₹${totalAmount.toLocaleString('en-IN')}`;

  if (!itemsEl) return;

  if (state.orderBag.length === 0) {
    itemsEl.innerHTML = `
      <div class="py-16 px-4 text-center">
        <div class="w-12 h-12 rounded-full bg-[#F5F5F7] mx-auto flex items-center justify-center text-neutral-400 mb-3">
          <i class="fa-solid fa-bag-shopping text-lg"></i>
        </div>
        <p class="font-bold text-sm text-neutral-900 mb-1">Your WhatsApp Bag is Empty</p>
        <p class="text-xs text-neutral-500 leading-relaxed">
          Select your UK size and click <strong>+ Bag</strong> on any shoe card to shortlist multiple pairs and send them together in a single WhatsApp message.
        </p>
      </div>
    `;
    return;
  }

  itemsEl.innerHTML = state.orderBag.map(item => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F7] border border-neutral-200">
      <div class="w-16 h-16 rounded-lg overflow-hidden bg-white border border-neutral-200 shrink-0 p-1">
        <img src="${item.image}" alt="${escapeHtmlAttr(item.name)}" class="uniform-thumb-img" />
      </div>
      <div class="flex-1 min-w-0">
        <span class="text-[10px] font-bold uppercase tracking-wider text-[#D90429] block">${escapeHtmlAttr(item.brand)}</span>
        <h4 class="font-bold text-xs text-neutral-900 truncate">${escapeHtmlAttr(item.name)}</h4>
        <div class="flex items-center gap-2 mt-1 text-xs">
          <span class="px-2 py-0.5 rounded bg-white border border-neutral-200 font-semibold text-[11px]">${escapeHtmlAttr(item.size)}</span>
          <span class="font-bold text-neutral-900">₹${Number(item.price).toLocaleString('en-IN')}</span>
          ${item.qty > 1 ? `<span class="text-neutral-500 text-[11px]">× ${item.qty}</span>` : ''}
        </div>
      </div>
      <button 
        onclick="removeFromOrderBag('${escapeHtmlAttr(item.key)}')" 
        class="w-7 h-7 rounded-full hover:bg-red-50 text-neutral-400 hover:text-[#D90429] flex items-center justify-center text-xs transition-colors"
        title="Remove">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `).join('');
}

function openOrderBagDrawer() {
  renderOrderBagUI();
  const drawer = document.getElementById('order-bag-drawer');
  if (drawer) drawer.classList.remove('hidden');
}

function closeOrderBagDrawer() {
  const drawer = document.getElementById('order-bag-drawer');
  if (drawer) drawer.classList.add('hidden');
}

function sendOrderBagToWhatsApp() {
  if (state.orderBag.length === 0) {
    showToast('Add at least one shoe to your WhatsApp Bag first.');
    return;
  }

  const totalAmount = state.orderBag.reduce((sum, i) => sum + (Number(i.price) * (i.qty || 1)), 0);
  const lines = [
    `Hello FixMyKicks Delhi, I would like to order the following ${state.orderBag.length === 1 ? 'pair' : 'pairs'}:`,
    ``
  ];

  state.orderBag.forEach((item, idx) => {
    lines.push(
      `${idx + 1}. *${item.name}* (${item.brand})`,
      `   Size: *${item.size}* | Qty: ${item.qty || 1} | Price: ₹${Number(item.price).toLocaleString('en-IN')} | Code: ${item.id}`
    );
  });

  lines.push(
    ``,
    `*Total Order Value: ₹${totalAmount.toLocaleString('en-IN')}*`,
    ``,
    `Please confirm availability and share delivery details.`
  );

  const phone = state.whatsappNumber.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

function openGeneralWhatsApp(targetNumber) {
  const chosen = targetNumber || state.whatsappNumber;
  const phone = chosen.replace(/[^0-9]/g, '');
  const msg = `Hello FixMyKicks Delhi! I am visiting your website and would like to enquire about footwear availability.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function openInstagram() {
  window.open(state.instagramUrl || 'https://www.instagram.com/fixmykickss.in', '_blank');
}

function openTelegram() {
  window.open(state.telegramUrl || 'https://t.me/yashaswani77', '_blank');
}

/**
 * Pagination
 */
function renderPagination() {
  const container = document.getElementById('pagination-container');
  if (!container) return;

  const totalPages = Math.ceil(state.filteredProducts.length / state.itemsPerPage);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `<div class="flex items-center justify-center gap-2">`;
  html += `
    <button 
      onclick="goToPage(${state.currentPage - 1})" 
      ${state.currentPage === 1 ? 'disabled' : ''}
      class="px-3.5 py-2 rounded-lg border border-neutral-200 text-xs font-semibold ${state.currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:border-neutral-900'}">
      Prev
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
      html += `
        <button 
          onclick="goToPage(${i})" 
          class="w-9 h-9 rounded-lg text-xs font-bold ${i === state.currentPage ? 'bg-[#111111] text-white' : 'border border-neutral-200 text-neutral-700 hover:border-neutral-900'}">
          ${i}
        </button>
      `;
    } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
      html += `<span class="text-neutral-400 text-xs px-1">...</span>`;
    }
  }

  html += `
    <button 
      onclick="goToPage(${state.currentPage + 1})" 
      ${state.currentPage === totalPages ? 'disabled' : ''}
      class="px-3.5 py-2 rounded-lg border border-neutral-200 text-xs font-semibold ${state.currentPage === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:border-neutral-900'}">
      Next
    </button>
  `;
  html += `</div>`;
  container.innerHTML = html;
}

function goToPage(page) {
  const totalPages = Math.ceil(state.filteredProducts.length / state.itemsPerPage);
  if (page < 1 || page > totalPages) return;
  state.currentPage = page;
  renderProductGrid();
  renderPagination();
  const catalogEl = document.getElementById('catalog-section');
  if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Product Detail & Multi-Photo Slider Modal
 */
function openProductModal(productId) {
  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe) return;

  state.modalProduct = shoe;
  state.modalImageIndex = state.activeCardImageIdx[productId] || 0;

  const modal = document.getElementById('product-modal');
  const body = document.getElementById('modal-body');
  if (!modal || !body) return;

  const images = (shoe.images && shoe.images.length > 0) ? shoe.images : ['assets/logo.jpg'];
  const activeSize = state.selectedSizes[shoe.id] || '';
  const hasDiscount = shoe.mrp && shoe.mrp > shoe.price;
  const discountPct = hasDiscount ? Math.round(((shoe.mrp - shoe.price) / shoe.mrp) * 100) : 0;

  body.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-8 items-start">
      
      <!-- Left: Multi-Photo Horizontal Slider & Thumbnail Strip (Uniform Aspect Ratio + Full Photo View) -->
      <div class="md:col-span-7 space-y-2.5 sm:space-y-3">
        <div 
          class="modal-photo-box rounded-xl border border-neutral-200"
          ontouchstart="handleModalTouchStart(event)"
          ontouchend="handleModalTouchEnd(event)"
        >
          <div 
            id="modal-slider-track" 
            class="card-slider-track" 
            style="transform: translateX(-${state.modalImageIndex * 100}%);"
          >
            ${images.map((img, i) => `
              <div class="card-slider-slide">
                <img src="${img}" alt="${escapeHtmlAttr(shoe.name)} - Photo ${i + 1}" />
              </div>
            `).join('')}
          </div>

          ${images.length > 1 ? `
            <button onclick="stepModalImage(-1)" aria-label="Previous image" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 sm:w-10 h-8 sm:h-10 rounded-full bg-white/95 hover:bg-[#111111] text-neutral-900 hover:text-white shadow-md border border-neutral-200 flex items-center justify-center text-xs transition-colors z-10">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button onclick="stepModalImage(1)" aria-label="Next image" class="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 sm:w-10 h-8 sm:h-10 rounded-full bg-white/95 hover:bg-[#111111] text-neutral-900 hover:text-white shadow-md border border-neutral-200 flex items-center justify-center text-xs transition-colors z-10">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <div class="absolute bottom-2.5 right-2.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded bg-black/75 text-white text-[10px] sm:text-xs font-semibold z-10">
              <span id="modal-photo-counter">${state.modalImageIndex + 1} / ${images.length}</span>
            </div>
          ` : ''}
        </div>

        ${images.length > 1 ? `
          <div class="flex items-center gap-2 overflow-x-auto no-scrollbar touch-scroll pb-1">
            ${images.map((img, idx) => `
              <button 
                type="button"
                onclick="setModalImage(${idx})"
                id="modal-thumb-${idx}"
                class="w-14 sm:w-16 h-14 sm:h-16 rounded-lg overflow-hidden border-2 shrink-0 p-1 bg-white transition-all ${idx === state.modalImageIndex ? 'border-[#D90429] scale-105' : 'border-neutral-200 opacity-70 hover:opacity-100'}">
                <img src="${img}" class="uniform-thumb-img" />
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Right: Details, Size Selection & Direct WhatsApp Actions -->
      <div class="md:col-span-5 flex flex-col justify-between space-y-4 sm:space-y-5">
        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-neutral-500 font-semibold uppercase tracking-wider">
              <span class="text-[#D90429] font-bold">${escapeHtmlAttr(shoe.brand)}</span>
              <span>•</span>
              <span class="font-bold text-neutral-800">${escapeHtmlAttr(shoe.gender || 'Unisex')}</span>
              <span>•</span>
              <span>${escapeHtmlAttr(shoe.category || 'Footwear')}</span>
            </div>
            <button 
              type="button"
              onclick="shareShoeOnWhatsApp('${shoe.id}')" 
              class="text-xs font-semibold text-neutral-500 hover:text-[#111111] flex items-center gap-1 shrink-0"
              title="Share on WhatsApp">
              <i class="fa-solid fa-share-nodes"></i> Share
            </button>
          </div>

          <h2 class="font-display text-xl sm:text-3xl font-bold text-neutral-900 leading-tight">
            ${escapeHtmlAttr(shoe.name)}
          </h2>
          <p class="text-[11px] sm:text-xs text-neutral-400 font-mono mt-1">Product Code: ${shoe.id}</p>

          <!-- Price Box -->
          <div class="mt-3 sm:mt-4 pb-3 sm:pb-4 border-b border-neutral-200 flex items-baseline gap-2.5 sm:gap-3">
            <span class="font-display text-2xl sm:text-3xl font-bold text-neutral-900">
              ₹${Number(shoe.price).toLocaleString('en-IN')}
            </span>
            ${hasDiscount ? `
              <span class="text-xs sm:text-sm text-neutral-400 line-through">
                ₹${Number(shoe.mrp).toLocaleString('en-IN')}
              </span>
              <span class="text-[11px] sm:text-xs font-bold text-[#D90429]">
                (${discountPct}% OFF)
              </span>
            ` : ''}
          </div>

          ${shoe.description ? `
            <p class="mt-3 sm:mt-4 text-neutral-600 text-xs leading-relaxed">
              ${escapeHtmlAttr(shoe.description)}
            </p>
          ` : ''}

          <!-- Size Selection (No Size Pre-Selected by Default) -->
          <div id="modal-size-box-${shoe.id}" class="mt-4 sm:mt-5 rounded-lg transition-all">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-neutral-800">
                Select UK Size: <span id="modal-selected-size" class="${activeSize ? 'text-[#D90429]' : 'text-neutral-400'}">${activeSize || 'None selected'}</span>
              </span>
              <button onclick="openSizeChartModal()" class="text-xs text-neutral-500 hover:text-neutral-900 underline">
                UK Size Guide
              </button>
            </div>

            <div class="grid grid-cols-4 gap-1.5 sm:gap-2">
              ${(shoe.sizes || []).map(sz => `
                <button 
                  type="button"
                  onclick="selectModalSize('${shoe.id}', '${sz}')"
                  id="modal-size-${sz.replace(/\s+/g, '')}"
                  class="size-chip py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg text-xs ${activeSize === sz ? 'active' : ''}">
                  ${sz}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Store Dispatch & WhatsApp Live Check Info -->
          <div class="mt-4 sm:mt-5 p-3 rounded-xl bg-[#F5F5F7] border border-neutral-200 space-y-1.5 sm:space-y-2 text-[11px] sm:text-xs text-neutral-600">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-location-dot text-[#D90429] w-4 text-center"></i>
              <span>Dispatched directly from our <strong>Delhi Store</strong></span>
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-truck-fast text-[#D90429] w-4 text-center"></i>
              <span>All India Express Courier Delivery (3–5 Days)</span>
            </div>
          </div>
        </div>

        <!-- 100% WhatsApp Action Buttons (No Payment Gateway) -->
        <div class="pt-2 space-y-2">
          <div class="flex items-center gap-2">
            <button 
              type="button"
              onclick="orderOnWhatsApp('${shoe.id}', true)"
              class="flex-1 py-3 sm:py-3.5 px-4 sm:px-5 rounded-xl bg-[#111111] hover:bg-[#D90429] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-colors">
              <i class="fa-brands fa-whatsapp text-base sm:text-lg text-emerald-400"></i>
              <span>Order Now on WhatsApp</span>
            </button>
            <button 
              type="button"
              onclick="addToOrderBag('${shoe.id}', true)"
              class="py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl bg-[#F5F5F7] hover:bg-neutral-200 text-neutral-900 border border-neutral-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors shrink-0">
              <i class="fa-solid fa-plus text-[#D90429]"></i>
              <span class="hidden sm:inline">Add to Bag</span>
              <span class="sm:hidden">Bag</span>
            </button>
          </div>

          <button 
            type="button"
            onclick="requestLiveVideoOnWhatsApp('${shoe.id}')"
            class="w-full py-2.5 px-3 sm:px-4 rounded-xl bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors">
            <i class="fa-solid fa-video text-[#D90429]"></i>
            <span>Request Live Photo / Video on WhatsApp</span>
          </button>
        </div>
      </div>

    </div>
  `;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function handleModalTouchStart(event) {
  if (event.touches && event.touches.length > 0) {
    state.modalTouchStartX = event.touches[0].clientX;
  }
}

function handleModalTouchEnd(event) {
  if (state.modalTouchStartX === undefined || !event.changedTouches || event.changedTouches.length === 0) return;
  const endX = event.changedTouches[0].clientX;
  const diff = state.modalTouchStartX - endX;
  delete state.modalTouchStartX;
  if (Math.abs(diff) > 35) {
    stepModalImage(diff > 0 ? 1 : -1);
  }
}

function closeProductModal() {
  const modal = document.getElementById('product-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function setModalImage(index) {
  if (!state.modalProduct) return;
  const images = (state.modalProduct.images && state.modalProduct.images.length > 0)
    ? state.modalProduct.images
    : ['assets/logo.jpg'];

  state.modalImageIndex = ((index % images.length) + images.length) % images.length;

  const track = document.getElementById('modal-slider-track');
  if (track) {
    track.style.transform = `translateX(-${state.modalImageIndex * 100}%)`;
  }

  const counter = document.getElementById('modal-photo-counter');
  if (counter) {
    counter.textContent = `${state.modalImageIndex + 1} / ${images.length}`;
  }

  images.forEach((_, idx) => {
    const thumb = document.getElementById(`modal-thumb-${idx}`);
    if (thumb) {
      thumb.className = `w-14 sm:w-16 h-14 sm:h-16 rounded-lg overflow-hidden border-2 shrink-0 p-1 bg-white transition-all ${idx === state.modalImageIndex ? 'border-[#D90429] scale-105' : 'border-neutral-200 opacity-70 hover:opacity-100'}`;
    }
  });
}

function stepModalImage(dir) {
  if (!state.modalProduct) return;
  setModalImage(state.modalImageIndex + dir);
}

function selectModalSize(productId, size) {
  selectCardSize(productId, size);
  const chosen = state.selectedSizes[productId] || '';
  const label = document.getElementById('modal-selected-size');
  if (label) {
    label.textContent = chosen || 'None selected';
    label.className = chosen ? 'text-[#D90429]' : 'text-neutral-400';
  }

  const modalSizeBox = document.getElementById(`modal-size-box-${productId}`);
  if (modalSizeBox) {
    modalSizeBox.classList.remove('ring-2', 'ring-[#D90429]', 'bg-red-50/40', 'p-2');
  }

  if (state.modalProduct && state.modalProduct.sizes) {
    state.modalProduct.sizes.forEach(sz => {
      const btn = document.getElementById(`modal-size-${sz.replace(/\s+/g, '')}`);
      if (btn) {
        if (sz === chosen) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
  }
}

/**
 * ================= ADMIN BRAND MANAGEMENT =================
 */
function openBrandsModal() {
  if (!state.isAdmin) {
    openAdminPortal();
    return;
  }
  renderBrandsUI();
  const modal = document.getElementById('brands-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeBrandsModal() {
  const modal = document.getElementById('brands-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleAddBrandFromModal(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  const input = document.getElementById('modal-new-brand-name');
  const name = (input ? input.value : '').trim();
  if (!name) return;

  state.brands = await window.BrandsAPI.add(name);
  if (input) input.value = '';
  renderBrandsUI(name);
  showToast(`Brand "${name}" added to your store!`);
}

async function handleDeleteBrand(brandName) {
  if (!state.isAdmin) return;
  if (!confirm(`Remove "${brandName}" from the brand navigation list?`)) return;

  state.brands = await window.BrandsAPI.remove(brandName);
  if (state.activeBrand.toLowerCase() === brandName.toLowerCase()) {
    state.activeBrand = 'All';
  }
  renderBrandsUI();
  applyFiltersAndRender();
  showToast(`Brand "${brandName}" removed.`);
}

function toggleQuickAddBrandBox() {
  const box = document.getElementById('quick-add-brand-box');
  const input = document.getElementById('quick-new-brand-input');
  if (!box) return;
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden') && input) {
    input.focus();
  }
}

async function handleQuickAddBrand() {
  if (!state.isAdmin) return;
  const input = document.getElementById('quick-new-brand-input');
  const box = document.getElementById('quick-add-brand-box');
  const name = (input ? input.value : '').trim();
  if (!name) {
    showToast('Please enter a brand name.');
    return;
  }

  state.brands = await window.BrandsAPI.add(name);
  renderBrandsUI(name);

  const select = document.getElementById('new-shoe-brand');
  if (select) select.value = name;
  if (input) input.value = '';
  if (box) box.classList.add('hidden');

  showToast(`Brand "${name}" added and selected!`);
}

/**
 * ================= ADMIN SYSTEM MULTI-PHOTO UPLOAD & INVENTORY =================
 */
function openAdminPortal() {
  if (state.isAdmin) {
    openAddProductModal();
  } else {
    const modal = document.getElementById('admin-login-modal');
    const err = document.getElementById('admin-login-error');
    const pinInput = document.getElementById('admin-pin-input');
    if (err) err.classList.add('hidden');
    if (pinInput) {
      pinInput.value = '';
      pinInput.placeholder = 'Enter Admin PIN';
      if (pinInput.nextElementSibling && pinInput.nextElementSibling.tagName === 'SPAN') {
        pinInput.nextElementSibling.remove();
      }
    }
    if (modal) modal.classList.remove('hidden');
  }
}

function closeAdminLoginModal() {
  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const pinInput = document.getElementById('admin-pin-input');
  const err = document.getElementById('admin-login-error');
  const entered = (pinInput ? pinInput.value : '').trim();

  // 1. Authenticate against server endpoint (checks settings.json directly on cloud server)
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: entered })
    });
    if (res.ok) {
      state.isAdmin = true;
      state.adminPin = entered;
      localStorage.setItem('fmk_admin_pin', entered);
      sessionStorage.setItem('fmk_admin_unlocked', 'true');
      closeAdminLoginModal();
      updateAdminUI();
      renderBrandsUI();
      renderProductGrid();
      showToast('Admin Mode unlocked.');
      return;
    } else {
      // Server rejected the PIN!
      if (err) {
        err.classList.remove('hidden');
        err.textContent = 'Incorrect Admin PIN.';
      }
      return;
    }
  } catch (_) {}

  // 2. Fallback only if offline / static server
  if (entered && entered === state.adminPin) {
    state.isAdmin = true;
    sessionStorage.setItem('fmk_admin_unlocked', 'true');
    closeAdminLoginModal();
    updateAdminUI();
    renderBrandsUI();
    renderProductGrid();
    showToast('Admin Mode unlocked.');
    return;
  }

  if (err) {
    err.classList.remove('hidden');
    err.textContent = 'Incorrect Admin PIN.';
  }
}

function logoutAdmin() {
  state.isAdmin = false;
  sessionStorage.removeItem('fmk_admin_unlocked');
  updateAdminUI();
  renderBrandsUI();
  renderProductGrid();
  showToast('Logged out of Admin Mode.');
}

function updateAdminUI() {
  const adminBar = document.getElementById('admin-top-bar');
  if (adminBar) {
    if (state.isAdmin) adminBar.classList.remove('hidden');
    else adminBar.classList.add('hidden');
  }
}

/**
 * Open Upload New Shoe Modal (Admin Only)
 */
function openAddProductModal() {
  if (!state.isAdmin) {
    openAdminPortal();
    return;
  }

  const form = document.getElementById('product-upload-form');
  if (form) form.reset();

  document.getElementById('edit-shoe-id').value = '';
  document.getElementById('product-form-title').textContent = 'Upload New Shoe';
  document.getElementById('save-shoe-submit-btn').textContent = 'Save & Publish Shoe';

  const genderEl = document.getElementById('new-shoe-gender');
  if (genderEl) genderEl.value = 'Unisex';

  renderBrandsUI();

  state.stagedUploadImages = [];
  renderUploadPreviews();

  const modal = document.getElementById('add-product-modal');
  if (modal) modal.classList.remove('hidden');
}

/**
 * Open Edit Shoe Modal (Admin Only)
 */
function openEditProductModal(event, productId) {
  if (event) event.stopPropagation();
  if (!state.isAdmin) return;

  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe) return;

  document.getElementById('edit-shoe-id').value = shoe.id;
  document.getElementById('product-form-title').textContent = `Edit Shoe (${shoe.id})`;
  document.getElementById('save-shoe-submit-btn').textContent = 'Update Shoe';

  renderBrandsUI(shoe.brand);

  document.getElementById('new-shoe-name').value = shoe.name || '';
  document.getElementById('new-shoe-brand').value = shoe.brand || state.brands[0] || 'Nike';
  document.getElementById('new-shoe-category').value = shoe.category || 'Sneakers';
  const editGenderEl = document.getElementById('new-shoe-gender');
  if (editGenderEl) editGenderEl.value = shoe.gender || (shoe.girls_collection ? 'Women' : 'Men');
  document.getElementById('new-shoe-price').value = shoe.price || '';
  document.getElementById('new-shoe-mrp').value = shoe.mrp || '';
  document.getElementById('new-shoe-desc').value = shoe.description || '';

  const checkboxes = document.querySelectorAll('#admin-sizes-checkboxes input[name="shoe_size"]');
  checkboxes.forEach(cb => {
    const val = cb.value.trim().toLowerCase();
    const ukMatch = val.match(/uk\s*([0-9.]+)/i);
    const euMatch = val.match(/eu\s*([0-9.]+)/i);
    const ukNum = ukMatch ? ukMatch[1] : '';
    const euNum = euMatch ? euMatch[1] : '';

    const isMatch = (shoe.sizes || []).some(sz => {
      const s = String(sz).trim().toLowerCase();
      if (s === val) return true;
      if (ukNum && (s === `uk ${ukNum}` || s === `uk${ukNum}` || s.includes(`uk ${ukNum}`))) return true;
      if (euNum && (s === `eu ${euNum}` || s === `eu${euNum}` || s.includes(`eu ${euNum}`) || s.includes(`(${euNum})`))) return true;
      const digits = s.replace(/[^0-9.]/g, '');
      if (ukNum && digits === ukNum) return true;
      if (euNum && digits === euNum) return true;
      return false;
    });

    cb.checked = isMatch;
  });

  state.stagedUploadImages = Array.isArray(shoe.images) ? [...shoe.images] : [];
  renderUploadPreviews();

  const modal = document.getElementById('add-product-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAddProductModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Drag-and-Drop & System File Input Reader (Standardizes every photo to an exact 1000x1000 square while keeping 100% of the actual photo)
 */
function initPhotoDropzoneDragAndDrop() {
  const dropzone = document.getElementById('photo-dropzone');
  if (!dropzone) return;

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-[#D90429]', 'bg-red-50/30');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-[#D90429]', 'bg-red-50/30');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-[#D90429]', 'bg-red-50/30');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processSelectedFiles(Array.from(e.dataTransfer.files));
    }
  });
}

async function handleSystemFilesSelected(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  await processSelectedFiles(files);
  event.target.value = '';
}

async function processSelectedFiles(files) {
  const validFiles = files.filter(f => (f.type && f.type.startsWith('image/')) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name));
  if (!validFiles.length) {
    showToast('Please select valid image files.');
    return;
  }

  const progressBar = document.getElementById('upload-processing-bar');
  const progressText = document.getElementById('upload-processing-text');
  const progressCount = document.getElementById('upload-processing-count');

  if (progressBar) progressBar.classList.remove('hidden');

  try {
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      if (progressText) progressText.textContent = `Optimizing photo ${i + 1} of ${validFiles.length}...`;
      if (progressCount) progressCount.textContent = `${Math.round(((i + 1) / validFiles.length) * 100)}%`;
      
      const normalizedDataUrl = await compressImageFile(file, 800, 0.82);
      state.stagedUploadImages.push(normalizedDataUrl);
    }
  } catch (err) {
    console.error('Photo processing error:', err);
    showToast('Error processing some photos.');
  } finally {
    if (progressBar) progressBar.classList.add('hidden');
    renderUploadPreviews();
    showToast(`Added ${validFiles.length} photo${validFiles.length > 1 ? 's' : ''}!`);
  }
}

/**
 * Ultra-fast hardware-accelerated photo normalizer (800x800 px square canvas)
 * Works flawlessly across iOS Safari, Android, tablets, and desktops in milliseconds.
 */
function compressImageFile(file, boxSize = 800, quality = 0.82) {
  return new Promise(async (resolve) => {
    // Path 1: Hardware-accelerated createImageBitmap (modern iOS Safari, Chrome, Edge)
    if (window.createImageBitmap) {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = boxSize;
        canvas.height = boxSize;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, boxSize, boxSize);

        const scale = Math.min(boxSize / bitmap.width, boxSize / bitmap.height);
        const drawWidth = Math.round(bitmap.width * scale);
        const drawHeight = Math.round(bitmap.height * scale);
        const offsetX = Math.round((boxSize - drawWidth) / 2);
        const offsetY = Math.round((boxSize - drawHeight) / 2);

        ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
        bitmap.close();
        resolve(canvas.toDataURL('image/jpeg', quality));
        return;
      } catch (_) {}
    }

    // Path 2: Instant Object URL streaming
    try {
      const blobUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        canvas.width = boxSize;
        canvas.height = boxSize;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, boxSize, boxSize);

        const scale = Math.min(boxSize / img.width, boxSize / img.height);
        const drawWidth = Math.round(img.width * scale);
        const drawHeight = Math.round(img.height * scale);
        const offsetX = Math.round((boxSize - drawWidth) / 2);
        const offsetY = Math.round((boxSize - drawHeight) / 2);

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        // Path 3: Fallback FileReader
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      };
      img.src = blobUrl;
    } catch (_) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    }
  });
}

function renderUploadPreviews() {
  const container = document.getElementById('upload-previews-container');
  const grid = document.getElementById('upload-previews-grid');
  const countEl = document.getElementById('upload-photo-count');
  if (!container || !grid) return;

  if (countEl) countEl.textContent = state.stagedUploadImages.length;

  if (state.stagedUploadImages.length === 0) {
    container.classList.add('hidden');
    grid.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  grid.innerHTML = state.stagedUploadImages.map((src, idx) => `
    <div class="relative w-full h-28 rounded-lg overflow-hidden border-2 ${idx === 0 ? 'border-[#D90429]' : 'border-neutral-300'} bg-[#F5F5F7] p-1 group">
      <img src="${src}" class="uniform-thumb-img" />
      <span class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded ${idx === 0 ? 'bg-[#D90429]' : 'bg-black/75'} text-white text-[9px] font-bold uppercase">
        ${idx === 0 ? 'Cover #1' : `Angle #${idx + 1}`}
      </span>
      <button 
        type="button" 
        onclick="removeStagedPhoto(${idx})"
        title="Remove photo"
        class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/75 hover:bg-[#D90429] text-white flex items-center justify-center text-xs">
        <i class="fa-solid fa-xmark"></i>
      </button>
      ${idx > 0 ? `
        <button 
          type="button"
          onclick="setStagedPhotoAsCover(${idx})"
          class="absolute bottom-1.5 inset-x-1.5 py-1 rounded bg-black/80 hover:bg-[#D90429] text-white text-[10px] font-semibold text-center transition-colors">
          Set as Cover
        </button>
      ` : ''}
    </div>
  `).join('');
}

function setStagedPhotoAsCover(idx) {
  if (idx <= 0 || idx >= state.stagedUploadImages.length) return;
  const [chosen] = state.stagedUploadImages.splice(idx, 1);
  state.stagedUploadImages.unshift(chosen);
  renderUploadPreviews();
}

function removeStagedPhoto(idx) {
  state.stagedUploadImages.splice(idx, 1);
  renderUploadPreviews();
}

function clearSelectedUploadPhotos() {
  state.stagedUploadImages = [];
  renderUploadPreviews();
}

function setAdminSizePreset(type) {
  const checkboxes = document.querySelectorAll('#admin-sizes-checkboxes input[name="shoe_size"]');
  checkboxes.forEach(cb => {
    const val = cb.value.toLowerCase();
    const euMatch = (val.match(/eu\s*([0-9.]+)/) || [])[1] || '';
    const euNum = Number(euMatch) || 0;
    if (type === 'men') {
      cb.checked = euNum >= 41 && euNum <= 45;
    } else if (type === 'women') {
      cb.checked = euNum >= 36 && euNum <= 41;
    } else if (type === 'all') {
      cb.checked = true;
    } else if (type === 'none') {
      cb.checked = false;
    }
  });
}

function toggleAllAdminSizes() {
  const checkboxes = Array.from(document.querySelectorAll('#admin-sizes-checkboxes input[name="shoe_size"]'));
  const allChecked = checkboxes.every(c => c.checked);
  checkboxes.forEach(c => { c.checked = !allChecked; });
}

/**
 * Save New or Edited Shoe (System Multi-Photo Upload)
 */
async function handleSaveProduct(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  if (state.stagedUploadImages.length === 0) {
    showToast('Please select at least 1 shoe photo from your device.');
    return;
  }

  const editId = document.getElementById('edit-shoe-id').value.trim();
  const name = document.getElementById('new-shoe-name').value.trim();
  const brand = document.getElementById('new-shoe-brand').value;
  const category = document.getElementById('new-shoe-category').value;
  const gender = document.getElementById('new-shoe-gender')?.value || 'Unisex';
  const price = Number(document.getElementById('new-shoe-price').value);
  const mrpInput = Number(document.getElementById('new-shoe-mrp').value);
  const mrp = mrpInput > price ? mrpInput : price;
  const description = document.getElementById('new-shoe-desc').value.trim();

  const checkedSizes = Array.from(
    document.querySelectorAll('#admin-sizes-checkboxes input[name="shoe_size"]:checked')
  ).map(cb => cb.value);

  if (checkedSizes.length === 0) {
    showToast('Please select at least one available UK size.');
    return;
  }

  const submitBtn = document.getElementById('save-shoe-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Publishing to Cloud Server...';
  }

  try {
    const payload = {
      name,
      brand,
      category,
      gender,
      price,
      mrp,
      sizes: checkedSizes,
      images: [...state.stagedUploadImages],
      description
    };

    if (editId) {
      await window.InventoryAPI.update(editId, payload);
      showToast(`Updated "${name}" live across all devices!`);
    } else {
      await window.InventoryAPI.create(payload);
      showToast(`Published "${name}" live across all devices!`);
    }

    closeAddProductModal();
    await refreshInventory();
  } catch (err) {
    console.error('Save product error:', err);
    alert(`Upload Note: ${err.message}`);
    showToast(err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Update Shoe' : 'Save & Publish Shoe';
    }
  }
}

/**
 * Delete Shoe (Admin Only)
 */
async function handleDeleteProduct(event, productId) {
  if (event) event.stopPropagation();
  if (!state.isAdmin) return;

  const shoe = state.allProducts.find(p => p.id === productId);
  if (!shoe) return;

  if (!confirm(`Delete "${shoe.name}" from your catalog?`)) return;

  await window.InventoryAPI.remove(productId);
  await refreshInventory();
  showToast(`Removed "${shoe.name}".`);
}

/**
 * Store Settings & Size Chart Modals
 */
function openSizeChartModal() {
  const modal = document.getElementById('sizechart-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeSizeChartModal() {
  const modal = document.getElementById('sizechart-modal');
  if (modal) modal.classList.add('hidden');
}

function openSettingsModal() {
  if (!state.isAdmin) {
    openAdminPortal();
    return;
  }
  const waInput = document.getElementById('setting-whatsapp-num');
  const addrInput = document.getElementById('setting-store-address');
  const pinInput = document.getElementById('setting-admin-pin');
  if (waInput) waInput.value = state.whatsappNumber;
  if (addrInput) addrInput.value = state.storeAddress;
  if (pinInput) pinInput.value = state.adminPin;

  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveStoreSettings() {
  const waInput = document.getElementById('setting-whatsapp-num');
  const addrInput = document.getElementById('setting-store-address');
  const pinInput = document.getElementById('setting-admin-pin');

  if (waInput && waInput.value.trim()) {
    state.whatsappNumber = waInput.value.trim().replace(/[^0-9]/g, '');
    localStorage.setItem('fmk_whatsapp_number', state.whatsappNumber);
  }

  if (addrInput && addrInput.value.trim()) {
    state.storeAddress = addrInput.value.trim();
    localStorage.setItem('fmk_store_address', state.storeAddress);
  }

  const newPin = pinInput ? pinInput.value.trim() : '';
  if (newPin) {
    state.adminPin = newPin;
    localStorage.setItem('fmk_admin_pin', newPin);
    try {
      await fetch('/api/admin/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPin })
      });
    } catch (_) {}
  }

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatsappNumber: state.whatsappNumber,
        storeAddress: state.storeAddress,
        adminPin: state.adminPin
      })
    });
  } catch (_) {}

  updateStoreSettingsUI();
  closeSettingsModal();
  showToast('Store settings & Admin PIN saved.');
}

function updateStoreSettingsUI() {
  const footerAddr = document.getElementById('footer-store-address');
  if (footerAddr && state.storeAddress) {
    footerAddr.textContent = `Dispatched from our Delhi store (${state.storeAddress}) across all states in India with courier tracking shared directly on your WhatsApp.`;
  }
}

/**
 * Export active shoe catalog as products.json for static cloud hosting (Netlify / Vercel / GitHub Pages)
 */
function exportLiveCatalog() {
  if (!state.isAdmin) {
    openAdminPortal();
    return;
  }
  const products = state.allProducts || [];
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'products.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Downloaded products.json (${products.length} shoes). Place it in d:\\FixMyKicks\\data\\products.json before uploading!`);
}

/**
 * Toast Helper
 */
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-enter flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111111] text-white text-xs font-semibold shadow-xl border border-neutral-800';
  toast.innerHTML = `
    <span class="w-2 h-2 rounded-full bg-[#D90429] shrink-0"></span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}
