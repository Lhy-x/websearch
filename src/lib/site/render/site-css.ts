/** Standalone stylesheet for generated sites (inlined in previews, shipped as site.css in exports). */
export const SITE_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0}
.pf-site{background:var(--c-bg);color:var(--c-text);font-family:var(--f-body);font-size:17px;line-height:1.65;min-height:100vh;overflow-x:hidden}
.pf-site img{max-width:100%;display:block}
.pf-site a{color:inherit}
.pf-container{width:100%;max-width:1160px;margin:0 auto;padding:0 24px}
.pf-demo-banner{background:#111;color:#fff;font:500 13px/1.4 system-ui,sans-serif;text-align:center;padding:8px 16px;position:relative;z-index:30}
.pf-topbar{background:var(--c-primary);color:#fff;font-size:14px}
.pf-topbar .pf-container{display:flex;justify-content:space-between;align-items:center;min-height:38px;gap:16px}
.pf-topbar a{display:inline-flex;gap:6px;align-items:center;font-weight:700;text-decoration:none}
.pf-nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--c-bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid color-mix(in srgb,var(--c-text) 8%,transparent)}
.pf-nav__inner{display:flex;align-items:center;justify-content:space-between;min-height:68px;gap:24px}
.pf-brand{font-family:var(--f-head);font-weight:700;font-size:21px;text-decoration:none;text-transform:var(--head-case);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
.pf-nav__links{display:flex;gap:22px;list-style:none;margin:0;padding:0;font-size:15px}
.pf-nav__links a{text-decoration:none;opacity:.8}
.pf-nav__links a:hover{opacity:1;color:var(--c-primary)}
.pf-h1,.pf-h2,.pf-h3{font-family:var(--f-head);text-transform:var(--head-case);line-height:1.12;margin:0 0 .5em;font-weight:700;letter-spacing:-.01em}
.pf-h1{font-size:clamp(38px,6vw,68px)}
.pf-h1--xl{font-size:clamp(46px,9vw,118px);letter-spacing:-.03em;line-height:.98}
.pf-h2{font-size:clamp(28px,3.6vw,42px)}
.pf-h3{font-size:20px}
.pf-eyebrow{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--c-primary);font-weight:600;margin:0 0 18px}
.pf-intro,.pf-lead{font-size:19px;max-width:720px;color:color-mix(in srgb,var(--c-text) 85%,var(--c-bg))}
.pf-muted{color:var(--c-muted);margin:0}
.pf-credit{font-size:12px;color:var(--c-muted);margin-top:10px}
.pf-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 26px;font-weight:600;font-size:16px;text-decoration:none;border:2px solid var(--c-primary);border-radius:var(--radius);transition:transform .15s ease,background .15s ease}
.pf-btn--pill{border-radius:999px}
.pf-btn--primary{background:var(--c-primary);color:var(--c-bg)!important}
.pf-btn--primary.pf-btn--outline{background:transparent;color:var(--c-primary)!important}
.pf-btn--ghost{background:transparent;color:var(--c-text)!important;border-color:color-mix(in srgb,var(--c-text) 25%,transparent)}
.pf-btn:hover{transform:translateY(-1px)}
.pf-btn:focus-visible,.pf-site a:focus-visible,.pf-faq summary:focus-visible{outline:3px solid var(--c-accent);outline-offset:3px}
.pf-hero{position:relative;padding:calc(var(--section-pad) * .9) 0 var(--section-pad);overflow:hidden}
.pf-hero__sub{font-size:clamp(18px,2vw,21px);max-width:620px;color:color-mix(in srgb,var(--c-text) 80%,var(--c-bg));margin:0 0 30px}
.pf-hero__ctas{display:flex;flex-wrap:wrap;gap:14px}
.pf-hero__grid{display:grid;grid-template-columns:1.2fr 1fr;gap:56px;align-items:center}
.pf-hero__center{text-align:center;display:flex;flex-direction:column;align-items:center;position:relative;z-index:2}
.pf-hero__center .pf-hero__sub{margin-left:auto;margin-right:auto}
.pf-hero__img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.pf-hero__art{position:relative;aspect-ratio:1/1;max-width:440px;width:100%;justify-self:end}
.pf-hero__art span{position:absolute;border-radius:var(--radius)}
.pf-section{padding:var(--section-pad) 0}
.pf-section:nth-of-type(even){background:var(--c-surface)}
.pf-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;margin-top:36px}
.pf-card{background:var(--c-bg);border:1px solid color-mix(in srgb,var(--c-text) 10%,transparent);border-radius:var(--radius);padding:28px}
.pf-section:nth-of-type(odd) .pf-card{background:var(--c-surface)}
.pf-card__icon{display:inline-flex;width:46px;height:46px;align-items:center;justify-content:center;border-radius:var(--radius);background:color-mix(in srgb,var(--c-primary) 12%,transparent);color:var(--c-primary);margin-bottom:16px}
.pf-services{list-style:none;padding:0;margin:36px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}
.pf-service{display:flex;gap:16px;align-items:flex-start;padding:24px;border-radius:var(--radius);background:var(--c-bg);border:1px solid color-mix(in srgb,var(--c-text) 9%,transparent)}
.pf-service__icon{flex:none;color:var(--c-primary);display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:999px;background:color-mix(in srgb,var(--c-primary) 10%,transparent)}
.pf-service__body{display:flex;flex-direction:column;gap:4px}
.pf-service__title{font-size:18px;font-family:var(--f-head);text-transform:var(--head-case)}
.pf-service__desc{color:var(--c-muted);font-size:15.5px}
.pf-num{font-family:var(--f-head);font-weight:700;font-size:15px}
.pf-steps{list-style:none;margin:36px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:28px;counter-reset:s}
.pf-step{position:relative;padding-top:8px}
.pf-step__n{display:inline-flex;width:40px;height:40px;border-radius:999px;align-items:center;justify-content:center;background:var(--c-primary);color:var(--c-bg);font-weight:700;margin-bottom:14px}
.pf-hours{display:flex;flex-direction:column;gap:8px;max-width:520px;padding:28px;border-radius:var(--radius);background:var(--c-bg);border:1px solid color-mix(in srgb,var(--c-text) 10%,transparent);color:var(--c-primary)}
.pf-hours ul{list-style:none;padding:0;margin:8px 0 0;color:var(--c-text);font-size:17px}
.pf-hours li{padding:6px 0;border-bottom:1px dashed color-mix(in srgb,var(--c-text) 15%,transparent)}
.pf-tags{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:18px 0 0}
.pf-tags li{padding:6px 14px;border-radius:999px;background:color-mix(in srgb,var(--c-primary) 10%,transparent);font-size:14px}
.pf-faq{max-width:820px;margin-top:28px}
.pf-faq__item{border-bottom:1px solid color-mix(in srgb,var(--c-text) 12%,transparent);padding:18px 0}
.pf-faq summary{cursor:pointer;font-weight:600;font-size:18px;list-style:none;display:flex;justify-content:space-between;gap:12px}
.pf-faq summary::after{content:'+';color:var(--c-primary);font-size:22px;line-height:1}
.pf-faq details[open] summary::after{content:'–'}
.pf-faq__item p{margin:12px 0 0;color:var(--c-muted)}
.pf-section--cta{background:var(--c-primary)!important;color:var(--c-bg)}
.pf-section--cta .pf-btn--primary{background:var(--c-bg);color:var(--c-primary)!important;border-color:var(--c-bg)}
.pf-cta{display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap}
.pf-cta p{margin:0;font-size:19px;opacity:.9}
.pf-contact{display:grid;grid-template-columns:1fr 1.2fr;gap:40px;margin-top:32px;align-items:start}
.pf-contact__list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:18px;font-size:18px}
.pf-contact__list li{display:flex;gap:14px;align-items:flex-start}
.pf-contact__list svg{color:var(--c-primary);flex:none;margin-top:3px}
.pf-map{width:100%;height:340px;border:0;border-radius:var(--radius);filter:saturate(.8)}
.pf-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:32px}
.pf-gallery__item{margin:0}
.pf-gallery__item img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.pf-footer{padding:48px 0;border-top:1px solid color-mix(in srgb,var(--c-text) 10%,transparent);font-size:14px;color:var(--c-muted)}
.pf-footer p{margin:0 0 6px}
.pf-footer__disclaimer{font-size:12.5px;max-width:760px}
.pf-about{display:grid;grid-template-columns:120px 1fr;gap:32px;align-items:start;margin-top:12px}
.pf-about__deco{width:120px;height:120px;border-radius:var(--radius);background:linear-gradient(135deg,var(--c-primary),var(--c-accent));opacity:.9}

