/*
  DJ's House of Cards & Comics
  Rebuilt front-end script
  - Product loading with JSON + embedded fallback
  - Shop filters and modal
  - Wishlist via localStorage
  - Admin add/remove local products
  - Theme toggle
  - Mobile nav
  - Contact mailto helper
*/

let productCache = null;
let lastFocusedElement = null;

const fallbackByCategory = {
  Baseball: "assets/placeholder-baseball.svg",
  Basketball: "assets/placeholder-basketball.svg",
  Football: "assets/placeholder-football.svg",
  Comics: "assets/placeholder-comics.svg",
  Collectibles: "assets/clubhouse-sign.png",
  Other: "assets/clubhouse-sign.png",
};

const catalogPageConfig = {
  shop: {
    allowedCategories: null,
    emptyTitle: "No items matched your filters",
    emptyCopy: "Try widening the year or price range, or clear a few filters and search again.",
  },
  "sports-cards": {
    allowedCategories: ["Baseball", "Basketball", "Football"],
    emptyTitle: "No sports cards matched your filters",
    emptyCopy: "Try a different search, widen your price range, or clear one of the filters to see more cards.",
  },
  comics: {
    allowedCategories: ["Comics"],
    emptyTitle: "No comics matched your filters",
    emptyCopy: "Try a broader search or clear a filter to view more comic inventory.",
  },
  collectibles: {
    allowedCategories: ["Collectibles", "Other"],
    emptyTitle: "No collectibles are listed yet",
    emptyCopy: "Use the Admin page to add a collectible item, or check back as more memorabilia is added to the site.",
  },
  "baseball-cards": {
    allowedCategories: ["Baseball"],
    emptyTitle: "No baseball cards matched your filters",
    emptyCopy: "Try a broader player search, adjust the year range, or clear a filter to see more baseball inventory.",
  },
  "basketball-cards": {
    allowedCategories: ["Basketball"],
    emptyTitle: "No basketball cards matched your filters",
    emptyCopy: "Try a broader player search, adjust the year range, or clear a filter to see more basketball inventory.",
  },
  "football-cards": {
    allowedCategories: ["Football"],
    emptyTitle: "No football cards matched your filters",
    emptyCopy: "Try a broader player search, adjust the year range, or clear a filter to see more football inventory.",
  },
};

function getActiveCatalogConfig() {
  const page = document.body.dataset.page || "shop";
  return catalogPageConfig[page] || catalogPageConfig.shop;
}

