// Styles of the Detail Screen Panel (copied from the reference page's RIGHT PANEL CSS).
export const PANEL_CSS = `
.rp { --rp-ink:#111827; --rp-muted:#6B7280; --rp-line:#E5E7EB; --rp-navy:#102A43; --rp-accent:#102A43;
  --rp-accent-soft:#EEF0F3; --rp-green:#15803D; --rp-amber:#B7791F; --rp-red:#C0392B; --rp-edit:#E3F4EF; --rp-edit-line:#4FA38F;
  position: relative; display: flex; flex-direction: column; width: 360px; min-width: 300px; max-width: 720px; height: 100%;
  background: #fff; border: 1px solid var(--rp-line); border-radius: 12px; box-sizing: border-box; overflow: hidden;
  font-family: inherit; font-size: 12.5px; color: var(--rp-ink); }
.rp *, .rp *::before, .rp *::after { box-sizing: border-box; }
.rp[hidden] { display: none; }
.rp-grip { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 2; }
.rp-grip::after { content: ""; position: absolute; left: 2px; top: 50%; width: 4px; height: 36px; margin-top: -18px; border-radius: 3px; background: #D1D5DB; }
.rp-grip:hover::after, .rp.rp-dragging .rp-grip::after { background: var(--rp-accent); }
.rp-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 16px; border-bottom: 1px solid var(--rp-line); flex: 0 0 auto; }
.rp-who { flex: 1; min-width: 0; font-size: 12px; color: #374151; line-height: 1.35; }
.rp-who b { color: var(--rp-navy); font-size: 13px; }
.rp-who.rp-empty { color: var(--rp-muted); }
.rp-ic { flex: 0 0 auto; border: 1px solid #D1D5DB; background: #fff; border-radius: 6px; height: 26px; min-width: 26px; padding: 0 6px; font-size: 13px; color: #374151; cursor: pointer; }
.rp-ic:hover { border-color: var(--rp-accent); color: var(--rp-accent); }
.rp-zoom { font-size: 14px; font-weight: 700; line-height: 1; }
.rp-ic:disabled { opacity: .4; cursor: not-allowed; border-color: #D1D5DB; color: #374151; }
.rp-tabs { display: flex; border-bottom: 1px solid var(--rp-line); flex: 0 0 auto; background: #FAFAFB; }
.rp-tabs button { flex: 1; background: none; border: 0; border-bottom: 2px solid transparent; padding: 9px 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--rp-muted); cursor: pointer; }
.rp-tabs button[aria-selected="true"] { color: var(--rp-ink); border-bottom-color: var(--rp-accent); font-weight: 800; }
.rp-subs { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 4px 16px; flex: 0 0 auto; }
.rp-subs button { border: 1px solid #D1D5DB; background: #fff; border-radius: 14px; padding: 3px 10px; font: inherit; font-size: 11.5px; color: #374151; cursor: pointer; }
.rp-subs button[aria-pressed="true"] { background: #EEF0F3; border-color: #CBD2DA; color: var(--rp-ink); font-weight: 700; }
.rp-subs button:disabled { color: #9CA3AF; border-style: dashed; cursor: default; }
.rp-body { flex: 1; min-height: 0; overflow: auto; padding: 6px 14px 14px 16px; }
.rp-wide .rp-body.rp-split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-content: start; }
.rp-foot { flex: 0 0 auto; border-top: 1px solid var(--rp-line); padding: 8px 14px 8px 16px; }
.rp-note { font-size: 10.5px; color: var(--rp-muted); }
.rp-card { border: 1px solid var(--rp-line); border-radius: 10px; padding: 10px 12px; margin-top: 8px; }
.rp-card h4 { margin: 0 0 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .04em; color: var(--rp-muted); text-transform: uppercase; }
.rp-muted { color: var(--rp-muted); }
.rp-ok { color: var(--rp-green); } .rp-warn { color: var(--rp-amber); } .rp-bad { color: var(--rp-red); }
.rp-big { font-size: 20px; font-weight: 800; }
.rp-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.rp-row + .rp-row { border-top: 1px dashed #EEF0F3; }
.rp-bar { height: 7px; border-radius: 4px; background: #EEF1F4; overflow: hidden; margin: 6px 0 4px; }
.rp-bar i { display: block; height: 100%; background: var(--rp-green); }
.rp-bar i.rp-warn { background: var(--rp-amber); } .rp-bar i.rp-bad { background: var(--rp-red); }
.rp-alert { border: 1px solid #FED7AA; background: #FFF7ED; color: #9A3412; border-radius: 8px; padding: 6px 9px; margin-top: 8px; font-size: 12px; }
.rp-info { border: 1px solid var(--rp-line); background: #F7F8FA; border-radius: 8px; padding: 6px 10px; margin-top: 8px; font-size: 12px; }
.rp-list { margin: 0; padding-left: 16px; } .rp-list li { margin: 2px 0; }
.rp-tl { list-style: none; margin: 4px 0 0; padding: 0 0 0 18px; position: relative; }
.rp-tl::before { content: ""; position: absolute; left: 5px; top: 8px; bottom: 8px; width: 1px; background: #E0E4EA; }
.rp-tl li { position: relative; padding: 6px 0 10px; }
.rp-tl li::before { content: ""; position: absolute; left: -17px; top: 11px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid #C7CDD6; background: #fff; }
.rp-tl li.rp-cur::before { border-color: var(--rp-accent); background: var(--rp-accent); }
.rp-tl .rp-y { font-weight: 800; color: var(--rp-navy); }
.rp-chip { display: inline-block; border: 1px solid var(--rp-line); background: #F7F8FA; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin: 3px 4px 0 0; }
.rp-chip.rp-good { background: #ECFDF3; border-color: #B7E4C7; color: #166534; font-weight: 700; }
.rp-chip.rp-now { background: #EEF0F3; border-color: #D1D5DB; color: var(--rp-ink); font-weight: 700; }
.rp-txt { margin-top: 4px; color: #1F2937; line-height: 1.45; }
.rp-band { position: relative; height: 8px; border-radius: 4px; margin: 12px 0 4px; background: #E5E7EB; }
.rp-band .rp-iqr { position: absolute; top: 0; bottom: 0; background: #CBD2DA; border-radius: 4px; }
.rp-band .rp-med { position: absolute; top: -2px; width: 2px; height: 12px; background: var(--rp-accent); }
.rp-band .rp-me { position: absolute; top: -4px; width: 4px; height: 16px; border-radius: 2px; background: var(--rp-red); }
.rp-scale { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--rp-muted); }
.rp-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.rp-tbl th { text-align: left; font-size: 10.5px; color: var(--rp-muted); font-weight: 700; padding: 4px 4px; border-bottom: 1px solid var(--rp-line); }
.rp-tbl td { padding: 4px; border-bottom: 1px solid #F1F3F5; }
.rp-tbl td.rp-n, .rp-tbl th.rp-n { text-align: right; }
.rp-tbl tr.rp-me td { background: var(--rp-accent-soft); font-weight: 700; }
.rp-link { background: none; border: 0; padding: 0; font: inherit; color: var(--rp-accent); font-weight: 700; cursor: pointer; text-decoration: underline; }
.rp-ask { display: flex; gap: 6px; margin-bottom: 6px; }
.rp-ask input { flex: 1; height: 30px; border: 1px solid #D1D5DB; border-radius: 6px; padding: 0 8px; font: inherit; }
.rp-ask button { height: 30px; border: 0; border-radius: 6px; background: var(--rp-accent); color: #fff; font: inherit; font-weight: 700; padding: 0 12px; cursor: pointer; }
.rp-qa { margin-top: 8px; } .rp-qa .rp-q { font-weight: 700; } .rp-qa .rp-a { margin-top: 3px; }
.rp-grads{background:#FFF1D6;border-color:#E8A317;color:#7A4A00;font-weight:700}
.rp-rg td,.rp-rg th{white-space:nowrap}
.rp-rg tr.rp-cur td{background:#F1F6FF;font-weight:600}
.rp-fbh{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5B6B7E;margin:14px 0 6px}
.rp-flags{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.rp-fl{display:flex;flex-direction:column;gap:1px;padding:7px 9px;border-radius:7px;border-left:4px solid;font-size:12px}
.rp-fl span{color:#4A5868}
.rp-fl-red{background:#FDECEC;border-color:#D64545}
.rp-fl-amber{background:#FFF6E0;border-color:#E8A317}
.rp-fl-green{background:#E8F6EE;border-color:#2E9B6A}
.rp-subs:empty{display:none}
.rp-ig{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.rp-it{border:1px solid #E3E9EC;border-radius:8px;padding:6px 9px;display:flex;flex-direction:column;gap:1px;background:#fff}
.rp-it span{font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#6B7A89}
.rp-it b{font-size:13px;color:#102A43}
.rp-it i{font-style:normal;font-size:10.5px;color:#6B7A89}
.rp-it.rp-hl{background:#FFF1D6;border-color:#E8A317}.rp-it.rp-hl b{color:#7A4A00}
.rp-dm{margin-top:4px;font-size:10.5px}
.rp-fl{flex-direction:row !important;flex-wrap:wrap;gap:0 6px !important;padding:5px 9px !important;font-size:11.5px !important}
.rp-flags{gap:4px !important}
.rp-bd{display:inline-block;min-width:16px;padding:0 5px;border-radius:9px;font-size:10.5px;font-weight:700;line-height:16px;text-align:center;color:#fff;vertical-align:1px}
.rp-bd-red{background:#D64545}.rp-bd-amber{background:#E8A317}
.rp-it-red{background:#FDECEC;border-color:#D64545;border-left-width:4px}.rp-it-red b{color:#9B1C1C}
.rp-it-amber{background:#FFF1D6;border-color:#E8A317;border-left-width:4px}.rp-it-amber b{color:#7A4A00}
.rp-fl-green{padding:3px 9px !important;font-size:11px !important;opacity:.9}
.rp-rg td.rp-wrap{white-space:normal;min-width:110px}
.rp-it-green{background:#E8F6EE;border-color:#2E9B6A;border-left-width:4px}.rp-it-green b{color:#14663F}
.hl-r{display:grid;grid-template-columns:22px 1fr 1fr;gap:5px;padding:8px;border:1px solid #E3E9EC;border-radius:8px;margin-bottom:6px;background:#fff}
.hl-r.hl-off{opacity:.55}
.hl-r select,.hl-r input[type=text],.hl-r input:not([type]){height:26px;border:1px solid #D1D5DB;border-radius:5px;font-size:11.5px;padding:0 6px;min-width:0;background:#fff}
.hl-r > input[data-hl="value"],.hl-r > select[data-hl="value"]{grid-column:2 / span 2}
.hl-r > .hl-on{grid-row:1;display:flex;align-items:center}
.hl-r select[data-hl="color"]{grid-column:1 / span 2;font-weight:700}
.hl-c-red{border-color:#D64545 !important;background:#FDECEC !important}.hl-c-amber{border-color:#E8A317 !important;background:#FFF6E0 !important}.hl-c-green{border-color:#2E9B6A !important;background:#E8F6EE !important}
.hl-r input[data-hl="label"]{grid-column:3}
.hl-x{grid-column:1 / -1;justify-self:end;border:0;background:none;color:#9B1C1C;cursor:pointer;font-size:11px}
.rp-it span{line-height:1.25}
`;