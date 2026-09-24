(() => {
  const client = window.ajjitecSupabase;
  const root = document.querySelector('#quote-print-root');
  const printButton = document.querySelector('#print-quote');
  const quoteId = new URLSearchParams(window.location.search).get('id');
  const statusLabels = {
    draft: 'Borrador',
    sent: 'Enviada',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    expired: 'Vencida',
    cancelled: 'Cancelada'
  };

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
  const money = (value, currency = 'MXN') => new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: String(currency || 'MXN').trim() || 'MXN'
  }).format(value || 0);
  const date = (value, empty = 'Sin fecha') => {
    if (!value) return empty;
    const raw = String(value);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(raw + 'T12:00:00')
      : new Date(raw);
    return Number.isNaN(parsed.getTime())
      ? empty
      : new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(parsed);
  };
  const showError = (message) => {
    root.innerHTML = '<section class="product-not-found"><p class="eyebrow">COTIZACIÓN / ACCESO</p><h1>' + escapeHtml(message) + '</h1><p>Inicia sesión con un usuario autorizado para consultar este folio.</p><a class="button button-primary" href="login.html">Iniciar sesión <span>↗</span></a></section>';
  };

  const render = (quote) => {
    const clientRelation = quote.clients;
    const clientData = clientRelation?.company ? clientRelation : clientRelation?.[0] || {};
    const items = Array.isArray(quote.quote_items)
      ? [...quote.quote_items].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      : [];
    const rows = items.map((item) => '<tr><td><code>' + escapeHtml(item.sku || '—') + '</code></td><td>' + escapeHtml(item.description) + '</td><td>' + Number(item.quantity || 0) + '</td><td>' + money(item.unit_price, quote.currency) + '</td><td>' + (Number(item.discount_percent || 0) ? Number(item.discount_percent) + '%' : '—') + '</td><td>' + money(item.line_total, quote.currency) + '</td></tr>').join('');
    const quoteNumber = 'COT-' + String(quote.quote_number).padStart(6, '0');
    document.title = quoteNumber + ' | AJJITEC';
    root.innerHTML = '<div class="quote-document-top"><div><p class="eyebrow">PROPUESTA COMERCIAL</p><h1>' + quoteNumber + '</h1><p>AJJITEC Mexicana · Ingeniería para procesos que avanzan.</p></div><div class="quote-document-status"><span>ESTADO</span><strong>' + escapeHtml(statusLabels[quote.status] || quote.status) + '</strong><small>Creada ' + escapeHtml(date(quote.created_at)) + '</small></div></div><div class="quote-document-meta"><section><p class="eyebrow">CLIENTE</p><h2>' + escapeHtml(clientData.company || 'Cliente sin asignar') + '</h2><p>' + escapeHtml(clientData.contact_name || '') + '</p><p>' + escapeHtml(clientData.email || '') + (clientData.phone ? ' · ' + escapeHtml(clientData.phone) : '') + '</p></section><section><p class="eyebrow">CONDICIONES</p><p><span>Vigencia</span><strong>' + escapeHtml(date(quote.valid_until, 'Sin límite')) + '</strong></p><p><span>IVA</span><strong>' + Number(quote.tax_rate || 0) + '%</strong></p></section></div><div class="quote-document-table"><table><thead><tr><th>SKU</th><th>Descripción</th><th>Cant.</th><th>Precio unitario</th><th>Desc.</th><th>Importe</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="quote-document-totals"><p><span>Subtotal</span><strong>' + money(quote.subtotal, quote.currency) + '</strong></p><p><span>IVA</span><strong>' + money(quote.tax, quote.currency) + '</strong></p><p class="quote-document-total"><span>Total</span><strong>' + money(quote.total, quote.currency) + '</strong></p></div>' + (quote.notes ? '<section class="quote-document-notes"><p class="eyebrow">NOTAS Y CONDICIONES</p><p>' + escapeHtml(quote.notes).replace(/\n/g, '<br />') + '</p></section>' : '') + '<footer class="quote-document-footer"><p>AJJITEC Mexicana · ventas@ajjitec.com · (55) 5566 7004</p><p>Este documento es una propuesta comercial sujeta a confirmación de disponibilidad.</p></footer>';
  };

  printButton?.addEventListener('click', () => window.print());

  const load = async () => {
    if (!client || !quoteId) return showError('No encontramos el folio solicitado.');
    const { data: user, error: userError } = await client.auth.getUser();
    if (userError || !user?.user) return window.location.replace('login.html');
    const { data: quote, error } = await client.from('quotes')
      .select('id,quote_number,status,currency,valid_until,notes,tax_rate,subtotal,tax,total,created_at,clients(company,contact_name,email,phone,address),quote_items(id,sku,description,quantity,unit_price,discount_percent,line_total,sort_order)')
      .eq('id', quoteId)
      .single();
    if (error || !quote) return showError('No pudimos encontrar esa cotización.');
    render(quote);
  };

  load();
})();