function currency(value) {
  if (value == null || Number.isNaN(Number(value))) return "Contact for price";
  const amount = Number(value);
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function displayPrice(product) {
  if (product?.priceLabel) return product.priceLabel;
  return currency(product?.price);
}

function numericPrice(product) {
  const amount = Number(product?.price);
  return Number.isFinite(amount) ? amount : null;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function getWishlist() {
  return JSON.parse(localStorage.getItem("wishlist") || "[]");
}

function setWishlist(list) {
  localStorage.setItem("wishlist", JSON.stringify(list));
  updateWishlistCount();
}

function getCustomProducts() {
  return JSON.parse(localStorage.getItem("customProducts") || "[]");
}

function saveCustomProducts(items) {
  try {
    localStorage.setItem("customProducts", JSON.stringify(items));
    productCache = null;
    return true;
  } catch (error) {
    console.error("Failed to save custom products:", error);
    return false;
  }
}

const adminCustomState = {
  search: '',
  category: 'All',
};

async function loadProducts() {
  if (productCache) return productCache;

  try {
    const response = await fetch("products.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    productCache = normalizeProducts(data.concat(getCustomProducts()));
    return productCache;
  } catch (error) {
    const embedded = document.getElementById("productData");
    if (embedded) {
      try {
        const data = JSON.parse(embedded.textContent);
        productCache = normalizeProducts(data.concat(getCustomProducts()));
        return productCache;
      } catch (innerError) {
        console.error("Failed to parse embedded product data:", innerError);
      }
    }
    console.error("Failed to load products:", error);
    productCache = normalizeProducts(getCustomProducts());
    return productCache;
  }
}

function normalizeProducts(items) {
  return items.map((item) => ({
    ...item,
    price: item.price === "" || item.price === undefined ? null : item.price,
    image: item.image || fallbackByCategory[item.category] || fallbackByCategory.Other,
  }));
}

function getCategoryBadge(category) {
  return category === "Comics" ? "Key Issue" : category;
}

function productCardMarkup(product) {
  const inWishlist = getWishlist().includes(product.id);
  const wishlistSymbol = inWishlist ? "♥" : "♡";

  return `
    <article class="product-card" data-product-id="${product.id}">
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
      <button type="button" class="wishlist-button${inWishlist ? " filled" : ""}" aria-label="${inWishlist ? "Remove from wishlist" : "Add to wishlist"}">${wishlistSymbol}</button>
      <div class="product-content">
        <div class="product-topline">
          <span class="product-badge">${escapeHtml(getCategoryBadge(product.category))}</span>
          <span class="product-meta">${escapeHtml(product.condition || "Raw")}</span>
        </div>
        <h4>${escapeHtml(product.name)}</h4>
        <div class="product-meta">${escapeHtml(product.year)} • ${escapeHtml(product.team || product.category)}</div>
        <div class="product-price">${escapeHtml(displayPrice(product))}</div>
        <div class="product-actions">
          <button type="button" class="buy-button">Buy Now</button>
          <button type="button" class="button-ghost details-button">Details</button>
        </div>
      </div>
    </article>
  `;
}

function attachProductCardEvents(container, products) {
  if (!container) return;

  container.onclick = (event) => {
    const card = event.target.closest(".product-card");
    if (!card) return;

    const id = Number(card.dataset.productId);
    const product = products.find((item) => Number(item.id) === id);
    if (!product) return;

    if (event.target.closest(".wishlist-button")) {
      toggleWishlist(id);
      if (document.body.dataset.page === "wishlist") {
        renderWishlist();
      } else {
        updateWishlistIcons();
      }
      return;
    }

    if (event.target.closest(".buy-button")) {
      buyNow(product);
      return;
    }

    if (event.target.closest(".details-button")) {
      openModal(product);
      return;
    }

    openModal(product);
  };
}

function buyNow(product) {
  const subject = encodeURIComponent(`Purchase Inquiry: ${product.name}`);
  const body = encodeURIComponent(
    `Hello DJ,\n\nI'm interested in "${product.name}" (${product.year}, ${product.condition || "Condition not listed"}) listed for ${displayPrice(product)}.\n\nPlease let me know if it is still available.\n\nThank you.`
  );
  window.location.href = `mailto:contact@djshouseofcards-comics.com?subject=${subject}&body=${body}`;
}

function toggleWishlist(id) {
  const list = getWishlist();
  const index = list.indexOf(id);
  if (index > -1) {
    list.splice(index, 1);
  } else {
    list.push(id);
  }
  setWishlist(list);
  updateWishlistIcons();
}

function updateWishlistIcons() {
  const list = getWishlist();
  document.querySelectorAll(".product-card").forEach((card) => {
    const id = Number(card.dataset.productId);
    const button = card.querySelector(".wishlist-button");
    if (!button) return;

    const selected = list.includes(id);
    button.classList.toggle("filled", selected);
    button.textContent = selected ? "♥" : "♡";
    button.setAttribute("aria-label", selected ? "Remove from wishlist" : "Add to wishlist");
  });
  updateWishlistCount();
}

function updateWishlistCount() {
  const count = getWishlist().length;
  document.querySelectorAll("[data-wishlist-count]").forEach((el) => {
    el.textContent = count;
  });
}

function initActiveNav() {
  const page = document.body.dataset.page || "";
  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  const pageToNav = {
    home: "index.html",
    shop: "shop.html",
    "sports-cards": "sports-cards.html",
    "baseball-cards": "sports-cards.html",
    "basketball-cards": "sports-cards.html",
    "football-cards": "sports-cards.html",
    comics: "comics.html",
    collectibles: "collectibles.html",
    wishlist: "wishlist.html",
    about: "about.html",
    contact: "contact.html",
    admin: "admin.html",
  };
  const activeHref = pageToNav[page] || currentFile;
  document.querySelectorAll('.site-nav a, .admin-footer-link').forEach((link) => {
    const href = link.getAttribute('href');
    const active = href === activeHref || href === currentFile;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}


function setStatus(id, message = "", state = "info") {
  const el = document.getElementById(id);
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.removeAttribute("data-state");
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.setAttribute("data-state", state);
}

function formatFilterLabel(label, value) {
  return `${label}: ${value}`;
}

function buildFilterChips(filters) {
  const chips = [];
  if (filters.filterText) chips.push(formatFilterLabel("Search", filters.filterText));
  if (filters.category && filters.category !== "All") chips.push(formatFilterLabel("Category", filters.category));
  if (filters.condition && filters.condition !== "All") chips.push(formatFilterLabel("Condition", filters.condition));
  if (filters.yearMin != null) chips.push(formatFilterLabel("Year from", filters.yearMin));
  if (filters.yearMax != null) chips.push(formatFilterLabel("Year to", filters.yearMax));
  if (filters.priceMin != null) chips.push(formatFilterLabel("Min price", currency(filters.priceMin)));
  if (filters.priceMax != null) chips.push(formatFilterLabel("Max price", currency(filters.priceMax)));
  if (filters.sort && filters.sort !== "nameAsc") {
    const sortMap = {
      nameDesc: "Name Z–A",
      priceAsc: "Price Low–High",
      priceDesc: "Price High–Low",
      yearAsc: "Year Old–New",
      yearDesc: "Year New–Old",
    };
    chips.push(formatFilterLabel("Sort", sortMap[filters.sort] || filters.sort));
  }
  return chips;
}

function updateFilterSummary(filters, count) {
  const summary = document.getElementById("resultsSummary");
  const active = document.getElementById("activeFilters");
  const live = document.getElementById("resultsLive");
  if (!summary && !active && !live) return;

  const chips = buildFilterChips(filters);
  const base = `${count} item${count === 1 ? "" : "s"} shown`;
  if (summary) {
    summary.textContent = chips.length ? `${base}. ${chips.length} filter${chips.length === 1 ? "" : "s"} active.` : `${base}. Showing all available items.`;
  }
  if (active) {
    active.innerHTML = chips.map((chip) => `<span class="filter-chip">${escapeHtml(chip)}</span>`).join("");
  }
  if (live) {
    live.textContent = summary ? summary.textContent : base;
  }
}

function applyLazyLoading(scope = document) {
  scope.querySelectorAll('img:not([loading])').forEach((img) => {
    img.setAttribute('loading', 'lazy');
  });
}

async function renderFeaturedProducts() {
  const container = document.getElementById("featuredProducts");
  if (!container) return;
  const products = await loadProducts();
  const featured = products.slice(0, 4);
  container.innerHTML = featured.map(productCardMarkup).join("");
  attachProductCardEvents(container, featured);
  updateWishlistIcons();
  applyLazyLoading(container);
}

async function populateCategories(selectId, allowedCategories = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  let products = await loadProducts();
  if (allowedCategories && allowedCategories.length) {
    products = products.filter((p) => allowedCategories.includes(p.category));
  }
  const categories = [...new Set(products.map((p) => p.category))];
  select.innerHTML = `<option value="All">All Categories</option>${categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;
}

async function populateConditions(selectId, allowedCategories = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  let products = await loadProducts();
  if (allowedCategories && allowedCategories.length) {
    products = products.filter((p) => allowedCategories.includes(p.category));
  }
  const conditions = [...new Set(products.map((p) => (p.condition || "").trim()).filter(Boolean))];
  select.innerHTML = `<option value="All">All Conditions</option>${conditions
    .map((condition) => `<option value="${escapeHtml(condition)}">${escapeHtml(condition)}</option>`)
    .join("")}`;
}

async function renderProducts(options = {}) {
  const container = document.getElementById("productContainer");
  if (!container) return;

  const allProducts = await loadProducts();
  const {
    filterText = "",
    category = "All",
    condition = "All",
    yearMin = null,
    yearMax = null,
    priceMin = null,
    priceMax = null,
    sort = "nameAsc",
    allowedCategories = null,
    emptyTitle = null,
    emptyCopy = null,
  } = options;

  const products = allowedCategories && allowedCategories.length
    ? allProducts.filter((product) => allowedCategories.includes(product.category))
    : allProducts;

  const term = filterText.trim().toLowerCase();

  let filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.team || ""} ${product.category} ${product.description || ""}`.toLowerCase();
    const textMatch = !term || haystack.includes(term);
    const categoryMatch = category === "All" || product.category === category;
    const conditionMatch = condition === "All" || (product.condition || "").toLowerCase() === condition.toLowerCase();
    const yearMinMatch = yearMin == null || Number(product.year) >= yearMin;
    const yearMaxMatch = yearMax == null || Number(product.year) <= yearMax;
    const priceValue = numericPrice(product);
    const priceMinMatch = priceMin == null || (priceValue != null && priceValue >= priceMin);
    const priceMaxMatch = priceMax == null || (priceValue != null && priceValue <= priceMax);
    return textMatch && categoryMatch && conditionMatch && yearMinMatch && yearMaxMatch && priceMinMatch && priceMaxMatch;
  });

  filtered.sort((a, b) => {
    switch (sort) {
      case "priceAsc": {
        const ap = numericPrice(a);
        const bp = numericPrice(b);
        return (ap ?? Number.POSITIVE_INFINITY) - (bp ?? Number.POSITIVE_INFINITY);
      }
      case "priceDesc": {
        const ap = numericPrice(a);
        const bp = numericPrice(b);
        return (bp ?? Number.NEGATIVE_INFINITY) - (ap ?? Number.NEGATIVE_INFINITY);
      }
      case "yearAsc":
        return a.year - b.year;
      case "yearDesc":
        return b.year - a.year;
      case "nameDesc":
        return b.name.localeCompare(a.name);
      case "nameAsc":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const countEl = document.getElementById("resultsCount");
  if (countEl) {
    countEl.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"} found`;
  }
  updateFilterSummary({ filterText, category, condition, yearMin, yearMax, priceMin, priceMax, sort }, filtered.length);

  if (!filtered.length) {
    const fallbackTitle = emptyTitle || document.body.dataset.emptyTitle || "No items matched your filters";
    const fallbackCopy = emptyCopy || document.body.dataset.emptyCopy || "Try widening the year or price range, or clear a few filters and search again.";
    container.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(fallbackTitle)}</h3>
        <p>${escapeHtml(fallbackCopy)}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(productCardMarkup).join("");
  attachProductCardEvents(container, filtered);
  updateWishlistIcons();
  applyLazyLoading(container);
}

function getCurrentShopFilters() {
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const conditionFilter = document.getElementById("conditionFilter");
  const yearMin = document.getElementById("yearMin");
  const yearMax = document.getElementById("yearMax");
  const priceMin = document.getElementById("priceMin");
  const priceMax = document.getElementById("priceMax");
  const sortSelect = document.getElementById("sortSelect");

  return {
    filterText: searchInput ? searchInput.value : "",
    category: categoryFilter ? categoryFilter.value : "All",
    condition: conditionFilter ? conditionFilter.value : "All",
    yearMin: yearMin && yearMin.value ? Number(yearMin.value) : null,
    yearMax: yearMax && yearMax.value ? Number(yearMax.value) : null,
    priceMin: priceMin && priceMin.value ? Number(priceMin.value) : null,
    priceMax: priceMax && priceMax.value ? Number(priceMax.value) : null,
    sort: sortSelect ? sortSelect.value : "nameAsc",
  };
}

async function initShopPage() {
  const config = getActiveCatalogConfig();
  await Promise.all([
    populateCategories("categoryFilter", config.allowedCategories),
    populateConditions("conditionFilter", config.allowedCategories),
  ]);

  const params = new URLSearchParams(window.location.search);
  const categoryParam = params.get("category");
  const searchParam = params.get("search");

  const categoryFilter = document.getElementById("categoryFilter");
  const searchInput = document.getElementById("searchInput");

  if (categoryParam && categoryFilter) categoryFilter.value = categoryParam;
  if (searchParam && searchInput) searchInput.value = searchParam;

  const renderCurrentView = () => renderProducts({
    ...getCurrentShopFilters(),
    allowedCategories: config.allowedCategories,
    emptyTitle: config.emptyTitle,
    emptyCopy: config.emptyCopy,
  });

  await renderCurrentView();

  [
    "searchInput",
    "categoryFilter",
    "conditionFilter",
    "yearMin",
    "yearMax",
    "priceMin",
    "priceMax",
    "sortSelect",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, renderCurrentView);
  });

  const clearButton = document.getElementById("clearFilters");
  if (clearButton) {
    clearButton.addEventListener("click", async () => {
      ["searchInput", "yearMin", "yearMax", "priceMin", "priceMax"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      ["categoryFilter", "conditionFilter", "sortSelect"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === "sortSelect") {
          el.value = "nameAsc";
        } else {
          el.value = "All";
        }
      });
      await renderCurrentView();
      document.getElementById("searchInput")?.focus();
    });
  }
}

async function renderWishlist() {
  const container = document.getElementById("wishlistContainer");
  if (!container) return;

  const products = await loadProducts();
  const list = getWishlist();
  const items = products.filter((product) => list.includes(Number(product.id)));

  const countEl = document.getElementById("wishlistPageCount");
  if (countEl) {
    countEl.textContent = `${items.length} saved item${items.length === 1 ? "" : "s"}`;
  }

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Your wishlist is empty</h3>
        <p>Tap the heart icon on any listing to save it here for later.</p>
        <div class="inline-actions">
          <a class="button" href="sports-cards.html">Browse Sports Cards</a>
        </div>
      </div>
    `;
    applyLazyLoading(container);
    return;
  }

  container.innerHTML = items.map(productCardMarkup).join("");
  attachProductCardEvents(container, items);
  updateWishlistIcons();
  applyLazyLoading(container);
}

function openModal(product) {
  const modal = document.getElementById("productModal");
  const inner = document.getElementById("modalInner");
  if (!modal || !inner) return;

  lastFocusedElement = document.activeElement;

  const gallery = Array.isArray(product.imageGallery) && product.imageGallery.length
    ? product.imageGallery
    : [product.image];

  inner.innerHTML = `
    <div class="modal-layout">
      <div class="modal-media">
        <img id="modalMainImage" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(product.name)}">
        ${gallery.length > 1 ? `
          <div class="modal-thumbs" aria-label="Additional item photos">
            ${gallery.map((src, index) => `
              <button type="button" class="modal-thumb${index === 0 ? " active" : ""}" data-gallery-src="${escapeHtml(src)}" aria-label="View photo ${index + 1}">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} photo ${index + 1}" loading="lazy">
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
      <div class="modal-copy">
        <span class="product-badge">${escapeHtml(getCategoryBadge(product.category))}</span>
        <h3 id="modalTitle">${escapeHtml(product.name)}</h3>
        <p><strong>Year:</strong> ${escapeHtml(product.year)}</p>
        <p><strong>Team / Publisher:</strong> ${escapeHtml(product.team || product.category)}</p>
        <p><strong>Condition:</strong> ${escapeHtml(product.condition || "Not listed")}</p>
        <p><strong>Price:</strong> ${escapeHtml(displayPrice(product))}</p>
        ${product.legacyImageLabel ? `<p><strong>Legacy image ref:</strong> ${escapeHtml(product.legacyImageLabel)}</p>` : ""}
        ${product.sourcePage ? `<p><strong>Imported from:</strong> ${escapeHtml(product.sourcePage)}</p>` : ""}
        <p>${escapeHtml(product.description || "")}</p>
        <div class="inline-actions">
          <button type="button" class="modal-cta" id="modalBuy">Buy Now</button>
          <button type="button" class="button-secondary" id="modalWishlist">${getWishlist().includes(product.id) ? "Remove from Wishlist" : "Save to Wishlist"}</button>
        </div>
      </div>
    </div>
  `;

  const mainImage = inner.querySelector("#modalMainImage");
  inner.querySelectorAll(".modal-thumb").forEach((button) => {
    button.addEventListener("click", () => {
      const src = button.dataset.gallerySrc;
      if (mainImage && src) mainImage.src = src;
      inner.querySelectorAll(".modal-thumb").forEach((thumb) => thumb.classList.remove("active"));
      button.classList.add("active");
    });
  });

  inner.querySelector("#modalBuy")?.addEventListener("click", () => buyNow(product));
  inner.querySelector("#modalWishlist")?.addEventListener("click", () => {
    toggleWishlist(product.id);
    updateWishlistIcons();
    closeModal();
  });

  applyLazyLoading(inner);
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => modal.querySelector('.modal-close')?.focus());
}

function closeModal() {
  const modal = document.getElementById("productModal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

function applyTheme() {
  const theme = localStorage.getItem("theme") || "light";
  const button = document.getElementById("themeToggle");
  document.body.classList.toggle("dark-mode", theme === "dark");
  if (button) {
    button.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}

function toggleTheme() {
  const current = localStorage.getItem("theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme();
}

function initThemeToggle() {
  const button = document.getElementById("themeToggle");
  if (!button) return;
  applyTheme();
  button.addEventListener("click", toggleTheme);
}

function initMobileNav() {
  const nav = document.getElementById("siteNav");
  const toggle = document.getElementById("navToggle");
  if (!nav || !toggle) return;

  const closeNav = () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  };

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav();
  });

  document.addEventListener('click', (event) => {
    if (!nav.classList.contains('open')) return;
    if (nav.contains(event.target) || toggle.contains(event.target)) return;
    closeNav();
  });
}

function initBackToTop() {
  const button = document.getElementById("backToTop");
  if (!button) return;
  window.addEventListener("scroll", () => {
    button.classList.toggle("visible", window.scrollY > 300);
  });
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

async function readFileAsDataUrl(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const rawDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be processed."));
    image.src = rawDataUrl;
  });

  const maxDimension = 1400;
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function setAdminImagePreview(src = "", label = "") {
  const wrap = document.getElementById("imagePreviewWrap");
  const preview = document.getElementById("imagePreview");
  const name = document.getElementById("imagePreviewName");
  const imageInput = document.getElementById("image");
  if (!wrap || !preview || !name || !imageInput) return;

  if (!src) {
    wrap.hidden = true;
    preview.removeAttribute("src");
    name.textContent = "Selected image";
    wrap.removeAttribute("data-ready");
    return;
  }

  preview.src = src;
  name.textContent = label || "Selected image";
  wrap.hidden = false;
  wrap.setAttribute("data-ready", "true");
  if (imageInput.value !== src) imageInput.value = src;
}

function clearAdminImageSelection({ keepUrl = false } = {}) {
  const imageInput = document.getElementById("image");
  const imageFile = document.getElementById("imageFile");
  if (imageFile) imageFile.value = "";
  if (imageInput && !keepUrl) imageInput.value = "";
  if (!keepUrl) {
    setAdminImagePreview("", "");
  }
}

function updateCustomItemImage(id, image) {
  const items = getCustomProducts();
  const index = items.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return false;
  items[index] = { ...items[index], image };
  return saveCustomProducts(items);
}

async function handleCustomItemImage(file, id) {
  try {
    const image = await readFileAsDataUrl(file);
    if (!updateCustomItemImage(id, image)) {
      setStatus("adminStatus", "That image was too large to save locally. Try a smaller photo.", "error");
      return;
    }
    renderCustomItems();
    setStatus("adminStatus", "Item photo updated successfully.", "success");
  } catch (error) {
    setStatus("adminStatus", error.message || "Unable to use that image.", "error");
  }
}

function bindDropZone(zone, callbacks = {}) {
  if (!zone) return;
  const { onFiles, onClick } = callbacks;
  ["dragenter", "dragover"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName !== "dragleave" || event.target === zone) {
        zone.classList.remove("is-dragover");
      }
    });
  });
  zone.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length && onFiles) onFiles(files);
  });
  zone.addEventListener("click", () => {
    if (onClick) onClick();
  });
  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (onClick) onClick();
    }
  });
}

function initAdminImageTools() {
  const zone = document.getElementById("imageDropzone");
  const fileInput = document.getElementById("imageFile");
  const browseButton = document.getElementById("imageBrowseButton");
  const removeButton = document.getElementById("imageRemoveButton");
  const imageInput = document.getElementById("image");
  if (!zone || !fileInput || !browseButton || !imageInput) return;

  const chooseFile = () => fileInput.click();

  bindDropZone(zone, {
    onClick: chooseFile,
    onFiles: async (files) => {
      const file = files[0];
      if (!file) return;
      try {
        const image = await readFileAsDataUrl(file);
        setAdminImagePreview(image, file.name || "Selected image");
        setStatus("adminStatus", "Photo attached to the new entry.", "success");
      } catch (error) {
        setStatus("adminStatus", error.message || "Unable to use that image.", "error");
      }
    }
  });

  browseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    chooseFile();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const image = await readFileAsDataUrl(file);
      setAdminImagePreview(image, file.name || "Selected image");
      setStatus("adminStatus", "Photo attached to the new entry.", "success");
    } catch (error) {
      setStatus("adminStatus", error.message || "Unable to use that image.", "error");
    }
  });

  imageInput.addEventListener("input", () => {
    const value = imageInput.value.trim();
    if (!value) {
      clearAdminImageSelection();
      return;
    }
    setAdminImagePreview(value, value.startsWith("data:image") ? "Uploaded image" : "Image URL preview");
  });

  removeButton?.addEventListener("click", () => {
    clearAdminImageSelection();
    setStatus("adminStatus", "Image cleared from the draft entry.", "info");
  });
}

function deleteCustomItem(id) {
  const updated = getCustomProducts().filter((item) => Number(item.id) !== Number(id));
  if (!saveCustomProducts(updated)) {
    setStatus("adminStatus", "Unable to delete that item right now.", "error");
    return;
  }
  renderCustomItems();
  setStatus("adminStatus", "Item removed.", "success");
}

function customItemCardMarkup(product) {
  return `
    <div class="custom-item-card" data-custom-item-id="${product.id}">
      <div class="custom-item-media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
        <div class="mini-dropzone" data-image-drop-id="${product.id}" role="button" tabindex="0">Drop new photo here or click to upload</div>
        <input accept="image/*" class="sr-only replace-image-input" data-replace-id="${product.id}" id="replaceImage-${product.id}" type="file">
      </div>
      <div>
        <h4>${escapeHtml(product.name)}</h4>
        <p>${escapeHtml(product.year)} • ${escapeHtml(product.category)}</p>
        <p>${escapeHtml(product.team || "No team / publisher listed")}</p>
        <p>${escapeHtml(displayPrice(product))} • ${escapeHtml(product.condition || "Condition not listed")}</p>
      </div>
      <button type="button" class="delete-button" data-delete-id="${product.id}">Delete</button>
    </div>
  `;
}

function getFilteredCustomProducts() {
  const items = getCustomProducts();
  const search = adminCustomState.search.trim().toLowerCase();
  const category = adminCustomState.category;

  return items.filter((item) => {
    const matchesCategory = category === "All" || item.category === category;
    if (!matchesCategory) return false;
    if (!search) return true;

    const haystack = [item.name, item.team, item.category, item.condition, item.description, item.year]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

function updateAdminStats(items = getCustomProducts()) {
  const total = items.length;
  const customPhotoCount = items.filter((item) => item.image && !String(item.image).includes("placeholder-")).length;
  const categoryCount = new Set(items.map((item) => item.category).filter(Boolean)).size;

  const countEl = document.getElementById("adminStatCount");
  const photoEl = document.getElementById("adminStatPhotos");
  const categoryEl = document.getElementById("adminStatCategories");

  if (countEl) countEl.textContent = String(total);
  if (photoEl) photoEl.textContent = String(customPhotoCount);
  if (categoryEl) categoryEl.textContent = String(categoryCount);
}

function downloadCustomItemsBackup(items) {
  const payload = JSON.stringify(items, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dj-house-custom-items-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeImportedCustomItems(rawItems) {
  if (!Array.isArray(rawItems)) throw new Error("That file did not contain an item list.");

  return rawItems
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const category = String(item.category || "Other").trim() || "Other";
      return {
        id: Number(item.id) || Date.now() + index,
        name: String(item.name || "").trim(),
        category,
        team: String(item.team || "").trim(),
        year: Number(item.year),
        condition: String(item.condition || "").trim(),
        price: Number(item.price),
        image: String(item.image || "").trim() || fallbackByCategory[category] || fallbackByCategory.Other,
        description: String(item.description || "").trim(),
      };
    })
    .filter((item) => item.name && Number.isFinite(item.year) && Number.isFinite(item.price));
}

function renderCustomItems() {
  const container = document.getElementById("customItemsList");
  if (!container) return;

  const allItems = getCustomProducts();
  const items = getFilteredCustomProducts();
  updateAdminStats(allItems);

  if (!allItems.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No custom items yet</h3>
        <p>Use the form to add inventory. Everything is stored locally in your browser for now.</p>
      </div>
    `;
    applyLazyLoading(container);
    return;
  }

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No saved items match those filters</h3>
        <p>Try a broader search, switch the category filter, or clear the filter bar.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(customItemCardMarkup).join("");
  container.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => deleteCustomItem(button.dataset.deleteId));
  });
  container.querySelectorAll(".replace-image-input").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      handleCustomItemImage(file, input.dataset.replaceId);
    });
  });
  container.querySelectorAll("[data-image-drop-id]").forEach((zone) => {
    const id = zone.dataset.imageDropId;
    const input = container.querySelector(`#replaceImage-${id}`);
    bindDropZone(zone, {
      onClick: () => input?.click(),
      onFiles: (files) => {
        const file = files[0];
        if (!file) return;
        handleCustomItemImage(file, id);
      }
    });
  });
  applyLazyLoading(container);
}

