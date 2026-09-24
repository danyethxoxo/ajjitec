const productRoot = document.querySelector('#product-detail');
const productSlug = new URLSearchParams(window.location.search).get('slug');
const fallbackProducts = window.ajjitecCatalog?.fallbackProducts || window.AJJITEC_PRODUCTS || [];
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const renderProduct = (product) => {
  if (!product) {
    document.title = 'Producto no encontrado | AJJITEC';
    productRoot.innerHTML = '<section class="product-not-found"><p class="eyebrow">ERROR / 404</p><h1>Producto no encontrado.</h1><p>La ficha solicitada no está disponible.</p><a class="button button-primary" href="catalogo.html">Volver al catálogo</a></section>';
    return;
  }

  document.title = `${product.name} | AJJITEC`;
  document.querySelector('meta[name="description"]').setAttribute('content', product.description || `Ficha técnica de ${product.name}.`);
  const specs = (product.specs || []).map((spec) => `<tr><th scope="row">${escapeHtml(spec.label)}</th><td>${escapeHtml(spec.value)}</td></tr>`).join('');
  const catalogButton = product.catalogUrl ? `<a class="button button-ghost" href="${escapeHtml(product.catalogUrl)}" target="_blank" rel="noreferrer">Descargar catálogo <span>↗</span></a>` : '';
  const sourceButton = product.sourceUrl ? `<a class="text-link" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noreferrer">Ver ficha original <span>↗</span></a>` : '';
  productRoot.innerHTML = `<div class="product-breadcrumb"><a href="catalogo.html">Productos</a><span>/</span><a href="catalogo.html?line=${encodeURIComponent(product.line)}">${escapeHtml(product.line)}</a><span>/</span><span>${escapeHtml(product.name)}</span></div><section class="product-hero"><div class="product-photo"><img src="${escapeHtml(product.image || 'assets/lab-reactor.png')}" alt="${escapeHtml(product.name)}" /></div><div class="product-copy"><p class="eyebrow">${escapeHtml(product.line)} / ${escapeHtml(product.category)}</p><h1>${escapeHtml(product.name)}</h1><p>${escapeHtml(product.description || 'Consulta con nuestro equipo las características y aplicaciones disponibles para este equipo.')}</p><div class="product-actions"><a class="button button-primary" href="mailto:ventas@ajjitec.com?subject=${encodeURIComponent(`Cotización ${product.name}`)}">Solicitar cotización <span>↗</span></a>${catalogButton}</div></div></section>${specs ? `<section class="product-specs"><div><p class="eyebrow">DATOS TÉCNICOS</p><h2>Especificaciones del equipo.</h2></div><div class="spec-table-wrap"><table><tbody>${specs}</tbody></table></div></section>` : ''}<section class="product-source"><p>¿Necesitas confirmar disponibilidad, accesorios o configuración?</p><div><a class="text-link" href="index.html#contacto">Hablar con AJJITEC <span>↗</span></a>${sourceButton}</div></section>`;
};

let productRefreshPending = false;
const refreshProduct = async () => {
  if (productRefreshPending) return;
  const loadProducts = window.ajjitecCatalog?.loadProducts;
  if (!loadProducts) return;
  productRefreshPending = true;
  try {
    const products = await loadProducts();
    if (Array.isArray(products)) renderProduct(products.find((item) => item.slug === productSlug));
  } finally {
    productRefreshPending = false;
  }
};

const initializeProduct = async () => {
  const fallbackProduct = fallbackProducts.find((item) => item.slug === productSlug);
  renderProduct(fallbackProduct);
  await refreshProduct();
  const unsubscribe = window.ajjitecCatalog?.subscribeToCatalog?.(refreshProduct);
  window.addEventListener('beforeunload', () => unsubscribe?.(), { once: true });
};

initializeProduct();
