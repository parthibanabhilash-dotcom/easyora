from html import escape

SERVICES = [
    ('graphic-design', 'Graphic Design & Creative Services', [
        'Social media posters and creatives',
        'Promotional and advertising posters',
        'Logo design & brand identity',
        'Brochures, flyers and banners',
        'Business cards and company profiles',
        'Event posters and invitations',
    ], ['adobephotoshop', 'adobeillustrator', 'canva']),
    ('video-editing', 'Video Editing & Production', [
        'Instagram Reels and YouTube Shorts',
        'YouTube video editing',
        'Promotional and corporate videos',
        'Cinematic video editing',
        'Motion graphics and typography animation',
        'Event highlight videos',
    ], ['adobepremierepro', 'adobeaftereffects', 'youtube']),
    ('digital-marketing', 'Digital Marketing', [
        'Social media management',
        'Instagram and Facebook marketing',
        'SEO and Google Business Profile',
        'Google Ads and Meta Ads',
        'Content strategy and campaign management',
        'Lead generation',
    ], ['instagram', 'facebook', 'googleads', 'meta']),
    ('website-development', 'Website Development', [
        'Business and corporate websites',
        'E-commerce websites',
        'WordPress website development',
        'Landing pages',
        'Website redesign and maintenance',
        'SEO-friendly responsive websites',
    ], ['wordpress', 'shopify', 'html5']),
    ('branding', 'Branding & Visual Identity', [
        'Logo and brand identity',
        'Brand color and typography systems',
        'Brand guidelines',
        'Product and business branding',
        'Marketing presentation design',
    ], ['figma', 'adobeillustrator', 'canva']),
]

BRANDS = {
    'adobephotoshop': 'Adobe Photoshop', 'adobeillustrator': 'Adobe Illustrator',
    'adobepremierepro': 'Adobe Premiere Pro', 'adobeaftereffects': 'Adobe After Effects',
    'canva': 'Canva', 'figma': 'Figma', 'youtube': 'YouTube', 'instagram': 'Instagram',
    'facebook': 'Facebook', 'googleads': 'Google Ads', 'meta': 'Meta',
    'wordpress': 'WordPress', 'shopify': 'Shopify', 'html5': 'HTML5',
}

SHAPES = [
    '<path d="m15 5 4 4M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M4 4v5M1.5 6.5h5M19 16v5m-2.5-2.5h5"/>',
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4zM7 4v16M17 4v16"/>',
    '<path d="m3 11 15-7v16L3 14zM6 15l2 6h4l-3-7M21 8v8"/>',
    '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20m-14 4-3 3 3 3m8-6 3 3-3 3M6 6.5h.01m3 0h.01"/>',
    '<path d="m12 2 9 6v8l-9 6-9-6V8zM3 8l9 6 9-6m-9 6v8"/><path d="m7.5 5 9 6"/>',
]

def service_icon(index):
    return '<svg class="service-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+SHAPES[index]+'</svg>'

def brand_icons(names):
    return '<span class="brand-icons">'+''.join(
        f'<img src="/assets/brands/{name}.svg" alt="{BRANDS[name]}" title="{BRANDS[name]}" width="22" height="22" loading="lazy" decoding="async">'
        for name in names)+'</span>'

def service_cards():
    return '<div class="service-cards service-grid-simple">'+''.join(
        f'<a class="service-card compact-service" href="/services.html#{slug}"><div class="service-card-top">{service_icon(i)}<span class="service-number">0{i+1}</span></div><h3>{escape(title)}</h3>{brand_icons(brands)}<span class="text-link">Explore services <span aria-hidden="true">↗</span></span></a>'
        for i,(slug,title,items,brands) in enumerate(SERVICES))+'</div>'

def service_groups():
    return ''.join(
        f'<section class="service-group" id="{slug}"><div class="service-group-title"><p class="eyebrow">0{i+1} {service_icon(i)}</p><h2>{escape(title)}</h2>{brand_icons(brands)}</div><ul class="service-items">'+''.join(f'<li>{escape(item)}</li>' for item in items)+'</ul></section>'
        for i,(slug,title,items,brands) in enumerate(SERVICES))

def platform_strip():
    return '<div class="platform-strip wrap"><p class="eyebrow">DESIGN · VIDEO · WEB · SOCIAL</p><div class="platform-logos">'+''.join(
        f'<span class="platform-item"><img src="/assets/brands/{name}.svg" width="25" height="25" alt="" loading="lazy" decoding="async"><span>{BRANDS[name]}</span></span>'
        for name in ['adobephotoshop','adobeillustrator','adobepremierepro','adobeaftereffects','figma','canva','wordpress','instagram','facebook','youtube','meta'])+'</div></div>'