function initAdminToolbar() {
  const searchInput = document.getElementById("customItemSearch");
  const categoryFilter = document.getElementById("customItemFilter");
  const exportButton = document.getElementById("exportCustomItems");
  const importInput = document.getElementById("importCustomItems");
  const clearButton = document.getElementById("clearCustomItems");
  const categoryPills = document.querySelectorAll("[data-category-pill]");
  const categorySelect = document.getElementById("category");

  searchInput?.addEventListener("input", () => {
    adminCustomState.search = searchInput.value;
    renderCustomItems();
  });

  categoryFilter?.addEventListener("change", () => {
    adminCustomState.category = categoryFilter.value;
    renderCustomItems();
  });

  exportButton?.addEventListener("click", () => {
    const items = getCustomProducts();
    if (!items.length) {
      setStatus("adminStatus", "There are no local items to export yet.", "info");
      return;
    }
    downloadCustomItemsBackup(items);
    setStatus("adminStatus", "Local inventory exported as a JSON backup.", "success");
  });

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const imported = normalizeImportedCustomItems(JSON.parse(rawText));
      if (!imported.length) throw new Error("No valid items were found in that file.");

      const merged = [...imported, ...getCustomProducts()];
      if (!saveCustomProducts(merged)) throw new Error("Unable to save the imported items in this browser.");
      renderCustomItems();
      setStatus("adminStatus", `${imported.length} item${imported.length === 1 ? "" : "s"} imported successfully.`, "success");
    } catch (error) {
      setStatus("adminStatus", error.message || "Unable to import that JSON file.", "error");
    } finally {
      importInput.value = "";
    }
  });

  clearButton?.addEventListener("click", () => {
    const items = getCustomProducts();
    if (!items.length) {
      setStatus("adminStatus", "There are no local items to clear.", "info");
      return;
    }

    const confirmed = window.confirm("Remove all locally added items from this browser? This will not affect the main catalog files.");
    if (!confirmed) return;

    if (!saveCustomProducts([])) {
      setStatus("adminStatus", "Unable to clear local items right now.", "error");
      return;
    }

    adminCustomState.search = "";
    adminCustomState.category = "All";
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "All";
    renderCustomItems();
    setStatus("adminStatus", "All local items were cleared from this browser.", "success");
  });

  categoryPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const value = pill.dataset.categoryPill || "";
      if (categorySelect) categorySelect.value = value;
      categoryPills.forEach((button) => button.classList.toggle("active", button === pill));
      document.getElementById("name")?.focus();
    });
  });

  categorySelect?.addEventListener("change", () => {
    categoryPills.forEach((button) => button.classList.toggle("active", button.dataset.categoryPill === categorySelect.value));
  });
}

