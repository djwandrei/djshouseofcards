/**
 * Storefront catalog controller.
 * -----------------------------------------------------------------------------
 * This module powers every product-facing experience on the site: loading product
 * data from static JSON or Supabase, normalizing product records, rendering cards,
 * filtering and faceting, syncing filters to the URL, handling wishlist actions,
 * and rendering the product details modal.
 */

window.DJ = window.DJ || {};

(() => {
  const DJ = window.DJ;

  // Per-page configuration keeps page-specific copy, locked categories, and
  // filter labeling in one place instead of scattering those differences across
  // the rendering logic below.
  const PAGE_CONFIG = {
    shop: {
      allowedCategories: null,
      emptyTitle: 'No items matched your filters',
      emptyCopy: 'Try widening the year or price range, or clear a few filters and search again.',
      searchLabel: 'Search inventory',
      searchPlaceholder: 'Player, title, team, publisher, or keyword',
      helperText: 'Examples: Jordan rookie, All-Star, PSA, Marvel, Giants.'
    },
    'sports-cards': {
      allowedCategories: ['Baseball', 'Basketball', 'Football'],
      emptyTitle: 'No sports cards matched your filters',
      emptyCopy: 'Try a broader search, widen the year or price range, or reset a filter.',
      searchLabel: 'Search sports cards',
      searchPlaceholder: 'Player, set, team, slab, parallel, or keyword',
      helperText: 'Examples: Jordan rookie, Brady auto, Topps Chrome, PSA 9, All-Star.'
    },
    'sports-hub': {
      allowedCategories: ['Baseball', 'Basketball', 'Football'],
      emptyTitle: 'No sports cards matched your filters',
      emptyCopy: 'Try a broader player search, widen the year or price range, or reset a filter.',
      searchLabel: 'Search all sports cards',
      searchPlaceholder: 'Player, set, team, slab, parallel, or keyword',
      helperText: 'Examples: Jordan rookie, Brady auto, Topps Chrome, PSA 9, All-Star.'
    },
    comics: {
      allowedCategories: ['Comics'],
      emptyTitle: 'No comics matched your filters',
      emptyCopy: 'Try a broader title search, widen the year range, or clear a filter to see more comics.',
      searchLabel: 'Search comics',
      searchPlaceholder: 'Title, character, issue number, publisher, or keyword',
      helperText: 'Examples: Spider-Man, Batman, #1, Venom, newsstand, key issue.'
    },
    collectibles: {
      allowedCategories: ['Collectibles', 'Other'],
      emptyTitle: 'No collectibles are listed yet',
      emptyCopy: 'Try a broader keyword search, or check back as more memorabilia is added.',
      searchLabel: 'Search collectibles',
      searchPlaceholder: 'Autograph, jersey, display, signed, memorabilia, or keyword',
      helperText: 'Examples: signed ball, jersey, autograph, display piece, photo.'
    },
    'baseball-cards': {
      allowedCategories: ['Baseball'],
      emptyTitle: 'No baseball cards matched your filters',
      emptyCopy: 'Try a broader player search, widen the year range, or clear a filter to see more baseball inventory.',
      searchLabel: 'Search baseball cards',
      searchPlaceholder: 'Player, set, team, slab, parallel, or keyword',
      helperText: 'Examples: Mays, Mantle, rookie, Topps, PSA 5, autograph.'
    },
    'basketball-cards': {
      allowedCategories: ['Basketball'],
      emptyTitle: 'No basketball cards matched your filters',
      emptyCopy: 'Try a broader player search, widen the year range, or clear a filter to see more basketball inventory.',
      searchLabel: 'Search basketball cards',
      searchPlaceholder: 'Player, set, team, slab, refractor, or keyword',
      helperText: 'Examples: Jordan, Kobe, rookie, auto, refractor, PSA 10.'
    },
    'football-cards': {
      allowedCategories: ['Football'],
      emptyTitle: 'No football cards matched your filters',
      emptyCopy: 'Try a broader player search, widen the year range, or clear a filter to see more football inventory.',
      searchLabel: 'Search football cards',
      searchPlaceholder: 'Player, set, team, slab, rookie, or keyword',
      helperText: 'Examples: Brady, Mahomes, rookie, auto, patch, PSA 9.'
    }
  };

  // Each page reads from a smaller source file where possible so the storefront
  // only downloads the data needed for that page. Wishlist intentionally uses the
  // full catalog so saved items can always be resolved.
  const PRODUCT_SOURCE_BY_PAGE = {
    home: 'products-featured.json',
    'shop-hub': 'products-sports.json',
    'sports-hub': 'products-sports.json',
    'sports-cards': 'products-sports.json',
    'baseball-cards': 'products-baseball.json',
    'basketball-cards': 'products-basketball.json',
    'football-cards': 'products-football.json',
    comics: 'products-comics.json',
    collectibles: 'products-collectibles.json',
    wishlist: 'products.json'
  };

  const DEFAULT_PRODUCT_SOURCE = 'products.json';
  const staticProductCache = new Map();
  const normalizedSourceCache = new Map();
  const catalogPageCache = new Map();
  const gridProductLookups = new WeakMap();
  const DEFAULT_RENDER_BATCH_SIZE = 24;
  const DESKTOP_FILTER_BREAKPOINT = 900;
  const FILTER_SIDEBAR_VISIBILITY_KEY = 'catalogSidebarVisible';
  const PAGE_RENDER_BATCH_SIZES = {
    wishlist: 18,
    collectibles: 20,
    comics: 24,
    'sports-hub': 24,
    'sports-cards': 24,
    'baseball-cards': 24,
    'basketball-cards': 24,
    'football-cards': 24
  };

  let debounceTimer = 0;
  let updateMobileFilterState = null;

  const FILTER_ATTRIBUTE_OPTIONS = ['Autograph', 'Serial Numbered', 'Memorabilia', 'Rookie'];
  const TEXT_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const SEARCH_ALIAS_RULES = [
    [/\brc\b/g, ' rookie '],
    [/\bauto\b/g, ' autograph '],
    [/\bsig\b/g, ' signature '],
    [/\bspiderman\b/g, ' spider man '],
    [/\bplayoff\b/g, ' playoffs ']
  ];

  function parseConditionDetails(rawCondition = '') {
    const raw = String(rawCondition || '').trim();
    const companyMatch = raw.match(/\b(PSA\/DNA|PSA|BGS|BVG|BCCG|SGC|CGC|CSG|HGA|GMA|ISA|BECKETT)\b/i);

    if (companyMatch) {
      const company = companyMatch[1].toUpperCase() === 'BECKETT' ? 'Beckett' : companyMatch[1].toUpperCase();
      let grade = raw.slice((companyMatch.index || 0) + companyMatch[0].length).trim();
      grade = grade.replace(/^[\s:\u2013\u2014-]+/, '').trim();
      if (!grade) grade = 'Authenticated';

      return { raw, status: 'Graded', company, grade, summary: `Graded | ${company} ${grade}`.trim(), compact: `${company} ${grade}`.trim() };
    }

    return { raw, status: 'Ungraded', company: '', grade: '', summary: 'Ungraded | Near Mint or Better', compact: 'Near Mint or Better' };
  }

  function deriveProductAttributes(item = {}) {
    const text = [item.name || '', item.description || '', item.condition || '', item.priceLabel || '', item.playerAthlete || '', item.team || '', item.legacyImageLabel || ''].join(' ').toLowerCase();
    const attributes = [];
    if (/\brookie\b|\brc\b/.test(text)) attributes.push('Rookie');
    if (/\bauto(graph)?\b|\bsigned\b|\bsignature\b|psa\/dna certified authentic/.test(text)) attributes.push('Autograph');
    if (/\bserial(?:ly)? numbered\b|\bnumbered\b|\b1\/1\b|#\/\d{1,4}\b|\/\d{1,4}\b/.test(text)) attributes.push('Serial Numbered');
    if (/\bmemorabilia\b|\brelic\b|\bjersey\b|\bpatch\b|\bmaterial\b|\bgame[- ]worn\b|\bplayer[- ]worn\b/.test(text)) attributes.push('Memorabilia');
    return attributes;
  }

  function renderAttributeTags(attributes = [], options = {}) {
    if (!Array.isArray(attributes) || !attributes.length) return '';
    const className = options.className || 'product-attribute-list';
    return `<div class="${DJ.escapeHtml(className)}">${attributes.map((attribute) => `<span class="product-attribute-pill">${DJ.escapeHtml(attribute)}</span>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Catalog metadata and filter helpers
  // ---------------------------------------------------------------------------

  function badgeLabel(category) {
    const labels = {
      Comics: 'Comic Book',
      Collectibles: 'Collectible',
      Other: 'Collectible'
    };

    return labels[category] || category;
  }

  function getProductCardContextValue(product = {}) {
    const normalizedCategory = String(product.category || '').trim().toLowerCase();

    return [product.team, product.league, product.sport, product.sourcePage]
      .map((value) => String(value || '').trim())
      .find((value) => {
        const normalizedValue = value.toLowerCase();
        return normalizedValue && normalizedValue !== normalizedCategory && normalizedValue !== 'other';
      }) || '';
  }

  function renderProductCardSummary(product, summaryId, metaLine = '') {
    const pills = [];
    const yearLabel = product.yearLabel && product.yearLabel !== 'Year not listed' ? product.yearLabel : '';
    const contextValue = getProductCardContextValue(product);

    if (yearLabel) {
      pills.push(`<span class="product-meta-pill product-meta-pill--year">${DJ.escapeHtml(yearLabel)}</span>`);
    }

    if (contextValue) {
      pills.push(`<span class="product-meta-pill product-meta-pill--context" title="${DJ.escapeHtml(contextValue)}">${DJ.escapeHtml(contextValue)}</span>`);
    }

    if (!pills.length) {
      return `
        <div class="product-card-summary" id="${summaryId}">
          <span class="sr-only">${DJ.escapeHtml(metaLine || product.category || 'Catalog listing')}</span>
        </div>
      `;
    }

    return `
      <div class="product-card-summary" id="${summaryId}">
        <div class="product-meta-pills">
          ${pills.join('')}
        </div>
      </div>
    `;
  }

  function renderProductCardFlags(product) {
    const flags = [];
    const galleryCount = Array.isArray(product.imageGallery)
      ? product.imageGallery.filter(Boolean).length
      : (product.image ? 1 : 0);
    const copyCount = Number(product.copyCount);

    if (galleryCount > 1) {
      flags.push(`<span class="product-media-flag">${galleryCount} photos</span>`);
    }

    if (Number.isFinite(copyCount) && copyCount > 1) {
      flags.push(`<span class="product-media-flag">${copyCount} copies</span>`);
    }

    return flags.length
      ? `<div class="product-media-flags" aria-hidden="true">${flags.join('')}</div>`
      : '';
  }

  function renderProductCardMetaExtras(product = {}) {
    const details = [];
    const sourceLabel = String(product.sourcePage || '').trim();
    const athlete = String(product.playerAthlete || '').trim();

    if (athlete && !String(product.name || '').toLowerCase().includes(athlete.toLowerCase())) {
      details.push(`<span class="product-meta-inline">${DJ.escapeHtml(athlete)}</span>`);
    }

    if (sourceLabel) {
      details.push(`<span class="product-meta-inline">${DJ.escapeHtml(sourceLabel)}</span>`);
    }

    return `
      ${details.length ? `<div class="product-meta-inline-list">${details.join('')}</div>` : ''}
    `;
  }

  function getTeamFacetLabel(config = {}) {
    if (config.teamLabel) return config.teamLabel;
    const page = document.body.dataset.page || '';
    if ((config.allowedCategories || []).length === 1 && config.allowedCategories[0] === 'Comics') return 'Publisher';
    if (['sports-cards', 'baseball-cards', 'basketball-cards', 'football-cards'].includes(page)) return 'Team';
    return 'Team / Publisher';
  }

  function parseMultiValueParams(params, key) {
    const values = params.getAll(key)
      .flatMap((value) => String(value || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set(values)];
  }

  function normalizeFacetValue(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'value';
  }

  function cssEscapeValue(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value)
      .split('\\').join('\\\\')
      .split('"').join('\\"');
  }

  function getCheckedFacetValues(name) {
    return Array.from(document.querySelectorAll(`input[name=\"${name}\"]:checked`)).map((input) => input.value);
  }

  function getRenderBatchSize(page = document.body.dataset.page || '') {
    return PAGE_RENDER_BATCH_SIZES[page] || DEFAULT_RENDER_BATCH_SIZE;
  }

  function createFacetCountMap(products, resolver) {
    const countMap = new Map();

    (Array.isArray(products) ? products : []).forEach((product) => {
      const rawValues = typeof resolver === 'function' ? resolver(product) : product?.[resolver];
      const values = Array.isArray(rawValues) ? rawValues : [rawValues];

      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((value) => {
          countMap.set(value, (countMap.get(value) || 0) + 1);
        });
    });

    return countMap;
  }

  function toCountedFacetOptions(values = [], countMap = new Map(), selectedValues = []) {
    const selected = new Set(selectedValues);

    return (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => ({ value, count: countMap.get(value) || 0, selected: selected.has(value) }))
      .sort((left, right) => {
        if (left.selected !== right.selected) return left.selected ? -1 : 1;
        if (left.count !== right.count) return right.count - left.count;
        return TEXT_COLLATOR.compare(left.value, right.value);
      });
  }

  function getSortLabel(value = 'nameAsc') {
    const labels = {
      nameAsc: 'Name A to Z',
      nameDesc: 'Name Z to A',
      priceAsc: 'Price low to high',
      priceDesc: 'Price high to low',
      yearAsc: 'Oldest first',
      yearDesc: 'Newest first'
    };

    return labels[value] || value;
  }

  function extractSearchSuggestions(text = '') {
    return [...new Set(
      String(text || '')
        .replace(/^examples?:\s*/i, '')
        .replace(/\.$/, '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )].slice(0, 5);
  }

  function normalizeSearchString(value = '') {
    let normalized = String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/#/g, ' number ')
      .replace(/([a-z])(\d)/gi, '$1 $2')
      .replace(/(\d)([a-z])/gi, '$1 $2');

    SEARCH_ALIAS_RULES.forEach(([pattern, replacement]) => {
      normalized = normalized.replace(pattern, replacement);
    });

    return normalized
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function tokenizeSearchString(value = '') {
    return [...new Set(
      normalizeSearchString(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 1 || /^\d+$/.test(token))
    )];
  }

  function matchesSearchQuery(product, query) {
    const normalizedQuery = normalizeSearchString(query);
    if (!normalizedQuery) return true;

    const searchableText = product?._searchNormalized || normalizeSearchString(product?._search || '');
    if (searchableText.includes(normalizedQuery)) {
      return true;
    }

    return tokenizeSearchString(query).every((token) => searchableText.includes(token));
  }

  function getBrowseActionForPage(page = document.body.dataset.page || '') {
    const links = {
      'sports-hub': { href: 'sports-cards.html', label: 'Browse all sports cards' },
      'sports-cards': { href: 'sports-cards.html', label: 'Browse all sports cards' },
      'baseball-cards': { href: 'sports-cards.html', label: 'Browse all sports cards' },
      'basketball-cards': { href: 'sports-cards.html', label: 'Browse all sports cards' },
      'football-cards': { href: 'sports-cards.html', label: 'Browse all sports cards' },
      comics: { href: 'comics.html', label: 'Browse comics' },
      collectibles: { href: 'collectibles.html', label: 'Browse collectibles' },
      wishlist: { href: 'sports-cards.html', label: 'Browse sports cards' }
    };

    return links[page] || { href: 'sports-cards.html', label: 'Browse sports cards' };
  }

  function getTopCountEntry(countMap = new Map(), minimumCount = 1) {
    return [...countMap.entries()]
      .filter(([value, count]) => value && count >= minimumCount)
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return TEXT_COLLATOR.compare(left[0], right[0]);
      })[0] || null;
  }

  function getMeaningfulTeamEntry(products = []) {
    const genericValues = new Set(['baseball', 'basketball', 'football', 'comics', 'collectibles', 'other', 'sports cards']);
    return [...createFacetCountMap(products, '_teamFacet').entries()]
      .filter(([value, count]) => {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized && !genericValues.has(normalized) && count >= 2;
      })
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return TEXT_COLLATOR.compare(left[0], right[0]);
      })[0] || null;
  }

  function formatRangeLabel(minimum, maximum, formatter) {
    if (minimum == null && maximum == null) return 'Mixed';
    if (minimum != null && maximum != null) {
      return minimum === maximum
        ? formatter(minimum)
        : `${formatter(minimum)}-${formatter(maximum)}`;
    }

    if (minimum != null) {
      return `${formatter(minimum)}+`;
    }

    return `Up to ${formatter(maximum)}`;
  }

  function buildCatalogMetrics(products = []) {
    const records = Array.isArray(products) ? products : [];
    const years = records.map((product) => Number(product.year)).filter(Number.isFinite);

    return {
      totalCount: records.length,
      yearMin: years.length ? Math.min(...years) : null,
      yearMax: years.length ? Math.max(...years) : null
    };
  }

  function buildFacetMarkup({ name, label, options, selectedValues = [], emptyText = 'No options available', collapsedCount = 5 }) {
    const selected = new Set(selectedValues);
    const normalizedOptions = (Array.isArray(options) ? options : []).map((option) => (
      typeof option === 'string'
        ? { value: option, count: null }
        : { value: option?.value, count: option?.count ?? null }
    )).filter((option) => option.value);
    const hasOptions = normalizedOptions.length > 0;
    const shouldCollapse = hasOptions && normalizedOptions.length > collapsedCount;

    if (!hasOptions) {
      return `
        <label class="facet-label-row"><span>${DJ.escapeHtml(label)}</span></label>
        <div class="locked-filter-note locked-filter-note--empty">${DJ.escapeHtml(emptyText)}</div>
      `;
    }

    return `
      <label class="facet-label-row">
        <span>${DJ.escapeHtml(label)}</span>
        <span class="facet-label-meta">${normalizedOptions.length} option${normalizedOptions.length === 1 ? '' : 's'}</span>
      </label>
      <div class="facet-group${shouldCollapse ? ' facet-group--collapsible' : ''}" data-facet-name="${DJ.escapeHtml(name)}">
        <div class="facet-options">
          ${normalizedOptions.map((option, index) => `
            <label class="facet-option${index >= collapsedCount ? ' facet-option--extra' : ''}">
              <input type="checkbox" name="${DJ.escapeHtml(name)}" value="${DJ.escapeHtml(option.value)}"${selected.has(option.value) ? ' checked' : ''}>
              <span>
                <span class="facet-option-text">${DJ.escapeHtml(option.value)}</span>
                ${option.count != null ? `<span class="facet-option-count">${DJ.escapeHtml(`(${option.count})`)}</span>` : ''}
              </span>
            </label>
          `).join('')}
        </div>
        ${shouldCollapse ? '<button type="button" class="facet-toggle" aria-expanded="false">Show more</button>' : ''}
      </div>
    `;
  }

  function getFacetOptions(products, key, options = {}) {
    const values = products
      .map((product) => product[key])
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const unique = [...new Set(values)];
    return options.sort === false ? unique : unique.sort((left, right) => TEXT_COLLATOR.compare(left, right));
  }

  /**
   * Normalize raw product records into a single predictable shape used by the UI.
   * That lets the storefront mix static JSON, local overrides, and remote rows
   * without every rendering function needing to understand each source format.
   */
  function normalizeProducts(items) {
    return items.map((item) => {
      const category = item.category || 'Other';
      const price = item.price === '' || item.price === undefined ? null : item.price;
      const numericYear = Number(item.year);
      const year = Number.isFinite(numericYear) && numericYear > 0 ? numericYear : null;
      const yearLabel = year ? String(year) : 'Year not listed';
      const team = item.team || category;
      const rawCondition = item.condition || '';
      const conditionInfo = parseConditionDetails(rawCondition);
      const description = item.description || '';
      const searchableDescription = description.replace(/\s+/g, ' ').trim().slice(0, 280);
      const sport = item.sport || (category === 'Collectibles' ? 'Other' : category);
      const league = item.league || '';
      const playerAthlete = item.playerAthlete || '';
      const photoHostPageUrl = item.photoHostPageUrl || '';
      const image = item.image || DJ.fallbackByCategory[category] || DJ.fallbackByCategory.Other;
      const attributes = deriveProductAttributes(item);

      return {
        ...item,
        category,
        price,
        year,
        yearLabel,
        team,
        rawCondition,
        condition: conditionInfo.summary,
        conditionFacet: conditionInfo.status,
        conditionCompany: conditionInfo.company,
        conditionGrade: conditionInfo.grade,
        conditionCompact: conditionInfo.compact,
        description,
        sport,
        league,
        playerAthlete,
        photoHostPageUrl,
        image,
        attributes,
        _price: DJ.numericPrice({ price }),
        _conditionLower: conditionInfo.status.toLowerCase(),
        _teamFacet: String(item.team || '').trim(),
        _searchNormalized: normalizeSearchString([
          item.name || '',
          team,
          category,
          sport,
          league,
          playerAthlete,
          searchableDescription,
          yearLabel,
          conditionInfo.summary,
          attributes.join(' ')
        ].join(' ')),
        _search: [
          item.name || '',
          team,
          category,
          sport,
          league,
          playerAthlete,
          searchableDescription,
          yearLabel,
          conditionInfo.summary,
          attributes.join(' ')
        ].join(' ').toLowerCase()
      };
    });
  }

  function getProductSource(page = document.body.dataset.page || '') {
    return PRODUCT_SOURCE_BY_PAGE[page] || DEFAULT_PRODUCT_SOURCE;
  }

  async function getCatalogPageProducts(config = {}) {
    const source = getProductSource();
    const allowedKey = Array.isArray(config.allowedCategories) && config.allowedCategories.length
      ? config.allowedCategories.join('|')
      : 'all';
    const cacheKey = `${source}::${allowedKey}`;

    if (catalogPageCache.has(cacheKey)) {
      return catalogPageCache.get(cacheKey);
    }

    const allProducts = await loadProducts({ source });
    const allowedProducts = config.allowedCategories && config.allowedCategories.length
      ? allProducts.filter((product) => config.allowedCategories.includes(product.category))
      : allProducts;

    const context = { allProducts, allowedProducts };
    catalogPageCache.set(cacheKey, context);
    return context;
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  /**
   * Fetch a static JSON source once and cache the pending promise so repeated calls
   * do not trigger duplicate network requests during the same page lifecycle.
   */
  async function fetchStaticProducts(source) {
    if (staticProductCache.has(source)) {
      return staticProductCache.get(source);
    }

    const pendingRequest = (async () => {
      const response = await fetch(source, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })();

    staticProductCache.set(source, pendingRequest);

    try {
      return await pendingRequest;
    } catch (error) {
      staticProductCache.delete(source);
      throw error;
    }
  }

  function getPreloadedProductsForSource(source) {
    return typeof DJ.getPreloadedProductsForSource === 'function'
      ? DJ.getPreloadedProductsForSource(source)
      : null;
  }

  async function loadPreloadedProductsForSource(source) {
    return typeof DJ.loadPreloadedProductsForSource === 'function'
      ? DJ.loadPreloadedProductsForSource(source)
      : null;
  }

  async function getBestAvailableSourceResult(source) {
    const preloaded = getPreloadedProductsForSource(source);
    if (preloaded) {
      return { products: preloaded, origin: 'preloaded' };
    }

    if (window.location.protocol === 'file:') {
      const localBundleProducts = await loadPreloadedProductsForSource(source).catch(() => null);
      if (localBundleProducts) {
        return { products: localBundleProducts, origin: 'preloaded-bundle' };
      }
    }

    if (DJ.remoteCatalog?.isConfigured()) {
      const remote = await DJ.remoteCatalog.listProducts({
        source,
        featuredOnly: source === 'products-featured.json'
      });

      if (Array.isArray(remote)) {
        return { products: remote, origin: 'remote' };
      }
    }

    return {
      products: await fetchStaticProducts(source),
      origin: 'static'
    };
  }

  function shouldApplyBrowserCatalogMutations(origin) {
    return origin !== 'remote';
  }

  /**
   * Keep the stored wishlist aligned with the currently available catalog.
   * This prevents deleted or backend-removed listings from inflating badge counts
   * on pages outside the dedicated wishlist view.
   */
  function reconcileWishlistIds(products, options = {}) {
    const shouldPersist = options.persist !== false;
    const validIds = new Set((Array.isArray(products) ? products : []).map((product) => Number(product.id)).filter(Number.isFinite));
    const currentWishlist = DJ.getWishlist();
    const reconciledWishlist = currentWishlist.filter((productId) => validIds.has(Number(productId)));

    if (shouldPersist && reconciledWishlist.length !== currentWishlist.length) {
      DJ.setWishlist(reconciledWishlist);
    }

    return reconciledWishlist;
  }

  /**
   * Load products from the configured source, preferring the remote backend when it
   * is enabled, while still falling back to static JSON if the backend is offline.
   */
  async function loadProducts(options = {}) {
    const source = options.source || getProductSource();

    if (!options.force && normalizedSourceCache.has(source)) {
      return normalizedSourceCache.get(source);
    }

    const pending = (async () => {
      try {
        const { products: sourceProducts, origin } = await getBestAvailableSourceResult(source);
        const mergedProducts = shouldApplyBrowserCatalogMutations(origin)
          ? DJ.applyStoredCatalogMutations(sourceProducts, { includeCustomProducts: true })
          : sourceProducts;
        const normalizedProducts = normalizeProducts(mergedProducts);

        if (source === DEFAULT_PRODUCT_SOURCE) {
          reconcileWishlistIds(normalizedProducts, { persist: true });
        }

        return normalizedProducts;
      } catch (error) {
        console.error(`Failed to load products from ${source}:`, error);

        const preloadedFallback = getPreloadedProductsForSource(source)
          || await loadPreloadedProductsForSource(source).catch(() => null);
        const fallbackProducts = preloadedFallback || await fetchStaticProducts(source).catch(() => []);
        const mergedFallback = DJ.applyStoredCatalogMutations(fallbackProducts, { includeCustomProducts: true });
        const normalizedFallback = normalizeProducts(mergedFallback);

        if (source === DEFAULT_PRODUCT_SOURCE) {
          reconcileWishlistIds(normalizedFallback, { persist: true });
        }

        return normalizedFallback;
      }
    })();

    normalizedSourceCache.set(source, pending);

    try {
      return await pending;
    } catch (error) {
      normalizedSourceCache.delete(source);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Product card rendering and interaction helpers
  // ---------------------------------------------------------------------------

  function renderProductCard(product, wishlistIds) {
    const isWishlisted = wishlistIds.has(Number(product.id));
    const heart = isWishlisted ? '\u2665' : '\u2661';
    const metaLine = [product.yearLabel || product.year || '', product.team || product.category]
      .filter(Boolean)
      .map((part) => DJ.escapeHtml(part))
      .join(' | ');
    const fallback = DJ.fallbackByCategory[product.category] || DJ.fallbackByCategory.Other;
    const summaryId = `product-card-summary-${product.id}`;
    const displayPrice = DJ.displayPrice(product);
    const priceLabel = /contact/i.test(displayPrice) ? 'Availability' : 'Price';
    const hasHostedPhotos = Boolean(product.photoHostPageUrl);
    const pricingClass = /contact/i.test(displayPrice) ? 'product-pricing product-pricing--inquiry' : 'product-pricing';

    return `
      <article class="product-card" data-product-id="${product.id}" data-product-category="${DJ.escapeHtml(product.category)}" role="button" tabindex="0" aria-label="View details for ${DJ.escapeHtml(product.name)}" aria-describedby="${summaryId}" aria-haspopup="dialog">
        <div class="product-media">
          ${renderProductCardFlags(product)}
          <img src="${DJ.escapeHtml(DJ.safeAssetUrl(product.image))}" data-fallback-src="${DJ.escapeHtml(DJ.safeAssetUrl(fallback))}" alt="${DJ.escapeHtml(product.name)}" loading="lazy" decoding="async">
          <button type="button" class="wishlist-button${isWishlisted ? ' filled' : ''}" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}" title="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">${heart}</button>
          <span class="product-view-hint" aria-hidden="true">Open details</span>
        </div>
        <div class="product-content">
          <h4>${DJ.escapeHtml(product.name)}</h4>
          <div class="product-card-chip-rail">
            <div class="product-topline">
              <span class="product-badge">${DJ.escapeHtml(badgeLabel(product.category))}</span>
              <span class="product-meta product-grade-meta">${DJ.escapeHtml(product.conditionCompact)}</span>
            </div>
            ${renderProductCardSummary(product, summaryId, metaLine)}
            ${renderProductCardMetaExtras(product)}
            ${renderAttributeTags(product.attributes)}
            ${hasHostedPhotos ? `
              <div class="product-link-row product-link-row--inline">
                <button type="button" class="product-mini-link photos-button" aria-label="Open hosted photos for ${DJ.escapeHtml(product.name)}">Hosted Photos</button>
              </div>
            ` : ''}
          </div>
          <div class="product-card-footer">
            <div class="${pricingClass}">
              <span class="product-price-label">${DJ.escapeHtml(priceLabel)}</span>
              <div class="product-price">${DJ.escapeHtml(displayPrice)}</div>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderLoadingProductCards(count = 4) {
    return Array.from({ length: Math.max(1, count) }, () => `
      <article class="product-card product-card--loading" aria-hidden="true">
        <div class="product-media">
          <span class="product-skeleton product-skeleton--image"></span>
        </div>
        <div class="product-content">
          <span class="product-skeleton product-skeleton--title"></span>
          <span class="product-skeleton product-skeleton--title product-skeleton--title-short"></span>
          <div class="product-card-chip-rail">
            <div class="product-topline">
              <span class="product-skeleton product-skeleton--badge"></span>
              <span class="product-skeleton product-skeleton--meta"></span>
            </div>
            <div class="product-card-summary">
              <div class="product-meta-pills">
                <span class="product-skeleton product-skeleton--pill"></span>
                <span class="product-skeleton product-skeleton--pill product-skeleton--pill-wide"></span>
              </div>
            </div>
            <div class="product-meta-inline-list">
              <span class="product-skeleton product-skeleton--pill"></span>
              <span class="product-skeleton product-skeleton--pill"></span>
            </div>
          </div>
          <div class="product-card-footer">
            <div class="product-pricing">
              <span class="product-skeleton product-skeleton--label"></span>
              <span class="product-skeleton product-skeleton--price"></span>
            </div>
          </div>
        </div>
      </article>
    `).join('');
  }

  function renderProductGridLoadingState(container, options = {}) {
    if (!container) return;
    const count = Number.isFinite(Number(options.count)) ? Number(options.count) : 4;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = renderLoadingProductCards(count);
  }

  function clearProductGridLoadingState(container) {
    if (!container) return;
    container.removeAttribute('aria-busy');
  }

  function setCatalogLoadingState(message = 'Loading inventory...') {
    const resultsCount = document.getElementById('resultsCount');
    const resultsSummary = document.getElementById('resultsSummary');
    const resultsLive = document.getElementById('resultsLive');
    const activeFiltersWrap = document.getElementById('activeFilters');

    if (resultsCount) resultsCount.textContent = 'Loading...';
    if (resultsSummary) resultsSummary.textContent = message;
    if (resultsLive) resultsLive.textContent = message;
    if (activeFiltersWrap) activeFiltersWrap.innerHTML = '';
  }

  function buyNow(product) {
    const currentPageUrl = window.location.href.split('#')[0];
    const subject = encodeURIComponent(`Purchase Inquiry: ${product.name}`);
    const body = encodeURIComponent(
      `Hello DJ,

I'm interested in "${product.name}" (${product.yearLabel || product.year || 'Year not listed'}, ${product.condition || 'Condition not listed'}) listed for ${DJ.displayPrice(product)}.

Listing ID: ${product.id || 'Not listed'}
Page: ${document.title}
URL: ${currentPageUrl}

Please let me know if it is still available.

Thank you.`
    );
    window.location.href = `mailto:contact@djshouseofcards-comics.com?subject=${subject}&body=${body}`;
  }

  function openHostedPhotos(product) {
    if (!product?.photoHostPageUrl) return;
    window.open(product.photoHostPageUrl, '_blank', 'noopener,noreferrer');
  }

  function toggleWishlist(productId) {
    const wishlist = DJ.getWishlist();
    const index = wishlist.indexOf(productId);

    if (index > -1) wishlist.splice(index, 1);
    else wishlist.push(productId);

    DJ.setWishlist(wishlist);
    refreshWishlistButtons();
  }

  function refreshWishlistButtons(scope = document, wishlistIds = new Set(DJ.getWishlist().map(Number))) {
    scope.querySelectorAll('.product-card').forEach((card) => {
      const productId = Number(card.dataset.productId);
      const button = card.querySelector('.wishlist-button');
      if (!button) return;

      const isWishlisted = wishlistIds.has(productId);
      button.classList.toggle('filled', isWishlisted);
      button.textContent = isWishlisted ? '\u2665' : '\u2661';
      button.setAttribute('aria-label', isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
    });

    DJ.updateWishlistCount();
  }

  function createProductLookup(products = []) {
    return new Map(
      (Array.isArray(products) ? products : [])
        .map((product) => [Number(product.id), product])
        .filter(([productId]) => Number.isFinite(productId))
    );
  }

  /**
   * Keep direct-ID views aligned with the caller's requested order instead of the
   * underlying catalog order returned by a fallback source.
   */
  function sortProductsByIdOrder(products = [], orderedIds = []) {
    const productsById = createProductLookup(products);
    return orderedIds
      .map((productId) => productsById.get(Number(productId)))
      .filter(Boolean);
  }

  function attachGridHandlers(container, products, options = {}) {
    if (!container) return;
    gridProductLookups.set(container, createProductLookup(products));

    container.onclick = (event) => {
      const loadMoreAction = event.target.closest('[data-load-more]');
      if (loadMoreAction) {
        options.onRequestMore?.(loadMoreAction.dataset.loadMore || 'next');
        return;
      }

      const emptyReset = event.target.closest('[data-empty-reset]');
      if (emptyReset) {
        options.onResetFilters?.();
        return;
      }

      const productCard = event.target.closest('.product-card');
      if (!productCard) return;

      const productId = Number(productCard.dataset.productId);
      const product = gridProductLookups.get(container)?.get(productId);
      if (!product) return;

      if (event.target.closest('.wishlist-button')) {
        toggleWishlist(productId);
        if (document.body.dataset.page === 'wishlist') renderWishlistPage();
        return;
      }

      if (event.target.closest('.buy-button')) {
        buyNow(product);
        return;
      }

      if (event.target.closest('.photos-button')) {
        openHostedPhotos(product);
        return;
      }

      if (event.target.closest('.details-button')) {
        openModal(product);
        return;
      }

      openModal(product);
    };

    if (container.dataset.cardKeyboardBound === 'true') return;
    container.dataset.cardKeyboardBound = 'true';
    container.addEventListener('keydown', (event) => {
      const productCard = event.target.closest('.product-card');
      if (!productCard) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('button, a, input, select, textarea')) return;

      const productId = Number(productCard.dataset.productId);
      const product = gridProductLookups.get(container)?.get(productId);
      if (!product) return;

      event.preventDefault();
      openModal(product);
    });
  }

  function filterLabel(label, value) {
    return `${label}: ${value}`;
  }

  // ---------------------------------------------------------------------------
  // Results summary and active-filter UI
  // ---------------------------------------------------------------------------

  function renderActiveFilters(filters, config = {}) {
    const activeFilters = [];
    const teamLabel = getTeamFacetLabel(config);
    const addFilter = (key, label, value, tone = 'default') => {
      activeFilters.push({ key, label, value, tone });
    };

    if (filters.filterText) addFilter('filterText', 'Search', `"${filters.filterText}"`, 'search');
    filters.conditions.forEach((value) => addFilter(`condition::${encodeURIComponent(value)}`, 'Condition', value, 'facet'));
    filters.attributes.forEach((value) => addFilter(`attribute::${encodeURIComponent(value)}`, 'Attribute', value, 'facet'));
    filters.teams.forEach((value) => addFilter(`team::${encodeURIComponent(value)}`, teamLabel, value, 'facet'));
    if (filters.yearMin != null) addFilter('yearMin', 'Year from', filters.yearMin, 'range');
    if (filters.yearMax != null) addFilter('yearMax', 'Year to', filters.yearMax, 'range');
    if (filters.priceMin != null) addFilter('priceMin', 'Min price', DJ.currency(filters.priceMin), 'range');
    if (filters.priceMax != null) addFilter('priceMax', 'Max price', DJ.currency(filters.priceMax), 'range');
    if (filters.sort && filters.sort !== 'nameAsc') {
      const sortNames = {
        nameDesc: 'Name Z-A',
        priceAsc: 'Price Low-High',
        priceDesc: 'Price High-Low',
        yearAsc: 'Year Old-New',
        yearDesc: 'Year New-Old'
      };
      addFilter('sort', 'Sort', getSortLabel(filters.sort), 'sort');
    }

    return activeFilters;
  }

  function updateResultsMeta(filters, count, config = {}, renderState = {}) {
    const resultsSummary = document.getElementById('resultsSummary');
    const activeFiltersWrap = document.getElementById('activeFilters');
    const resultsLive = document.getElementById('resultsLive');
    if (!resultsSummary && !activeFiltersWrap && !resultsLive) return;

    const activeFilters = renderActiveFilters(filters, config);
    const totalCount = Number.isFinite(Number(renderState.totalCount)) ? Number(renderState.totalCount) : count;
    const summaryText = totalCount > count
      ? `${count} of ${totalCount} item${totalCount === 1 ? '' : 's'} shown`
      : `${count} item${count === 1 ? '' : 's'} shown`;
    const longSummary = activeFilters.length
      ? `${summaryText}. ${activeFilters.length} filter${activeFilters.length === 1 ? '' : 's'} active.`
      : `${summaryText}. Showing all available items.`;

    if (resultsSummary) resultsSummary.textContent = longSummary;
    if (resultsLive) resultsLive.textContent = longSummary;

    if (activeFiltersWrap) {
      activeFiltersWrap.innerHTML = activeFilters.map((item) => `
        <button type="button" class="filter-chip filter-chip--removable" data-clear-filter="${DJ.escapeHtml(item.key)}" aria-label="Clear ${DJ.escapeHtml(item.label)} filter">
          <span>${DJ.escapeHtml(filterLabel(item.label, item.value))}</span>
          <span class="filter-chip-x" aria-hidden="true">&times;</span>
        </button>
      `).join('');
    }

    if (typeof updateMobileFilterState === 'function') {
      updateMobileFilterState(filters, count, config);
    }
  }

  function getCurrentFilters() {
    const numericFieldValue = (id) => {
      const raw = String(document.getElementById(id)?.value || '').trim();
      if (!raw) return null;
      const numericValue = Number(raw);
      return Number.isFinite(numericValue) ? numericValue : null;
    };

    let yearMin = numericFieldValue('yearMin');
    let yearMax = numericFieldValue('yearMax');
    let priceMin = numericFieldValue('priceMin');
    let priceMax = numericFieldValue('priceMax');

    if (yearMin != null && yearMax != null && yearMin > yearMax) {
      [yearMin, yearMax] = [yearMax, yearMin];
      const yearMinField = document.getElementById('yearMin');
      const yearMaxField = document.getElementById('yearMax');
      if (yearMinField) yearMinField.value = String(yearMin);
      if (yearMaxField) yearMaxField.value = String(yearMax);
    }

    if (priceMin != null && priceMax != null && priceMin > priceMax) {
      [priceMin, priceMax] = [priceMax, priceMin];
      const priceMinField = document.getElementById('priceMin');
      const priceMaxField = document.getElementById('priceMax');
      if (priceMinField) priceMinField.value = String(priceMin);
      if (priceMaxField) priceMaxField.value = String(priceMax);
    }

    return {
      filterText: String(document.getElementById('searchInput')?.value || '').trim(),
      conditions: getCheckedFacetValues('condition'),
      attributes: getCheckedFacetValues('attribute'),
      teams: getCheckedFacetValues('team'),
      yearMin,
      yearMax,
      priceMin,
      priceMax,
      sort: document.getElementById('sortSelect')?.value || 'nameAsc'
    };
  }

  function syncFiltersToUrl(filters) {
    const url = new URL(window.location.href);
    ['search', 'condition', 'attribute', 'team', 'yearMin', 'yearMax', 'priceMin', 'priceMax', 'sort'].forEach((key) => {
      url.searchParams.delete(key);
    });

    if (filters.filterText) url.searchParams.set('search', filters.filterText);
    filters.conditions.forEach((value) => url.searchParams.append('condition', value));
    filters.attributes.forEach((value) => url.searchParams.append('attribute', value));
    filters.teams.forEach((value) => url.searchParams.append('team', value));
    if (filters.yearMin != null) url.searchParams.set('yearMin', String(filters.yearMin));
    if (filters.yearMax != null) url.searchParams.set('yearMax', String(filters.yearMax));
    if (filters.priceMin != null) url.searchParams.set('priceMin', String(filters.priceMin));
    if (filters.priceMax != null) url.searchParams.set('priceMax', String(filters.priceMax));
    if (filters.sort && filters.sort !== 'nameAsc') url.searchParams.set('sort', filters.sort);

    const nextSearch = url.searchParams.toString();
    const currentSearch = window.location.search.replace(/^\?/, '');
    if (nextSearch !== currentSearch) {
      const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }

  function applyUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    const initial = {
      filterText: params.get('search') || '',
      conditions: parseMultiValueParams(params, 'condition'),
      attributes: parseMultiValueParams(params, 'attribute'),
      teams: parseMultiValueParams(params, 'team'),
      yearMin: params.get('yearMin'),
      yearMax: params.get('yearMax'),
      priceMin: params.get('priceMin'),
      priceMax: params.get('priceMax'),
      sort: params.get('sort') || 'nameAsc'
    };

    const allowedSorts = new Set(['nameAsc', 'nameDesc', 'priceAsc', 'priceDesc', 'yearAsc', 'yearDesc']);
    if (!allowedSorts.has(initial.sort)) {
      initial.sort = 'nameAsc';
    }

    const valueMap = {
      searchInput: initial.filterText,
      yearMin: initial.yearMin,
      yearMax: initial.yearMax,
      priceMin: initial.priceMin,
      priceMax: initial.priceMax,
      sortSelect: initial.sort
    };

    Object.entries(valueMap).forEach(([id, value]) => {
      if (value == null || value === '') return;
      const field = document.getElementById(id);
      if (field) field.value = value;
    });

    return initial;
  }

  function removeCategoryField() {
    const categorySelect = document.getElementById('categoryFilter');
    if (!categorySelect) return;

    const fieldGroup = categorySelect.closest('.field-group');
    fieldGroup?.remove();
  }

  // ---------------------------------------------------------------------------
  // Facet/filter construction
  // ---------------------------------------------------------------------------

  function mountFacetFilters(products, config, initialFilters) {
    const allowedProducts = Array.isArray(products) ? products : [];

    const conditionSelect = document.getElementById('conditionFilter');
    const conditionGroup = conditionSelect?.closest('.field-group');

    removeCategoryField();

    if (conditionGroup) {
      const conditionCountMap = createFacetCountMap(allowedProducts, (product) => product.conditionFacet);
      conditionGroup.classList.add('field-group--facet');
      conditionGroup.innerHTML = buildFacetMarkup({
        name: 'condition',
        label: 'Condition',
        options: toCountedFacetOptions(['Graded', 'Ungraded'], conditionCountMap, initialFilters.conditions),
        selectedValues: initialFilters.conditions,
        collapsedCount: 5
      });
    }

    let attributeGroup = document.getElementById('attributeFacetGroup');
    if (!attributeGroup && conditionGroup) {
      attributeGroup = document.createElement('div');
      attributeGroup.id = 'attributeFacetGroup';
      attributeGroup.className = 'field-group field-group--facet';
      conditionGroup.insertAdjacentElement('afterend', attributeGroup);
    }

    if (attributeGroup) {
      const availableAttributes = FILTER_ATTRIBUTE_OPTIONS.filter((attribute) => allowedProducts.some((product) => product.attributes.includes(attribute)));
      const attributeCountMap = createFacetCountMap(allowedProducts, (product) => product.attributes);
      attributeGroup.innerHTML = buildFacetMarkup({
        name: 'attribute',
        label: 'Attributes',
        options: toCountedFacetOptions(availableAttributes, attributeCountMap, initialFilters.attributes),
        selectedValues: initialFilters.attributes,
        emptyText: 'No enhanced attributes are available for this page yet.',
        collapsedCount: 5
      });
    }

    let teamGroup = document.getElementById('teamFacetGroup');
    if (!teamGroup && (attributeGroup || conditionGroup)) {
      teamGroup = document.createElement('div');
      teamGroup.id = 'teamFacetGroup';
      teamGroup.className = 'field-group field-group--facet';
      (attributeGroup || conditionGroup).insertAdjacentElement('afterend', teamGroup);
    }

    if (teamGroup) {
      const teamOptions = toCountedFacetOptions(
        getFacetOptions(allowedProducts, '_teamFacet'),
        createFacetCountMap(allowedProducts, '_teamFacet'),
        initialFilters.teams
      );
      teamGroup.innerHTML = buildFacetMarkup({
        name: 'team',
        label: getTeamFacetLabel(config),
        options: teamOptions,
        selectedValues: initialFilters.teams,
        emptyText: 'No team or publisher filters available for this page yet.',
        collapsedCount: 5
      });
    }
  }

  function enhanceFilterCopy(config) {
    const filterPanelHeader = document.querySelector('.filter-panel-header');
    const filterPanelTitle = filterPanelHeader?.querySelector('h2');
    const filterPanelDescription = filterPanelHeader?.querySelector('p');
    const searchInput = document.getElementById('searchInput');
    const filterHelp = document.getElementById('filterHelp');
    const searchLabel = document.querySelector('label[for="searchInput"]');
    const clearButton = document.getElementById('clearFilters');
    const sortSelect = document.getElementById('sortSelect');

    if (filterPanelTitle) filterPanelTitle.textContent = 'Filters';
    filterPanelDescription?.remove();
    removeCategoryField();
    if (searchLabel && config.searchLabel) searchLabel.textContent = config.searchLabel;
    if (searchInput && config.searchPlaceholder) searchInput.placeholder = config.searchPlaceholder;
    if (filterHelp && config.helperText) filterHelp.textContent = config.helperText;
    if (clearButton) clearButton.textContent = 'Reset all filters';
    if (sortSelect) {
      Array.from(sortSelect.options).forEach((option) => {
        option.textContent = getSortLabel(option.value);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Progressive enhancements for the filter UI
  // ---------------------------------------------------------------------------

  function decorateSearchField(config = {}) {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    const fieldGroup = searchInput.closest('.field-group');
    const filterHelp = document.getElementById('filterHelp');

    let shell = searchInput.parentElement;
    if (!shell.classList.contains('search-shell')) {
      shell = document.createElement('div');
      shell.className = 'search-shell';
      searchInput.parentNode.insertBefore(shell, searchInput);
      shell.appendChild(searchInput);
    }

    let clearButton = shell.querySelector('.search-clear');
    if (!clearButton) {
      clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'search-clear';
      clearButton.setAttribute('aria-label', 'Clear search');
      clearButton.textContent = '\u00D7';
      clearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
      });
      shell.appendChild(clearButton);
    }

    let shortcut = shell.querySelector('.search-shortcut');
    if (!shortcut) {
      shortcut = document.createElement('span');
      shortcut.className = 'search-shortcut';
      shortcut.setAttribute('aria-hidden', 'true');
      shortcut.textContent = '/';
      shell.appendChild(shortcut);
    }

    const syncState = () => {
      shell.classList.toggle('has-value', Boolean(searchInput.value.trim()));
    };

    syncState();
    searchInput.addEventListener('input', syncState);

    if (!fieldGroup) return;

    let suggestions = fieldGroup.querySelector('.search-suggestions');
    suggestions?.remove();
  }

  function addToolbarActions() {
    const resultsToolbar = document.getElementById('resultsToolbar');
    if (!resultsToolbar || resultsToolbar.querySelector('.toolbar-actions')) return;
    const page = document.body.dataset.page || '';

    const wrap = document.createElement('div');
    wrap.className = 'toolbar-actions';

    const contactLink = document.createElement('a');
    contactLink.className = 'mini-link-button mini-link-button--primary';
    contactLink.href = 'contact.html';
    contactLink.textContent = page === 'comics'
      ? 'Ask about a comic'
      : page === 'collectibles'
        ? 'Ask about an item'
        : 'Ask about a card';

    const wishlistLink = document.createElement('a');
    wishlistLink.className = 'mini-link-button mini-link-button--accent';
    wishlistLink.href = 'wishlist.html';
    wishlistLink.textContent = 'Open wishlist';

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'mini-link-button';
    resetButton.textContent = 'Reset filters';
    resetButton.addEventListener('click', () => document.getElementById('clearFilters')?.click());

    wrap.appendChild(contactLink);
    wrap.appendChild(wishlistLink);
    wrap.appendChild(resetButton);
    resultsToolbar.appendChild(wrap);
  }

  /**
   * The catalog HTML starts as simple, static markup for resilience. This helper
   * upgrades that markup into the interactive desktop drawer/results shell.
   */
  function ensureCatalogBrowseLayout() {
    const filterPanel = document.querySelector('.filter-panel');
    const resultsToolbar = document.getElementById('resultsToolbar');
    const productContainer = document.getElementById('productContainer');
    const container = filterPanel?.parentElement;

    if (!filterPanel || !resultsToolbar || !productContainer || !container) return null;

    container.classList.add('catalog-browse-layout');
    filterPanel.id = filterPanel.id || 'catalogFiltersPanel';
    filterPanel.classList.add('filter-panel--drawer');

    let dismissButton = filterPanel.querySelector('.filter-panel-dismiss');
    if (!dismissButton) {
      dismissButton = document.createElement('button');
      dismissButton.type = 'button';
      dismissButton.className = 'filter-panel-dismiss';
      dismissButton.setAttribute('aria-label', 'Close filters');
      dismissButton.innerHTML = '&times;';
      filterPanel.prepend(dismissButton);
    }

    let browseShell = container.querySelector('.catalog-browse-shell');
    if (!browseShell) {
      browseShell = document.createElement('div');
      browseShell.className = 'catalog-browse-shell';
      container.insertBefore(browseShell, filterPanel);
    }

    if (filterPanel.parentElement !== browseShell) {
      browseShell.insertBefore(filterPanel, browseShell.firstChild);
    }

    let resultsColumn = browseShell.querySelector('.catalog-results-column');
    if (!resultsColumn) {
      resultsColumn = document.createElement('div');
      resultsColumn.className = 'catalog-results-column';
      browseShell.appendChild(resultsColumn);
    }

    if (resultsToolbar.parentElement !== resultsColumn) {
      resultsColumn.appendChild(resultsToolbar);
    }

    if (productContainer.parentElement !== resultsColumn) {
      resultsColumn.appendChild(productContainer);
    }

    const supportCallout = document.getElementById('catalogSupportCallout');
    if (supportCallout && supportCallout.parentElement !== resultsColumn) {
      resultsColumn.appendChild(supportCallout);
    } else if (supportCallout && supportCallout.previousElementSibling !== productContainer) {
      resultsColumn.appendChild(supportCallout);
    }

    return { container, browseShell, resultsColumn, dismissButton };
  }

  function readStoredSidebarVisibility() {
    try {
      return localStorage.getItem(FILTER_SIDEBAR_VISIBILITY_KEY);
    } catch (error) {
      return null;
    }
  }

  function writeStoredSidebarVisibility(isVisible) {
    try {
      localStorage.setItem(FILTER_SIDEBAR_VISIBILITY_KEY, isVisible ? 'visible' : 'hidden');
    } catch (error) {
      // Ignore storage failures; the toggle should still work for the current session.
    }
  }

  /**
   * Drives the desktop filter drawer with one side-arrow control. The same state
   * class is shared by the hero and product grid so both resize together.
   */
  function setupFilterSidebarToggle() {
    const browseShell = document.querySelector('.catalog-browse-shell');
    const filterPanel = document.querySelector('.filter-panel');
    const dismissButton = filterPanel?.querySelector('.filter-panel-dismiss');
    if (!browseShell || !filterPanel || filterPanel.dataset.sidebarToggleBound === 'true') return;

    filterPanel.dataset.sidebarToggleBound = 'true';
    document.body.classList.add('catalog-sidebar-ready');

    let sidebarVisible = readStoredSidebarVisibility() !== 'hidden';
    let dockToggle = document.getElementById('catalogSidebarDockToggle');
    if (!dockToggle) {
      dockToggle = document.createElement('button');
      dockToggle.type = 'button';
      dockToggle.id = 'catalogSidebarDockToggle';
      document.body.appendChild(dockToggle);
    }

    dockToggle.className = 'catalog-sidebar-dock-toggle';
    dockToggle.setAttribute('aria-controls', filterPanel.id);
    if (!dockToggle.querySelector('.catalog-sidebar-dock-toggle__chevron')) {
      dockToggle.innerHTML = `
        <span class="sr-only">Toggle filters</span>
        <span class="catalog-sidebar-dock-toggle__chevron" aria-hidden="true"></span>
      `;
    }

    const handleToggleRequest = () => {
      if (window.innerWidth <= DESKTOP_FILTER_BREAKPOINT) {
        document.querySelector('.mobile-filter-trigger')?.click();
        return;
      }

      sidebarVisible = !sidebarVisible;
      syncState({ persist: true });
    };

    const syncState = ({ persist = false } = {}) => {
      const isDesktop = window.innerWidth > DESKTOP_FILTER_BREAKPOINT;
      const collapseSidebar = isDesktop && !sidebarVisible;

      // Body-level state lets CSS resize content that lives outside the product
      // grid, especially the product-page hero above the filter/results shell.
      browseShell.classList.toggle('filters-collapsed', collapseSidebar);
      document.body.classList.toggle('filters-sidebar-open', isDesktop && !collapseSidebar);
      document.body.classList.toggle('filters-sidebar-collapsed', isDesktop && collapseSidebar);
      filterPanel.setAttribute('aria-hidden', String(collapseSidebar));

      if ('inert' in filterPanel) {
        filterPanel.inert = collapseSidebar;
      }

      if (dockToggle) {
        dockToggle.hidden = !isDesktop;
        dockToggle.setAttribute('aria-expanded', String(!collapseSidebar));
        dockToggle.setAttribute('aria-label', collapseSidebar ? 'Open filters' : 'Close filters');
        dockToggle.title = collapseSidebar ? 'Open filters' : 'Close filters';
      }

      if (persist && isDesktop) {
        writeStoredSidebarVisibility(!collapseSidebar);
      }
    };

    if (dockToggle.dataset.toggleBound !== 'true') {
      dockToggle.dataset.toggleBound = 'true';
      dockToggle.addEventListener('click', handleToggleRequest);
    }

    if (dismissButton && dismissButton.dataset.bound !== 'true') {
      dismissButton.dataset.bound = 'true';
      dismissButton.addEventListener('click', () => {
        if (window.innerWidth <= DESKTOP_FILTER_BREAKPOINT) {
          document.body.classList.remove('filters-open');
          return;
        }

        sidebarVisible = false;
        syncState({ persist: true });
        dockToggle.focus();
      });
    }

    window.addEventListener('resize', () => {
      syncState();
    });

    syncState();
  }

  function ensureFilterEnhancements() {
    const filterPanel = document.querySelector('.filter-panel');
    if (!filterPanel) return null;

    filterPanel.querySelector('.filter-panel-quick-picks')?.remove();
    filterPanel.querySelector('.filter-panel-insights')?.remove();
    return { quickPicks: null, insights: null };
  }

  function updateFilterEnhancements(products, filteredProducts, filters, config = {}) {
    const ui = ensureFilterEnhancements();
    if (!ui) return;
  }

  function ensureCatalogHeroEnhancements() {
    const heroCard = document.querySelector('.page-hero-card');
    if (!heroCard) return null;

    heroCard.classList.add('catalog-hero-card--streamlined');

    let insightGrid = heroCard.querySelector('.catalog-hero-insight-grid');
    insightGrid?.remove();

    let support = heroCard.querySelector('.catalog-hero-support');
    if (!support) {
      support = document.createElement('div');
      support.className = 'catalog-hero-support';
      const utilityRow = heroCard.querySelector('.utility-row');
      if (utilityRow) utilityRow.insertAdjacentElement('afterend', support);
      else heroCard.appendChild(support);
    }

    let summary = heroCard.querySelector('.catalog-hero-summary');
    if (!summary) {
      summary = document.createElement('p');
      summary.className = 'catalog-hero-summary';
      support.appendChild(summary);
    } else if (summary.parentElement !== support) {
      support.appendChild(summary);
    }

    let actions = heroCard.querySelector('.catalog-hero-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'catalog-hero-actions';
      support.appendChild(actions);
    } else if (actions.parentElement !== support) {
      support.appendChild(actions);
    }

    return { heroCard, support, summary, actions };
  }

  function updateCatalogHero(products, filteredProducts, filters, config = {}) {
    const ui = ensureCatalogHeroEnhancements();
    if (!ui) return;

    const page = document.body.dataset.page || '';
    const metrics = buildCatalogMetrics(products);
    const filteredMetrics = buildCatalogMetrics(filteredProducts);
    const activeFilterCount = renderActiveFilters(filters, config).length;
    const fullYearRange = metrics.yearMin != null
      ? formatRangeLabel(metrics.yearMin, metrics.yearMax, (value) => String(value))
      : 'Mixed eras';
    const filteredYearRange = filteredProducts.length && filteredMetrics.yearMin != null
      ? formatRangeLabel(
          filteredMetrics.yearMin,
          filteredMetrics.yearMax,
          (value) => String(value)
        )
      : null;
    const heroDirection = activeFilterCount
      ? `Showing ${filteredProducts.length} listing${filteredProducts.length === 1 ? '' : 's'}${filteredYearRange ? ` from ${filteredYearRange}` : ''}. Use the filters on the left to refine the results or clear them to widen the browse view.`
      : `Browse ${products.length} listing${products.length === 1 ? '' : 's'}${fullYearRange ? ` spanning ${fullYearRange}` : ''}. Use the filter rail to narrow by search, condition, team, year, and price.`;
    const inquiryLabel = page === 'comics'
      ? 'Ask about a comic'
      : page === 'collectibles'
        ? 'Ask about an item'
        : 'Ask about a card';

    ui.summary.textContent = heroDirection;

    ui.actions.innerHTML = `
      <a class="button" href="#resultsToolbar">Browse listings</a>
      <a class="button-ghost" href="contact.html">${DJ.escapeHtml(inquiryLabel)}</a>
    `;
  }

  function insertCatalogSupportCallout(config = {}) {
    const productContainer = document.getElementById('productContainer');
    if (!productContainer || document.getElementById('catalogSupportCallout')) return;

    const page = document.body.dataset.page || '';
    const supportCopyByPage = {
      comics: {
        title: 'Need help finding a key issue or favorite run?',
        copy: 'Reach out if you are looking for a specific book, publisher, issue range, or collector-friendly bundle.',
        primaryLabel: 'Contact DJ about comics'
      },
      collectibles: {
        title: 'Looking for a specific collectible or memorabilia piece?',
        copy: 'Ask about availability, similar items, bundle options, or selling and trade conversations.',
        primaryLabel: 'Contact DJ about collectibles'
      }
    };

    const supportCopy = supportCopyByPage[page] || {
      title: 'Need help tracking down a player, team, or graded card?',
      copy: 'Use the contact page to ask about availability, similar inventory, bundles, want lists, or trade opportunities.',
      primaryLabel: 'Contact DJ about cards'
    };

    const callout = document.createElement('aside');
    callout.id = 'catalogSupportCallout';
    callout.className = 'catalog-support-callout panel';
    callout.innerHTML = `
      <div class="catalog-support-copy">
        <span class="catalog-support-kicker">Collector help</span>
        <h3>${DJ.escapeHtml(supportCopy.title)}</h3>
        <p>${DJ.escapeHtml(supportCopy.copy)}</p>
      </div>
      <div class="catalog-support-actions">
        <a class="button" href="contact.html">${DJ.escapeHtml(supportCopy.primaryLabel)}</a>
        <a class="button-secondary" href="wishlist.html">Review saved items</a>
      </div>
    `;

    productContainer.insertAdjacentElement('afterend', callout);
  }

  function setupSearchShortcuts() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput || document.body.dataset.searchShortcutBound === 'true') return;

    document.body.dataset.searchShortcutBound = 'true';
    document.addEventListener('keydown', (event) => {
      const activeElement = document.activeElement;
      const isTypingInField = activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
      const commandShortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      const slashShortcut = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;

      if ((!commandShortcut && !slashShortcut) || isTypingInField) return;

      event.preventDefault();
      searchInput.focus();
      if (typeof searchInput.select === 'function') searchInput.select();
    });
  }

  function debounce(callback, delay = 90) {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => callback(), delay);
  }

  /**
   * Render a category page once, then keep filtering in-memory. This keeps the UI
   * responsive because filter changes do not require additional network requests.
   */
  async function renderCatalogPage(config = {}) {
    const productContainer = document.getElementById('productContainer');
    if (!productContainer) return;

    const { allowedProducts } = await getCatalogPageProducts(config);

    const filters = getCurrentFilters();
    const searchTerm = filters.filterText.trim().toLowerCase();
    const selectedConditions = new Set(filters.conditions.map((value) => value.toLowerCase()));
    const selectedAttributes = filters.attributes;
    const selectedTeams = new Set(filters.teams);

    let filteredProducts = allowedProducts.filter((product) => {
      const matchesSearch = !searchTerm || matchesSearchQuery(product, searchTerm);
      const matchesCondition = !selectedConditions.size || selectedConditions.has(product._conditionLower);
      const matchesAttributes = !selectedAttributes.length || selectedAttributes.every((attribute) => product.attributes.includes(attribute));
      const matchesTeam = !selectedTeams.size || selectedTeams.has(product._teamFacet);
      const matchesYearMin = filters.yearMin == null || product.year >= filters.yearMin;
      const matchesYearMax = filters.yearMax == null || product.year <= filters.yearMax;
      const matchesPriceMin = filters.priceMin == null || (product._price != null && product._price >= filters.priceMin);
      const matchesPriceMax = filters.priceMax == null || (product._price != null && product._price <= filters.priceMax);

      return matchesSearch && matchesCondition && matchesAttributes && matchesTeam && matchesYearMin && matchesYearMax && matchesPriceMin && matchesPriceMax;
    });

    filteredProducts.sort((left, right) => {
      switch (filters.sort) {
        case 'priceAsc':
          return (left._price ?? Number.POSITIVE_INFINITY) - (right._price ?? Number.POSITIVE_INFINITY);
        case 'priceDesc':
          return (right._price ?? Number.NEGATIVE_INFINITY) - (left._price ?? Number.NEGATIVE_INFINITY);
        case 'yearAsc':
          return (left.year ?? Number.POSITIVE_INFINITY) - (right.year ?? Number.POSITIVE_INFINITY);
        case 'yearDesc':
          return (right.year ?? Number.NEGATIVE_INFINITY) - (left.year ?? Number.NEGATIVE_INFINITY);
        case 'nameDesc':
          return TEXT_COLLATOR.compare(right.name, left.name);
        default:
          return TEXT_COLLATOR.compare(left.name, right.name);
      }
    });

    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) resultsCount.textContent = `${filteredProducts.length} item${filteredProducts.length === 1 ? '' : 's'} found`;

    updateResultsMeta(filters, filteredProducts.length, config, { totalCount: allowedProducts.length });
    updateFilterEnhancements(allowedProducts, filteredProducts, filters, config);
    updateCatalogHero(allowedProducts, filteredProducts, filters, config);
    syncFiltersToUrl(filters);

    if (!filteredProducts.length) {
      const emptyTitle = config.emptyTitle || document.body.dataset.emptyTitle || 'No items matched your filters';
      const emptyCopy = config.emptyCopy || document.body.dataset.emptyCopy || 'Try widening the year or price range, or clear a few filters and search again.';
      clearProductGridLoadingState(productContainer);
      productContainer.innerHTML = `
        <div class="empty-state">
          <h3>${DJ.escapeHtml(emptyTitle)}</h3>
          <p>${DJ.escapeHtml(emptyCopy)}</p>
        </div>
      `;
      DJ.applyLazyLoading(productContainer);
      return;
    }

    const wishlistIds = new Set(DJ.getWishlist().map(Number));
    clearProductGridLoadingState(productContainer);
    productContainer.innerHTML = filteredProducts.map((product) => renderProductCard(product, wishlistIds)).join('');
    attachGridHandlers(productContainer, filteredProducts);
    DJ.updateWishlistCount();
    DJ.applyLazyLoading(productContainer);
  }

  function clearSpecificFilter(filterKey, config) {
    if (filterKey.startsWith('condition::')) {
      const value = decodeURIComponent(filterKey.split('::')[1] || '');
      const input = document.querySelector(`input[name="condition"][value="${cssEscapeValue(value)}"]`);
      if (input) input.checked = false;
    } else if (filterKey.startsWith('attribute::')) {
      const value = decodeURIComponent(filterKey.split('::')[1] || '');
      const input = document.querySelector(`input[name="attribute"][value="${cssEscapeValue(value)}"]`);
      if (input) input.checked = false;
    } else if (filterKey.startsWith('team::')) {
      const value = decodeURIComponent(filterKey.split('::')[1] || '');
      const input = document.querySelector(`input[name="team"][value="${cssEscapeValue(value)}"]`);
      if (input) input.checked = false;
    } else {
      const inputMap = {
        filterText: 'searchInput',
        yearMin: 'yearMin',
        yearMax: 'yearMax',
        priceMin: 'priceMin',
        priceMax: 'priceMax',
        sort: 'sortSelect'
      };

      const fieldId = inputMap[filterKey];
      if (!fieldId) return;
      const field = document.getElementById(fieldId);
      if (!field) return;

      if (filterKey === 'sort') field.value = 'nameAsc';
      else field.value = '';

      if (filterKey === 'filterText') field.focus();
    }

    renderCatalogPage(config);
  }

  function bindActiveFilterActions(config) {
    const activeFiltersWrap = document.getElementById('activeFilters');
    if (!activeFiltersWrap || activeFiltersWrap.dataset.bound === 'true') return;

    activeFiltersWrap.dataset.bound = 'true';
    activeFiltersWrap.addEventListener('click', (event) => {
      const button = event.target.closest('[data-clear-filter]');
      if (!button) return;
      clearSpecificFilter(button.dataset.clearFilter, config);
    });
  }

  function setupResponsiveMobileUX(config) {
    setupMobileFilterDrawer(config);
    setupScrollableMobileRails();
  }

  function setupScrollableMobileRails() {
    ['.catalog-switcher', '.breadcrumb-list'].forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (!node) return;
        node.setAttribute('tabindex', '0');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Responsive/mobile UX helpers
  // ---------------------------------------------------------------------------

  function setupMobileFilterDrawer(config) {
    const filterPanel = document.querySelector('.filter-panel');
    if (!filterPanel || filterPanel.dataset.mobileDrawerBound === 'true') return;

    const MOBILE_BREAKPOINT = 900;

    filterPanel.dataset.mobileDrawerBound = 'true';
    filterPanel.id = filterPanel.id || 'catalogFiltersPanel';

    const panelFooter = document.createElement('div');
    panelFooter.className = 'mobile-filter-actions';
    panelFooter.innerHTML = `
      <button type="button" class="button-secondary mobile-filter-reset">Reset all</button>
      <button type="button" class="button mobile-filter-done">Done</button>
    `;

    filterPanel.append(panelFooter);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'mobile-filter-trigger';
    trigger.setAttribute('aria-controls', filterPanel.id);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span class="mobile-filter-trigger__copy">
        <span class="mobile-filter-trigger__title">Filters</span>
        <span class="mobile-filter-trigger__meta">All items</span>
      </span>
      <span class="mobile-filter-trigger__icon" aria-hidden="true">&#9776;</span>
    `;

    filterPanel.parentNode.insertBefore(trigger, filterPanel);

    const overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'mobile-filter-overlay';
    overlay.setAttribute('aria-label', 'Close filters');
    filterPanel.insertAdjacentElement('afterend', overlay);

    const resetButton = panelFooter.querySelector('.mobile-filter-reset');
    const doneButton = panelFooter.querySelector('.mobile-filter-done');
    const closeButton = filterPanel.querySelector('.filter-panel-dismiss');

    const syncTrigger = (filters = getCurrentFilters(), count = null, activeConfig = config) => {
      const activeCount = renderActiveFilters(filters, activeConfig).length;
      const titleNode = trigger.querySelector('.mobile-filter-trigger__title');
      const metaNode = trigger.querySelector('.mobile-filter-trigger__meta');
      if (titleNode) titleNode.textContent = activeCount ? `Filters (${activeCount})` : 'Filters';
      if (metaNode) {
        if (count == null) {
          metaNode.textContent = activeCount ? `${activeCount} active` : 'All items';
        } else {
          metaNode.textContent = activeCount ? `${count} shown | ${activeCount} active` : `${count} shown`;
        }
      }
    };

    updateMobileFilterState = syncTrigger;

    const syncDrawerAccessibility = () => {
      const isMobileViewport = window.innerWidth <= MOBILE_BREAKPOINT;
      const isDrawerOpen = document.body.classList.contains('filters-open');

      trigger.hidden = !isMobileViewport;
      overlay.hidden = !isMobileViewport || !isDrawerOpen;

      if (!isMobileViewport) {
        trigger.setAttribute('aria-expanded', 'false');
        filterPanel.setAttribute('aria-hidden', 'false');
        document.body.classList.remove('filters-open');
        return;
      }

      filterPanel.setAttribute('aria-hidden', String(!isDrawerOpen));
      trigger.setAttribute('aria-expanded', String(isDrawerOpen));
    };

    const closeDrawer = ({ restoreFocus = true } = {}) => {
      document.body.classList.remove('filters-open');
      syncDrawerAccessibility();
      if (restoreFocus && !trigger.hidden) trigger.focus();
    };

    const openDrawer = () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) return;
      DJ.setLastFocusedElement(trigger);
      document.body.classList.add('filters-open');
      syncDrawerAccessibility();
      window.setTimeout(() => {
        filterPanel.querySelector('input, select, textarea, button:not(.filter-panel-dismiss)')?.focus();
      }, 60);
    };

    trigger.addEventListener('click', () => {
      if (document.body.classList.contains('filters-open')) closeDrawer();
      else openDrawer();
    });

    [overlay, closeButton, doneButton].forEach((node) => {
      node?.addEventListener('click', () => closeDrawer());
    });

    resetButton?.addEventListener('click', () => {
      document.getElementById('clearFilters')?.click();
      syncTrigger();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > MOBILE_BREAKPOINT && document.body.classList.contains('filters-open')) {
        closeDrawer({ restoreFocus: false });
        return;
      }

      syncDrawerAccessibility();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.body.classList.contains('filters-open')) {
        closeDrawer();
      }
    });

    filterPanel.addEventListener('input', (event) => {
      if (event.target.matches('#searchInput, #yearMin, #yearMax, #priceMin, #priceMax')) syncTrigger();
    });

    filterPanel.addEventListener('change', (event) => {
      if (event.target.matches('input[type=\"checkbox\"], select')) syncTrigger();
    });

    syncTrigger();
    syncDrawerAccessibility();
  }

  // ---------------------------------------------------------------------------
  // Page entry points
  // ---------------------------------------------------------------------------

  async function setupCatalogPage() {
    const page = document.body.dataset.page || 'shop';
    const config = PAGE_CONFIG[page] || PAGE_CONFIG.shop;
    const productContainer = document.getElementById('productContainer');
    if (!productContainer) return;

    renderProductGridLoadingState(productContainer, {
      count: Math.min(8, getRenderBatchSize(page))
    });
    setCatalogLoadingState('Loading live inventory...');

    const initialFilters = applyUrlFilters();

    // Build the visual shell before the network request completes so the page
    // never flashes the old top-stacked filter layout during slow backend loads.
    enhanceFilterCopy(config);
    ensureCatalogBrowseLayout();
    decorateSearchField(config);
    addToolbarActions();
    setupFilterSidebarToggle();
    insertCatalogSupportCallout(config);
    setupSearchShortcuts();
    setupResponsiveMobileUX(config);

    const { allowedProducts } = await getCatalogPageProducts(config);

    mountFacetFilters(allowedProducts, config, initialFilters);
    bindActiveFilterActions(config);

    const rerender = () => renderCatalogPage(config);
    const filterPanel = document.querySelector('.filter-panel');

    if (filterPanel && filterPanel.dataset.catalogBindings !== 'true') {
      filterPanel.dataset.catalogBindings = 'true';

      filterPanel.addEventListener('input', (event) => {
        if (event.target.matches('#searchInput, #yearMin, #yearMax, #priceMin, #priceMax')) {
          debounce(rerender);
        }
      });

      filterPanel.addEventListener('change', (event) => {
        if (event.target.matches('input[type=\"checkbox\"], select')) {
          rerender();
        }
      });

        filterPanel.addEventListener('click', (event) => {
          const toggle = event.target.closest('.facet-toggle');
          if (!toggle) return;
          const facetGroup = toggle.closest('.facet-group');
          if (!facetGroup) return;
          const expanded = facetGroup.classList.toggle('is-expanded');
          toggle.setAttribute('aria-expanded', String(expanded));
          toggle.textContent = expanded ? 'Show less' : 'Show more';
        });
      }

    const clearButton = document.getElementById('clearFilters');
    if (clearButton && clearButton.dataset.bound !== 'true') {
      clearButton.dataset.bound = 'true';
      clearButton.addEventListener('click', async () => {
        ['searchInput', 'yearMin', 'yearMax', 'priceMin', 'priceMax'].forEach((id) => {
          const field = document.getElementById(id);
          if (field) field.value = '';
        });

        document.querySelectorAll('input[name=\"condition\"], input[name=\"attribute\"], input[name=\"team\"]').forEach((input) => {
          input.checked = false;
        });

        const sortField = document.getElementById('sortSelect');
        if (sortField) sortField.value = 'nameAsc';

          document.querySelectorAll('.facet-group.is-expanded').forEach((group) => group.classList.remove('is-expanded'));
          document.querySelectorAll('.facet-toggle').forEach((toggle) => {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.textContent = 'Show more';
          });

        await renderCatalogPage(config);
        document.getElementById('searchInput')?.focus();
      });
    }

    await renderCatalogPage(config);
  }

  async function renderWishlistPage() {
    const wishlistContainer = document.getElementById('wishlistContainer');
    if (!wishlistContainer) return;
    const wishlistPageCount = document.getElementById('wishlistPageCount');
    const storedWishlist = DJ.getWishlist().map(Number);

    if (wishlistPageCount) {
      wishlistPageCount.textContent = `${storedWishlist.length} saved item${storedWishlist.length === 1 ? '' : 's'}`;
    }

    if (!storedWishlist.length) {
      wishlistContainer.innerHTML = `
        <div class="empty-state">
          <h3>Your wishlist is empty</h3>
          <p>Tap the heart icon on any listing to save it here for later.</p>
          <div class="inline-actions">
            <a class="button" href="sports-cards.html">Browse Sports Cards</a>
          </div>
        </div>
      `;
      DJ.updateWishlistCount();
      DJ.applyLazyLoading(wishlistContainer);
      return;
    }

    if (wishlistPageCount) {
      wishlistPageCount.textContent = `Loading ${storedWishlist.length} saved item${storedWishlist.length === 1 ? '' : 's'}...`;
    }
    renderProductGridLoadingState(wishlistContainer, {
      count: Math.min(6, Math.max(2, storedWishlist.length))
    });

    let wishlistProducts = [];
    let loadedWishlistFromRemote = false;

    if (DJ.remoteCatalog?.isConfigured()) {
      try {
        const remoteWishlistProducts = await DJ.remoteCatalog.listProducts({
          source: DEFAULT_PRODUCT_SOURCE,
          ids: storedWishlist
        });
        wishlistProducts = normalizeProducts(remoteWishlistProducts);
        loadedWishlistFromRemote = true;
      } catch (error) {
        console.error('Failed to load wishlist products from Supabase:', error);
      }
    }

    if (!loadedWishlistFromRemote) {
      const allProducts = await loadProducts({ source: DEFAULT_PRODUCT_SOURCE });
      const wishlistIdSet = new Set(storedWishlist);
      wishlistProducts = allProducts.filter((product) => wishlistIdSet.has(Number(product.id)));
    }

    wishlistProducts = sortProductsByIdOrder(wishlistProducts, storedWishlist);

    const availableIds = new Set(wishlistProducts.map((product) => Number(product.id)).filter(Number.isFinite));
    const reconciledWishlist = storedWishlist.filter((productId) => availableIds.has(productId));

    // Prune stale wishlist ids when products were deleted, hidden, or removed from
    // the current catalog so the saved count matches what the user can actually view.
    if (reconciledWishlist.length !== storedWishlist.length) {
      DJ.setWishlist(reconciledWishlist);
    }

    const wishlistIds = new Set(reconciledWishlist);
    wishlistProducts = sortProductsByIdOrder(
      wishlistProducts.filter((product) => wishlistIds.has(Number(product.id))),
      reconciledWishlist
    );

    if (wishlistPageCount) {
      wishlistPageCount.textContent = `${wishlistProducts.length} saved item${wishlistProducts.length === 1 ? '' : 's'}`;
    }

    if (!wishlistProducts.length) {
      clearProductGridLoadingState(wishlistContainer);
      wishlistContainer.innerHTML = `
        <div class="empty-state">
          <h3>Your wishlist is empty</h3>
          <p>Tap the heart icon on any listing to save it here for later.</p>
          <div class="inline-actions">
            <a class="button" href="sports-cards.html">Browse Sports Cards</a>
          </div>
        </div>
      `;
      DJ.applyLazyLoading(wishlistContainer);
      return;
    }

    clearProductGridLoadingState(wishlistContainer);
    wishlistContainer.innerHTML = wishlistProducts.map((product) => renderProductCard(product, wishlistIds)).join('');
    attachGridHandlers(wishlistContainer, wishlistProducts);
    DJ.updateWishlistCount();
    DJ.applyLazyLoading(wishlistContainer);
  }

  // ---------------------------------------------------------------------------
  // Product details modal
  // ---------------------------------------------------------------------------

  function bindModalMagnifier(modalInner, fallback) {
    const stage = modalInner.querySelector('#modalImageStage');
    const mainImage = modalInner.querySelector('#modalMainImage');
    const zoomPane = modalInner.querySelector('#modalZoomPane');
    const zoomToggle = modalInner.querySelector('#modalMagnifyToggle');

    if (!stage || !mainImage || !zoomPane || !zoomToggle) return;

    const setZoomSource = (src) => {
      const safeSource = DJ.safeAssetUrl(src || mainImage.getAttribute('src') || fallback);
      zoomPane.style.backgroundImage = `url("${safeSource}")`;
    };

    const updateZoom = (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.min(Math.max(0, (clientX - rect.left) / rect.width), 1);
      const y = Math.min(Math.max(0, (clientY - rect.top) / rect.height), 1);
      zoomPane.style.backgroundPosition = `${x * 100}% ${y * 100}%`;
    };

    zoomToggle.addEventListener('click', () => {
      const nextState = !stage.classList.contains('is-zoom-active');
      stage.classList.toggle('is-zoom-active', nextState);
      zoomToggle.setAttribute('aria-pressed', String(nextState));
      zoomToggle.textContent = nextState ? 'Hide Magnifier' : 'Magnify';
    });

    stage.addEventListener('mousemove', (event) => {
      if (!stage.classList.contains('is-zoom-active')) return;
      updateZoom(event.clientX, event.clientY);
    });

    stage.addEventListener('touchmove', (event) => {
      if (!stage.classList.contains('is-zoom-active') || !event.touches[0]) return;
      updateZoom(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: true });

    mainImage.addEventListener('load', () => setZoomSource(mainImage.currentSrc || mainImage.src));
    setZoomSource(mainImage.currentSrc || mainImage.src);
  }

  function openModal(product) {
    const modal = document.getElementById('productModal');
    const modalInner = document.getElementById('modalInner');
    if (!modal || !modalInner) return;

    DJ.setLastFocusedElement(document.activeElement);

    const gallery = Array.isArray(product.imageGallery) && product.imageGallery.length
      ? product.imageGallery
      : [product.image];
    const fallback = DJ.fallbackByCategory[product.category] || DJ.fallbackByCategory.Other;
    const wishlistIds = new Set(DJ.getWishlist().map(Number));

    modalInner.innerHTML = `
      <div class="modal-layout">
        <div class="modal-media">
          <div class="modal-image-stage" id="modalImageStage">
            <img id="modalMainImage" src="${DJ.escapeHtml(DJ.safeAssetUrl(gallery[0]))}" data-fallback-src="${DJ.escapeHtml(DJ.safeAssetUrl(fallback))}" alt="${DJ.escapeHtml(product.name)}">
            <button type="button" class="modal-magnify-toggle button-secondary" id="modalMagnifyToggle" aria-pressed="false">Magnify</button>
            <div class="modal-zoom-pane" id="modalZoomPane" aria-hidden="true"></div>
          </div>
          ${gallery.length > 1 ? `
            <div class="modal-thumbs" aria-label="Additional item photos">
              ${gallery.map((image, index) => `
                <button type="button" class="modal-thumb${index === 0 ? ' active' : ''}" data-gallery-src="${DJ.escapeHtml(DJ.safeAssetUrl(image))}" aria-label="View photo ${index + 1}">
                  <img src="${DJ.escapeHtml(DJ.safeAssetUrl(image))}" data-fallback-src="${DJ.escapeHtml(DJ.safeAssetUrl(fallback))}" alt="${DJ.escapeHtml(product.name)} photo ${index + 1}" loading="lazy" decoding="async">
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="modal-copy">
          <span class="product-badge">${DJ.escapeHtml(badgeLabel(product.category))}</span>
          <h3 id="modalTitle">${DJ.escapeHtml(product.name)}</h3>
          <div class="modal-meta-grid">
            <p><strong>Year:</strong> ${DJ.escapeHtml(product.yearLabel || 'Year not listed')}</p>
            <p><strong>Team / Publisher:</strong> ${DJ.escapeHtml(product.team || product.category)}</p>
            <p><strong>Sport:</strong> ${DJ.escapeHtml(product.sport || product.category)}</p>
            ${product.league ? `<p><strong>League:</strong> ${DJ.escapeHtml(product.league)}</p>` : ''}
            <p><strong>Condition:</strong> ${DJ.escapeHtml(product.condition)}</p>
            <p><strong>Price:</strong> ${DJ.escapeHtml(DJ.displayPrice(product))}</p>
          </div>
          ${renderAttributeTags(product.attributes, { className: 'modal-attribute-list' })}
          ${product.description ? `<div class="modal-description"><strong>Description</strong><p>${DJ.escapeHtml(product.description)}</p></div>` : ''}
          <div class="modal-enhanced-card">
            <strong>Enhanced item details</strong>
            <ul class="modal-enhanced-list">
              <li><span>Grade status</span><span>${DJ.escapeHtml(product.conditionFacet)}</span></li>
              <li><span>Grade detail</span><span>${DJ.escapeHtml(product.conditionCompact)}</span></li>
              <li><span>Attributes</span><span>${DJ.escapeHtml(product.attributes.length ? product.attributes.join(', ') : 'Standard listing')}</span></li>
              <li><span>Source page</span><span>${DJ.escapeHtml(product.sourcePage || 'Current catalog')}</span></li>
            </ul>
          </div>
          ${product.photoHostPageUrl ? `<p><strong>Hosted photos:</strong> <a class="product-host-link" href="${DJ.escapeHtml(product.photoHostPageUrl)}" target="_blank" rel="noopener noreferrer">Open photo host page</a></p>` : ''}
          <div class="inline-actions">
            <button type="button" class="modal-cta" id="modalBuy">Buy Now</button>
            <button type="button" class="button-secondary" id="modalWishlist">${wishlistIds.has(Number(product.id)) ? 'Remove from Wishlist' : 'Save to Wishlist'}</button>
          </div>
        </div>
      </div>
    `;

    const modalMainImage = modalInner.querySelector('#modalMainImage');
    const modalZoomPane = modalInner.querySelector('#modalZoomPane');
    modalInner.querySelectorAll('.modal-thumb').forEach((button) => {
      button.addEventListener('click', () => {
        const nextImage = button.dataset.gallerySrc;
        if (modalMainImage && nextImage) modalMainImage.src = nextImage;
        if (modalZoomPane && nextImage) modalZoomPane.style.backgroundImage = `url("${DJ.safeAssetUrl(nextImage)}")`;
        modalInner.querySelectorAll('.modal-thumb').forEach((thumb) => thumb.classList.remove('active'));
        button.classList.add('active');
      });
    });

    modalInner.querySelector('#modalBuy')?.addEventListener('click', () => buyNow(product));
    modalInner.querySelector('#modalWishlist')?.addEventListener('click', async () => {
      toggleWishlist(product.id);
      if (document.body.dataset.page === 'wishlist') {
        await renderWishlistPage();
      }
      closeModal();
    });

    bindModalMagnifier(modalInner, fallback);
    DJ.applyLazyLoading(modalInner);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.querySelector('.modal-close')?.focus());
  }

  function closeModal() {
    const modal = document.getElementById('productModal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    DJ.restoreFocus();
  }

  // ---------------------------------------------------------------------------
  // Cross-page navigation helpers inserted into catalog heroes
  // ---------------------------------------------------------------------------

  function insertDepartmentSwitcher() {
    const page = document.body.dataset.page;
    const heroCard = document.querySelector('.page-hero-card');
    if (!heroCard || heroCard.querySelector('.catalog-switcher')) return;

    const switchers = {
      'shop-hub': [
        ['sports-cards.html', 'Sports Cards'],
        ['comics.html', 'Comics'],
        ['collectibles.html', 'Collectibles']
      ],
      'sports-hub': [
        ['sports-cards.html', 'All Sports'],
        ['baseball-cards.html', 'Baseball'],
        ['basketball-cards.html', 'Basketball'],
        ['football-cards.html', 'Football']
      ],
      'sports-cards': [
        ['sports-cards.html', 'All Sports'],
        ['baseball-cards.html', 'Baseball'],
        ['basketball-cards.html', 'Basketball'],
        ['football-cards.html', 'Football']
      ],
      'baseball-cards': [
        ['sports-cards.html', 'All Sports'],
        ['baseball-cards.html', 'Baseball'],
        ['basketball-cards.html', 'Basketball'],
        ['football-cards.html', 'Football']
      ],
      'basketball-cards': [
        ['sports-cards.html', 'All Sports'],
        ['baseball-cards.html', 'Baseball'],
        ['basketball-cards.html', 'Basketball'],
        ['football-cards.html', 'Football']
      ],
      'football-cards': [
        ['sports-cards.html', 'All Sports'],
        ['baseball-cards.html', 'Baseball'],
        ['basketball-cards.html', 'Basketball'],
        ['football-cards.html', 'Football']
      ],
      comics: [
        ['sports-cards.html', 'Sports Cards'],
        ['comics.html', 'Comics'],
        ['collectibles.html', 'Collectibles']
      ],
      collectibles: [
        ['sports-cards.html', 'Sports Cards'],
        ['comics.html', 'Comics'],
        ['collectibles.html', 'Collectibles']
      ],
      wishlist: [
        ['sports-cards.html', 'Sports Cards'],
        ['comics.html', 'Comics'],
        ['collectibles.html', 'Collectibles'],
        ['wishlist.html', 'Wishlist']
      ]
    };

    const links = switchers[page];
    if (!links || !links.length) return;

    const currentHrefMap = {
      'shop-hub': 'shop.html',
      'sports-hub': 'sports-cards.html',
      'sports-cards': 'sports-cards.html',
      'baseball-cards': 'baseball-cards.html',
      'basketball-cards': 'basketball-cards.html',
      'football-cards': 'football-cards.html',
      comics: 'comics.html',
      collectibles: 'collectibles.html',
      wishlist: 'wishlist.html'
    };

    const currentHref = currentHrefMap[page];
    const nav = document.createElement('nav');
    nav.className = 'catalog-switcher';
    nav.setAttribute('aria-label', 'Browse departments');
    nav.innerHTML = links.map(([href, label]) => `
      <a href="${href}"${href === currentHref ? ' class="active" aria-current="page"' : ''}>${label}</a>
    `).join('');

    const utilityRow = heroCard.querySelector('.utility-row');
    if (utilityRow) utilityRow.insertAdjacentElement('afterend', nav);
    else heroCard.appendChild(nav);
  }

  async function renderFeaturedProducts() {
    const featuredProductsWrap = document.getElementById('featuredProducts');
    if (!featuredProductsWrap) return;

    renderProductGridLoadingState(featuredProductsWrap, { count: 4 });

    const sourceProducts = (Array.isArray(window.DJ_HOME_FEATURED_PRODUCTS)
      ? normalizeProducts(window.DJ_HOME_FEATURED_PRODUCTS)
      : null) || await loadProducts({ source: 'products-featured.json' });
    const featuredProducts = sourceProducts.slice(0, 4);
    const wishlistIds = new Set(DJ.getWishlist().map(Number));

    clearProductGridLoadingState(featuredProductsWrap);
    featuredProductsWrap.innerHTML = featuredProducts.map((product) => renderProductCard(product, wishlistIds)).join('');
    attachGridHandlers(featuredProductsWrap, featuredProducts);
    DJ.updateWishlistCount();
    DJ.applyLazyLoading(featuredProductsWrap);
  }

  // Kick off only the features that are relevant to the current page template.
  document.addEventListener('DOMContentLoaded', async () => {
    const page = document.body.dataset.page;

    if (['home', 'shop-hub', 'sports-hub', 'sports-cards', 'baseball-cards', 'basketball-cards', 'football-cards', 'comics', 'collectibles', 'wishlist'].includes(page)) {
      DJ.scheduleIdle?.(() => insertDepartmentSwitcher());
    }

    if (page === 'home') {
      await renderFeaturedProducts();
    }

    await setupCatalogPage();

    if (page === 'wishlist') {
      await renderWishlistPage();
    }

    const modal = document.getElementById('productModal');
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.classList.contains('modal-close')) closeModal();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });
  });

  window.closeModal = closeModal;
})();