/* ---------- layout: salon (soft, centered, elegant) ---------- */
.pf-layout--salon .pf-hero{padding-top:calc(var(--section-pad) * 1.2)}
.pf-layout--salon .pf-eyebrow{font-style:italic;letter-spacing:.08em;text-transform:none;font-size:16px}
.pf-hero__art--soft{position:absolute;inset:0;max-width:none;aspect-ratio:auto;z-index:1;pointer-events:none}
.pf-hero__art--soft span:nth-child(1){width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--c-accent) 45%,transparent),transparent 70%);top:-160px;left:-140px}
.pf-hero__art--soft span:nth-child(2){width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--c-primary) 22%,transparent),transparent 70%);bottom:-180px;right:-100px}
.pf-layout--salon .pf-services{grid-template-columns:1fr 1fr;gap:0 48px}
.pf-layout--salon .pf-service{background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--c-text) 12%,transparent);border-radius:0;padding:22px 0}
.pf-layout--salon .pf-section{text-align:left}
.pf-layout--salon .pf-section--about .pf-container{text-align:center}
.pf-layout--salon .pf-section--about .pf-about{grid-template-columns:1fr;justify-items:center}
.pf-layout--salon .pf-about__deco{width:64px;height:2px;border-radius:0}

/* ---------- layout: barber (dark, bold, stripes) ---------- */
.pf-layout--barber .pf-h1{font-size:clamp(56px,9vw,120px);letter-spacing:.01em;line-height:.92}
.pf-layout--barber .pf-hero__art{max-width:380px;border:2px solid var(--c-primary)}
.pf-layout--barber .pf-hero__art span:nth-child(1){inset:18px;background:repeating-linear-gradient(135deg,#b91c1c 0 22px,#f5f5f5 22px 44px,#1d4ed8 44px 66px,#f5f5f5 66px 88px);border-radius:0;opacity:.88}
.pf-layout--barber .pf-hero__art span:nth-child(2),.pf-layout--barber .pf-hero__art span:nth-child(3){display:none}
.pf-layout--barber .pf-services{counter-reset:none}
.pf-layout--barber .pf-service{background:transparent;border:1px solid color-mix(in srgb,var(--c-primary) 50%,transparent);border-radius:0;flex-direction:column}
.pf-layout--barber .pf-service__icon{background:none;width:auto;height:auto;font-size:42px;color:var(--c-primary)}
.pf-layout--barber .pf-num{font-size:42px}
.pf-layout--barber .pf-btn--primary{color:#111!important}
.pf-layout--barber .pf-section:nth-of-type(even){background:var(--c-surface)}

/* ---------- layout: table (restaurant/cafe) ---------- */
.pf-hero--table{background:linear-gradient(180deg,color-mix(in srgb,var(--c-primary) 92%,#000),color-mix(in srgb,var(--c-primary) 70%,#000));color:#fff;padding:calc(var(--section-pad) * 1.5) 0}
.pf-hero--table::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 20%,color-mix(in srgb,var(--c-accent) 30%,transparent),transparent 45%),radial-gradient(circle at 85% 80%,color-mix(in srgb,var(--c-accent) 18%,transparent),transparent 40%);pointer-events:none}
.pf-hero--table .pf-eyebrow{color:var(--c-accent)}
.pf-hero--table .pf-hero__sub{color:rgba(255,255,255,.85)}
.pf-hero--table .pf-btn--primary{background:var(--c-accent);border-color:var(--c-accent);color:#1a1a1a!important}
.pf-hero--table .pf-btn--ghost{color:#fff!important;border-color:rgba(255,255,255,.5)}
.pf-hero__bg{position:absolute;inset:0;opacity:.35}
.pf-hero__bg img{width:100%;height:100%;object-fit:cover;border-radius:0;aspect-ratio:auto}
.pf-layout--table .pf-services{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.pf-layout--table .pf-service{flex-direction:column;align-items:center;text-align:center;border-style:double;border-width:3px;border-color:color-mix(in srgb,var(--c-accent) 60%,transparent)}
.pf-layout--table .pf-hours{margin:0 auto;text-align:center;align-items:center}
.pf-layout--table .pf-section--hours .pf-h2{text-align:center}

/* ---------- layout: bakery (warm, paper, stamp) ---------- */
.pf-hero--bakery{background-color:var(--c-surface);background-image:radial-gradient(color-mix(in srgb,var(--c-primary) 10%,transparent) 1px,transparent 1.2px);background-size:18px 18px}
.pf-hero--bakery .pf-h1{font-style:italic}
.pf-hero--bakery .pf-hero__center::before{content:'';display:block;width:84px;height:84px;border-radius:50%;border:2px dashed var(--c-primary);margin-bottom:22px;background:radial-gradient(circle,var(--c-accent) 0 28%,transparent 30%)}
.pf-layout--bakery .pf-service{flex-direction:column;align-items:center;text-align:center;background:var(--c-surface);box-shadow:0 10px 30px -18px color-mix(in srgb,var(--c-primary) 60%,transparent)}
.pf-layout--bakery .pf-service__icon{width:64px;height:64px}
.pf-layout--bakery .pf-hours{font-size:19px}

/* ---------- layout: trade (artisans, phone-first) ---------- */
.pf-hero--trade{background:linear-gradient(120deg,var(--c-bg) 0 55%,color-mix(in srgb,var(--c-primary) 8%,var(--c-bg)) 55%)}
.pf-checks{list-style:none;padding:0;margin:0 0 28px;display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}
.pf-checks li{display:flex;gap:8px;align-items:center;font-weight:500}
.pf-checks svg{color:var(--c-primary);flex:none}
.pf-hero__card{background:var(--c-surface);border-radius:var(--radius);padding:32px;box-shadow:0 30px 60px -30px rgba(0,0,0,.35);border-top:6px solid var(--c-accent);display:flex;flex-direction:column;gap:14px}
.pf-hero__card-title{font-family:var(--f-head);font-size:22px;font-weight:700;margin:0;text-transform:var(--head-case)}
.pf-hero__phone{display:flex;align-items:center;gap:10px;font-size:26px;font-weight:800;color:var(--c-primary)!important;text-decoration:none}
.pf-hero__mail{word-break:break-all}
.pf-layout--trade .pf-service{border-left:4px solid var(--c-accent)}
.pf-layout--trade .pf-step__n{background:var(--c-accent);color:#111}

/* ---------- layout: studio (editorial, architecture/photo) ---------- */
.pf-hero--studio{padding:calc(var(--section-pad) * 1.3) 0 calc(var(--section-pad) * .6)}
.pf-hero__row{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;flex-wrap:wrap;margin-top:28px}
.pf-rule{height:1px;background:currentColor;opacity:.25;margin-top:64px}
.pf-layout--studio .pf-services{grid-template-columns:1fr;gap:0}
.pf-layout--studio .pf-service{background:transparent;border:0;border-top:1px solid color-mix(in srgb,var(--c-text) 18%,transparent);border-radius:0;padding:28px 0;align-items:baseline}
.pf-layout--studio .pf-service__icon{background:none;width:72px;justify-content:flex-start;color:var(--c-accent)}
.pf-layout--studio .pf-service__title{font-size:26px}
.pf-layout--studio .pf-section:nth-of-type(even){background:transparent}
.pf-layout--studio .pf-about__deco{display:none}
.pf-layout--studio .pf-about{grid-template-columns:1fr}
.pf-layout--studio .pf-lead{font-size:clamp(20px,2.4vw,28px);font-family:var(--f-head);max-width:900px;line-height:1.35}

/* ---------- layout: corporate (structured, institutional) ---------- */
.pf-hero--corporate .pf-hero__art span:nth-child(1){inset:0 30% 30% 0;background:var(--c-primary)}
.pf-hero--corporate .pf-hero__art span:nth-child(2){inset:30% 0 0 30%;background:color-mix(in srgb,var(--c-accent) 80%,transparent);mix-blend-mode:multiply}
.pf-hero--corporate .pf-hero__art span:nth-child(3){inset:42% 42% 12% 12%;border:2px solid var(--c-bg)}
.pf-layout--corporate .pf-service{flex-direction:column;border-top:4px solid var(--c-primary)}
.pf-layout--corporate .pf-steps{border-left:2px solid color-mix(in srgb,var(--c-primary) 30%,transparent);padding-left:28px;grid-template-columns:1fr;gap:24px}

/* ---------- responsive ---------- */
@media (max-width:860px){
  .pf-nav__links{display:none}
  .pf-hero__grid,.pf-contact{grid-template-columns:1fr;gap:36px}
  .pf-hero__art{max-width:300px;justify-self:start}
  .pf-layout--salon .pf-services{grid-template-columns:1fr}
  .pf-checks{grid-template-columns:1fr}
  .pf-about{grid-template-columns:1fr}
  .pf-about__deco{width:64px;height:64px}
  .pf-container{padding:0 18px}
  .pf-site{font-size:16px}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.pf-btn{transition:none}}
`