function initAdminPage() {
  const form = document.getElementById("adminForm");
  if (!form) return;

  initAdminImageTools();
  initAdminToolbar();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setStatus('adminStatus');

    const imageValue = form.image.value.trim();
    const category = form.category.value.trim() || "Other";

    const newProduct = {
      id: Date.now(),
      name: form.name.value.trim(),
      category,
      team: form.team.value.trim(),
      year: Number(form.year.value),
      condition: form.condition.value.trim(),
      price: Number(form.price.value),
      image: imageValue || fallbackByCategory[category] || fallbackByCategory.Other,
      description: form.description.value.trim(),
    };

    if (!newProduct.name || !newProduct.category || !Number.isFinite(newProduct.year) || !Number.isFinite(newProduct.price)) {
      setStatus('adminStatus', 'Please complete the required fields: name, category, year, and price.', 'error');
      form.querySelector('[required]')?.focus();
      return;
    }

    const items = getCustomProducts();
    items.unshift(newProduct);
    if (!saveCustomProducts(items)) {
      setStatus('adminStatus', 'This browser is out of local storage space. Try a smaller image or remove older custom items.', 'error');
      return;
    }
    form.reset();
    clearAdminImageSelection();
    renderCustomItems();
    setStatus('adminStatus', 'Item added successfully. It now appears in the shop views on this browser.', 'success');
  });

  renderCustomItems();
}



