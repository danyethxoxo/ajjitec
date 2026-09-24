(() => {
  const fallbackProducts = window.AJJITEC_PRODUCTS || [];
  const client = window.ajjitecSupabase;

  const publicImageUrl = (storagePath) => {
    if (!client || !storagePath) return '';
    return client.storage.from('product-images').getPublicUrl(storagePath).data?.publicUrl || '';
  };

  const relationName = (relation) => relation?.name || relation?.[0]?.name || '';

  const mapRemoteProduct = (item) => {
    const category = relationName(item.product_categories) || 'AJJITEC';
    const images = Array.isArray(item.product_images) ? item.product_images : [];
    const primaryImage = images.find((image) => image.is_primary) || images[0];
    return {
      slug: item.slug,
      name: item.name,
      line: category,
      category,
      description: item.description || item.short_description || '',
      image: publicImageUrl(primaryImage?.storage_path),
      catalogUrl: '',
      sourceUrl: '',
      specs: [],
      remote: true,
      price: item.price,
      currency: item.currency,
      featured: item.featured
    };
  };

  const loadProducts = async () => {
    if (!client) return fallbackProducts;
    const { data, error } = await client.from('products')
      .select('id,name,slug,short_description,description,price,currency,featured,product_categories(name),product_images(storage_path,is_primary,sort_order)')
      .eq('active', true)
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false });
    if (error || !data?.length) return fallbackProducts;

    const productsBySlug = new Map(fallbackProducts.map((product) => [product.slug, product]));
    data.map(mapRemoteProduct).forEach((product) => productsBySlug.set(product.slug, product));
    return [...productsBySlug.values()];
  };

  const subscribeToCatalog = (onChange) => {
    if (!client || typeof onChange !== 'function') return () => {};
    let channel = null;
    let retry = null;
    let active = true;
    const connect = () => {
      if (!active) return;
      channel = client.channel('ajjitec-public-catalog');
      ['product_categories', 'products', 'product_images'].forEach((table) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
      });
      channel.subscribe((status) => {
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && active && !retry) {
          retry = setTimeout(() => {
            retry = null;
            if (channel) client.removeChannel(channel);
            connect();
          }, 5000);
        }
      });
    };
    connect();
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      if (channel) client.removeChannel(channel);
    };
  };

  window.ajjitecCatalog = {
    fallbackProducts,
    loadProducts,
    subscribeToCatalog
  };
})();
