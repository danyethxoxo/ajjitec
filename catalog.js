let products = window.ajjitecCatalog?.fallbackProducts || window.AJJITEC_PRODUCTS || [];
const grid = document.querySelector('#product-grid');
const search = document.querySelector('#catalog-search');
const category = document.querySelector('#catalog-category');
const lines = document.querySelector('#catalog-lines');
const count = document.querySelector('#catalog-count');
const empty = document.querySelector('#catalog-empty');
const clear = document.querySelector('#catalog-clear');
const params = new URLSearchParams(window.location.search);
let selectedLine = params.get('line') || '';
const initialCategory = params.get('category') || '';

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const renderLines = () => {
  const lineOptions = ['', ...new Set(products.map((product) => product.line).filter(Boolean))];
  if (selectedLine && !lineOptions.includes(selectedLine)) selectedLine = '';
  lines.innerHTML = lineOptions.map((line) => `<button type="button" class="line-filter${line === selectedLine ? ' is-active' : ''}" data-line="${escapeHtml(line)}">${escapeHtml(line || 'Todos')}</button>`).join('');
};

const updateCategories = () => {
  const current = category.value;
  const options = [...new Set(products
    .filter((product) => !selectedLine || product.line === selectedLine)
    .map((product) => product.category)
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  category.innerHTML = '<option value="">Todas las categorías</option>' + options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  if (options.includes(current)) category.value = current;
  else if (options.includes(initialCategory)) category.value = initialCategory;
};

const render = () => {
  const query = normalize(search.value.trim());
  const selectedCategory = category.value;
  const filtered = products.filter((product) => {
    const haystack = normalize(`${product.name} ${product.line} ${product.category} ${product.description}`);
    return (!selectedLine || product.line === selectedLine) && (!selectedCategory || product.category === selectedCategory) && (!query || haystack.includes(query));
  });
  count.textContent = `${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'}`;
  empty.hidden = filtered.length > 0;
  grid.innerHTML = filtered.map((product) => `<article class="product-card"><a class="product-card-media" href="producto.html?slug=${encodeURIComponent(product.slug)}"><img src="${escapeHtml(product.image || 'assets/lab-reactor.png')}" alt="${escapeHtml(product.name)}" loading="lazy" /></a><div class="product-card-body"><p class="product-card-line">${escapeHtml(product.line)} / ${escapeHtml(product.category)}</p><h2><a href="producto.html?slug=${encodeURIComponent(product.slug)}">${escapeHtml(product.name)}</a></h2><p>${escapeHtml(product.description || 'Consulta la ficha técnica y aplicaciones de este equipo.')}</p><a class="product-card-link" href="producto.html?slug=${encodeURIComponent(product.slug)}">Ver producto <span>↗</span></a></div></article>`).join('');
};

lines.addEventListener('click', (event) => {
  const button = event.target.closest('[data-line]');
  if (!button) return;
  selectedLine = button.dataset.line;
  lines.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
  updateCategories();
  render();
});
search.addEventListener('input', render);
category.addEventListener('change', render);
clear.addEventListener('click', () => {
  selectedLine = '';
  search.value = '';
  renderLines();
  updateCategories();
  render();
});
document.querySelector('#year').textContent = new Date().getFullYear();
document.querySelector('.menu-toggle')?.addEventListener('click', () => {
  const nav = document.querySelector('.main-nav');
  const open = nav.classList.toggle('open');
  document.querySelector('.menu-toggle').setAttribute('aria-expanded', String(open));
});

const initializeCatalog = async () => {
  renderLines();
  updateCategories();
  render();
  const loadProducts = window.ajjitecCatalog?.loadProducts;
  if (!loadProducts) return;
  const remoteProducts = await loadProducts();
  if (!Array.isArray(remoteProducts)) return;
  products = remoteProducts;
  renderLines();
  updateCategories();
  render();
};

initializeCatalog();