function injectCatalogSwitcher() {
  const page = document.body.dataset.page;
  const heroCard = document.querySelector('.page-hero-card');
  if (!heroCard || heroCard.querySelector('.catalog-switcher')) return;

  const switcherMap = {
    shop: [
      ['shop.html', 'All Items'],
      ['sports-cards.html', 'Sports Cards'],
      ['comics.html', 'Comics'],
      ['collectibles.html', 'Collectibles'],
    ],
    'sports-cards': [
      ['sports-cards.html', 'All Sports'],
      ['baseball-cards.html', 'Baseball'],
      ['basketball-cards.html', 'Basketball'],
      ['football-cards.html', 'Football'],
    ],
    'baseball-cards': [
      ['sports-cards.html', 'All Sports'],
      ['baseball-cards.html', 'Baseball'],
      ['basketball-cards.html', 'Basketball'],
      ['football-cards.html', 'Football'],
    ],
    'basketball-cards': [
      ['sports-cards.html', 'All Sports'],
      ['baseball-cards.html', 'Baseball'],
      ['basketball-cards.html', 'Basketball'],
      ['football-cards.html', 'Football'],
    ],
    'football-cards': [
      ['sports-cards.html', 'All Sports'],
      ['baseball-cards.html', 'Baseball'],
      ['basketball-cards.html', 'Basketball'],
      ['football-cards.html', 'Football'],
    ],
    comics: [
      ['shop.html', 'All Items'],
      ['sports-cards.html', 'Sports Cards'],
      ['comics.html', 'Comics'],
      ['collectibles.html', 'Collectibles'],
    ],
    collectibles: [
      ['shop.html', 'All Items'],
      ['sports-cards.html', 'Sports Cards'],
      ['comics.html', 'Comics'],
      ['collectibles.html', 'Collectibles'],
    ],
  };

  const links = switcherMap[page];
  if (!links || !links.length) return;

  const nav = document.createElement('nav');
  nav.className = 'catalog-switcher';
  nav.setAttribute('aria-label', 'Browse departments');
  nav.innerHTML = links.map(([href, label]) => {
    const active = href === `${page}.html` || (page === 'shop' && href === 'shop.html') || (page === 'sports-cards' && href === 'sports-cards.html');
    return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  }).join('');

  const utilityRow = heroCard.querySelector('.utility-row');
  if (utilityRow) {
    utilityRow.insertAdjacentElement('afterend', nav);
  } else {
    heroCard.appendChild(nav);
  }
}

