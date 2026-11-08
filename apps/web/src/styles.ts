import { cssVariables } from "@cage/ui-tokens";

/** Fonts as the canvas loads them (design-system style guide, "Setup"). */
export const fontLinks = [
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,300,0,0&display=swap",
  },
];

export const globalCss = `
@font-face{font-family:"Geist Serif";src:url("https://cdn.jsdelivr.net/gh/vercel/geist-font@a2357c1398c81d88ff84823a2f50af3152ee8733/fonts/GeistSerif/webfonts/GeistSerif-Regular.woff2") format("woff2");font-weight:100 900;font-display:swap}
${cssVariables()}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg-primary);font-family:var(--font-sans);color:var(--fg-primary);-webkit-font-smoothing:antialiased}
.page{max-width:480px;margin:0 auto;padding:24px 16px 32px;min-height:100dvh;display:flex;flex-direction:column;gap:16px}
.brand{display:inline-flex;align-items:center;gap:10px;font:500 22px/28px var(--font-lora)}
.hp{font:500 30px/36px var(--font-lora);letter-spacing:-0.01em}
.cap{font:400 15px/20px var(--font-sans);color:var(--fg-secondary)}
.row{display:flex;align-items:center;gap:10px;min-width:0}
.cd-chip{display:inline-flex;white-space:nowrap;align-items:center;padding:6px 12px;border-radius:var(--radius-sm);background:var(--chip);font:400 15px/20px var(--font-sans)}
.cd-chip--success{background:var(--success-tint);color:var(--success-text)}
.cd-chip--danger{background:var(--danger-tint);color:var(--danger-text)}
.cd-chip--warning{background:var(--warning-tint);color:var(--warning-text)}
.cd-chip--info{background:var(--info-tint);color:var(--info-text)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;border-radius:var(--radius-md);background:var(--surface-sunken);border:1px solid var(--border)}
.stats div{background:var(--surface);border-radius:14px;padding:9px 12px;min-width:0}
.stats small{display:block;font:400 13px/16px var(--font-sans);color:var(--fg-tertiary)}
.stats b{display:block;font:500 16px/22px var(--font-sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd-icon{flex:none;display:inline-block;width:1em;height:1em;overflow:hidden;color:var(--fg-tertiary);font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;font-size:20px;line-height:1;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased;font-feature-settings:'liga';font-variation-settings:'FILL' 0,'wght' 300,'GRAD' 0,'opsz' 20}
.cd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;font-family:var(--font-sans);font-weight:500;white-space:nowrap;cursor:pointer;text-decoration:none}
.cd-btn .cd-icon{color:currentColor}
.cd-btn--lg{height:48px;padding:0 16px;border-radius:var(--radius-lg);font-size:17px;line-height:24px}
.cd-btn--lg .cd-icon{font-size:22px}
.cd-btn--full{display:flex;width:100%}
.cd-btn--primary{background:var(--fg-primary);background-image:linear-gradient(to bottom,color-mix(in srgb,var(--fg-primary) 84%,white),var(--fg-primary));color:var(--on-fg);text-shadow:0 1px 0 rgba(0,0,0,.3)}
.cd-btn--secondary{background:var(--surface);background-image:linear-gradient(to bottom,var(--surface),var(--surface-hover));color:var(--fg-primary);border-color:var(--border)}
.live{position:relative;min-height:100dvh;overflow:hidden}
.map{position:fixed;inset:0;background:var(--chip)}
.lng{position:fixed;top:16px;left:16px;height:32px;padding:0 12px 0 10px;border-radius:999px;background:var(--surface);box-shadow:var(--shadow-raised);display:flex;align-items:center;gap:6px;font:500 13px/16px var(--font-sans);color:var(--fg-primary);text-decoration:none;z-index:4}
.lng .cd-icon{font-size:18px}
.sheet{position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;max-height:calc(100dvh - 120px);overflow-y:auto;background:var(--surface);border-radius:var(--radius-lg) var(--radius-lg) 0 0;box-shadow:var(--shadow-raised);padding:26px 20px 30px;display:flex;flex-direction:column;gap:12px;z-index:3}
dialog.sheet--over{inset:auto 0 0 0;width:100%;max-width:480px;max-height:calc(100dvh - 24px);border:0;color:var(--fg-primary)}
dialog.sheet--over:not([open]){display:none}
dialog.sheet--over::backdrop{background:rgba(17,17,17,.4)}
.grab{position:absolute;top:10px;left:50%;width:36px;height:5px;margin-left:-18px;border-radius:999px;background:var(--divider)}
.note{display:flex;gap:10px;align-items:flex-start;font:400 15px/20px var(--font-sans);color:var(--fg-secondary);padding:12px 14px;border-radius:var(--radius-md);background:var(--surface-sunken)}
.note b{color:var(--fg-primary);font-weight:500}
.note--danger{background:var(--danger-tint);color:var(--danger-text)}
.note--danger b,.note--danger .cd-icon{color:var(--danger-text)}
.pair{display:flex;gap:10px}.pair .cd-btn{flex:1;min-width:0}
.foot{display:flex;align-items:center;justify-content:center;gap:6px;font:400 13px/16px var(--font-sans);color:var(--fg-tertiary)}
.foot .cd-icon{font-size:16px}
.map-flag{width:36px;height:36px;border-radius:50%;background:var(--fg-primary);display:grid;place-items:center;box-shadow:0 0 0 3px var(--surface),var(--shadow-raised)}
.map-flag .cd-icon{color:var(--on-fg)}
.map-dot{position:relative;width:16px;height:16px;border-radius:50%;background:var(--blue);border:3px solid #fff;box-shadow:0 0 0 14px color-mix(in srgb,var(--blue) 16%,transparent)}
.map-dot--alert{background:var(--danger);box-shadow:0 0 0 14px color-mix(in srgb,var(--danger) 16%,transparent)}
.map-dot::after{content:attr(data-label);position:absolute;left:24px;top:50%;transform:translateY(-50%);padding:6px 10px;border-radius:var(--radius-sm);background:var(--surface);box-shadow:var(--shadow-raised);font:500 13px/16px var(--font-sans);color:var(--fg-primary);white-space:nowrap}
.cd-btn:disabled{opacity:.4;cursor:default}
.demo-pill{position:fixed;top:16px;right:16px;z-index:4;background:var(--warning-text);color:#fff;font:500 11px/14px var(--font-sans);letter-spacing:.12em;padding:5px 9px;border-radius:6px}
.is-off{opacity:.45;pointer-events:none}
.dash{min-height:100dvh;background:var(--bg-primary)}
.dash .sp{flex:1}
.dash .small{font:400 13px/16px var(--font-sans);color:var(--fg-tertiary)}
.dash .small .cd-icon{font-size:15px;vertical-align:-3px}
.dash .lab{font:500 13px/16px var(--font-sans);letter-spacing:.06em;text-transform:uppercase;color:var(--fg-tertiary)}
.dash .bad{color:var(--danger-text)}
.dash .ink,.dash .cd-icon.ink{color:var(--fg-primary)}
.dash .ok{color:var(--success)}
.dash .hp{font:500 22px/28px var(--font-lora);letter-spacing:-.01em}
.dash button{font:inherit}
.band{min-height:36px;display:flex;align-items:center;gap:12px;padding:6px 24px;background:repeating-linear-gradient(-45deg,var(--warning-tint) 0 14px,#fdeccb 14px 28px);border-bottom:1px solid #f3dca8;color:var(--warning-text);font:500 13px/16px var(--font-sans);flex-wrap:wrap}
.band b{font-weight:500;letter-spacing:.12em;background:var(--warning-text);color:#fff;padding:3px 8px;border-radius:6px}
.band .cd-icon{color:currentColor;font-size:18px}
.top{min-height:68px;display:flex;align-items:center;gap:14px;padding:10px 24px;border-bottom:1px solid var(--border);background:var(--surface);flex-wrap:wrap}
.top .brand{font-size:22px;gap:8px}
.ttl{font:500 22px/28px var(--font-lora);letter-spacing:-.01em}
.vr{width:1px;height:24px;background:var(--border)}
.cd-btn--md{height:40px;padding:0 14px;border-radius:var(--radius-md);font-size:15px}
.cd-btn--sm{height:32px;padding:0 12px;border-radius:var(--radius-md);font-size:13px}
.cd-btn--sm .cd-icon{font-size:18px}
.cd-btn--ghost{background:transparent;color:var(--fg-primary)}
.cd-chip--sm{padding:3px 8px;font-size:13px;line-height:16px;border-radius:8px}
.cd-chip{gap:6px}
.cd-chip .cd-icon{color:currentColor;font-size:16px}
.dot{width:10px;height:10px;border-radius:50%;flex:none;display:inline-block}
.dot--success{background:var(--success)}.dot--warning{background:var(--warning)}.dot--danger{background:var(--danger)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 18px;gap:10px}
.card b{font:500 15px/20px var(--font-sans)}
.unlock{display:flex;flex-direction:column}
.field{display:flex;flex-direction:column;gap:6px}
.field input{height:44px;padding:0 14px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);font:400 16px/20px var(--font-sans)}
.panel{background:var(--surface-sunken);border:1px solid var(--border);border-radius:24px;padding:6px;display:flex;flex-direction:column}
.panel__h{display:flex;align-items:center;gap:8px;padding:10px 14px;font:500 15px/20px var(--font-sans)}
.panel__b{background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);padding:16px}
.panel--grow{flex:1;min-height:200px}.panel--grow .panel__b{flex:1;overflow:auto;padding:6px 14px}
.safe{list-style:none;padding:6px 18px}
.safe li{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px dashed var(--divider);font:400 13px/18px var(--font-sans);color:var(--fg-secondary)}
.safe li:first-child{border-top:0}.safe b{color:var(--fg-primary);font-weight:500}
.pick{max-width:1080px;margin:0 auto;padding:56px 24px;display:grid;grid-template-columns:1fr;gap:40px}
@media (min-width:960px){.pick{grid-template-columns:400px 1fr}}
.pick__side,.pick__main{display:flex;flex-direction:column;gap:14px}
.pick__main .hp{font-size:30px;line-height:36px}
.pick__main.is-off{opacity:.45;pointer-events:none}
.people{display:flex;flex-direction:column;gap:10px;margin:6px 0}
.person{display:grid;grid-template-columns:40px 1fr auto 22px;gap:14px;align-items:center;text-align:left;padding:14px 16px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface);cursor:pointer}
.person:hover,.person:focus-visible{border-color:var(--border-strong);background:var(--surface-hover)}
.person>.cd-icon{color:var(--fg-primary)}
.person__text{display:flex;flex-direction:column;gap:2px;min-width:0}.person__text b{font:500 17px/22px var(--font-sans)}
.av{width:40px;height:40px;border-radius:50%;background:var(--chip);display:grid;place-items:center;font:500 16px/1 var(--font-sans)}
.grid{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;padding:20px 24px 32px}
@media (min-width:1180px){.grid{grid-template-columns:minmax(0,720px) 360px;justify-content:center;gap:40px}}
.col{display:flex;flex-direction:column;gap:16px;min-width:0}
.rmap{position:relative;display:block;width:100%;height:280px;border-radius:14px;border:1px solid var(--border);background:var(--chip);overflow:hidden}
.rm-start{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--fg-primary)}
.rm-flag{width:28px;height:28px}.rm-flag .cd-icon{font-size:16px}
.rm-dot{width:16px;height:16px;border-radius:50%;background:var(--blue);border:3px solid #fff;box-shadow:0 0 0 12px color-mix(in srgb,var(--blue) 16%,transparent)}
.rm-dot--bad{background:var(--danger);box-shadow:0 0 0 12px color-mix(in srgb,var(--danger) 16%,transparent)}
.prog{height:6px;border-radius:999px;background:var(--track);overflow:hidden;margin-top:8px}
.prog i{display:block;height:100%;background:var(--blue);border-radius:999px;transition:width .4s}
.seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--chip);gap:2px}
.seg button{border:0;background:transparent;padding:5px 11px;border-radius:999px;font:500 13px/16px var(--font-sans);color:var(--fg-secondary);cursor:pointer}
.seg .on{background:var(--fg-primary);color:#fff}
.states{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.st{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}
.st.cur{border:2px solid var(--fg-primary);padding:11px}
.st__h{display:flex;align-items:center;gap:8px;font:500 16px/22px var(--font-sans)}
.st>.small{flex:1}
.st .cd-btn{justify-content:flex-start;width:100%;white-space:normal;height:auto;min-height:32px;padding:6px 10px;text-align:left}
.now{position:absolute;top:-10px;right:12px;background:var(--fg-primary);color:#fff;font:500 11px/14px var(--font-sans);letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.log{list-style:none}
.log li{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;padding:8px 2px;border-top:1px dashed var(--divider);font:400 14px/20px var(--font-sans)}
.log li:first-child{border-top:0}
.log time{font:400 13px/16px var(--font-sans);color:var(--fg-tertiary);font-variant-numeric:tabular-nums}
.log .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.kv{display:grid;grid-template-columns:110px 1fr;gap:8px 12px;margin-top:14px;font:400 14px/20px var(--font-sans)}
.kv dt{color:var(--fg-tertiary)}
.kv .cd-icon{font-size:18px;vertical-align:-4px}
.ct{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px dashed var(--divider)}
.ct:first-child{border-top:0}
.ct .av{width:36px;height:36px;font-size:14px}
.ct__text{display:flex;flex-direction:column;min-width:0}.ct__text b{font:500 14px/20px var(--font-sans)}
.phone{position:relative;width:100%;max-width:360px;height:700px;border-radius:44px;border:8px solid #111;overflow:hidden;background:var(--chip);box-shadow:var(--shadow-raised);transform:translateZ(0)}
.phone .live{min-height:100%}
.phone .map,.phone .lng,.phone .sheet,.phone .demo-pill{position:absolute}
.phone .sheet{max-height:calc(100% - 100px)}
.lang{display:flex;gap:12px;font:400 15px/20px var(--font-sans)}
.lang a{color:var(--fg-secondary)}.lang a[aria-current]{color:var(--fg-primary);font-weight:500;text-decoration:none}
`;