function enhanceCatalogFilters() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let wrapper = searchInput.parentElement;
    if (!wrapper.classList.contains('search-shell')) {
      wrapper = document.createElement('div');
      wrapper.className = 'search-shell';
      searchInput.parentNode.insertBefore(wrapper, searchInput);
      wrapper.appendChild(searchInput);
    }

    let clearButton = wrapper.querySelector('.search-clear');
    if (!clearButton) {
      clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'search-clear';
      clearButton.setAttribute('aria-label', 'Clear search');
      clearButton.textContent = '×';
      clearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
      });
      wrapper.appendChild(clearButton);
    }

    let shortcut = wrapper.querySelector('.search-shortcut');
    if (!shortcut) {
      shortcut = document.createElement('span');
      shortcut.className = 'search-shortcut';
      shortcut.setAttribute('aria-hidden', 'true');
      shortcut.textContent = '/';
      wrapper.appendChild(shortcut);
    }

    const syncSearchUi = () => {
      wrapper.classList.toggle('has-value', Boolean(searchInput.value.trim()));
    };
    syncSearchUi();
    searchInput.addEventListener('input', syncSearchUi);
  }

  const resultsToolbar = document.getElementById('resultsToolbar');
  if (resultsToolbar && !resultsToolbar.querySelector('.toolbar-actions')) {
    const actionWrap = document.createElement('div');
    actionWrap.className = 'toolbar-actions';

    const quickClear = document.createElement('button');
    quickClear.type = 'button';
    quickClear.className = 'mini-link-button';
    quickClear.textContent = 'Reset filters';
    quickClear.addEventListener('click', () => document.getElementById('clearFilters')?.click());

    const jumpTop = document.createElement('button');
    jumpTop.type = 'button';
    jumpTop.className = 'mini-link-button';
    jumpTop.textContent = 'Top';
    jumpTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    actionWrap.appendChild(quickClear);
    actionWrap.appendChild(jumpTop);
    resultsToolbar.appendChild(actionWrap);
  }
}

function initSearchShortcuts() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    const typing = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
    const cmdOrCtrlK = (event.key.toLowerCase() === 'k') && (event.metaKey || event.ctrlKey);
    const slashFocus = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;

    if ((cmdOrCtrlK || slashFocus) && !typing) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select?.();
    }
  });
}

function enhanceSiteUi() {
  injectCatalogSwitcher();
  enhanceCatalogFilters();
  initSearchShortcuts();
}

function initContactForm() {
  const form = document.getElementById("contactForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setStatus("contactStatus");
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const subjectLine = form.subject.value.trim() || "Website Inquiry";
    const message = form.message.value.trim();

    if (!name || !email || !message) {
      setStatus("contactStatus", "Please complete your name, email, and message before creating the email draft.", "error");
      return;
    }

    setStatus("contactStatus", "Opening your email app with a prefilled draft…", "success");
    const subject = encodeURIComponent(`Website Inquiry: ${subjectLine}`);
    const body = encodeURIComponent(`Hello DJ,

Name: ${name}
Email: ${email}

${message}
`);
    window.location.href = `mailto:contact@djshouseofcards-comics.com?subject=${subject}&body=${body}`;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  applyLazyLoading(document);
  initThemeToggle();
  initActiveNav();
  initMobileNav();
  initBackToTop();
  initContactForm();
  updateWishlistCount();
  enhanceSiteUi();

  const page = document.body.dataset.page;
  if (page === "home") {
    renderFeaturedProducts();
  }
  if (["shop", "sports-cards", "baseball-cards", "basketball-cards", "football-cards", "comics", "collectibles"].includes(page)) {
    initShopPage();
  }
  if (page === "wishlist") {
    renderWishlist();
  }
  if (page === "admin") {
    initAdminPage();
  }

  const modal = document.getElementById("productModal");
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.classList.contains("modal-close")) {
        closeModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
});

// expose for inline calls if needed
window.closeModal = closeModal;
window.deleteCustomItem = deleteCustomItem;
