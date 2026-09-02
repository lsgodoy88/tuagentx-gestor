module.exports=[409640,a=>{"use strict";var b=a.i(187924),c=a.i(572131),d=a.i(50944);let e=`
  body, html { background: white !important; color: #111 !important; margin: 0; padding: 0; font-family: Arial, sans-serif; }
  * { box-sizing: border-box; }
  @media print { @page { margin: 10mm; size: letter; } .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .wrap { padding: 24px; max-width: 560px; margin: 0 auto; }
  .ph { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1d4ed8; padding-bottom:10px; margin-bottom:20px; }
  .pt { font-size:20px; font-weight:bold; color:#1d4ed8; }
  .ps { font-size:12px; color:#555; margin-top:3px; }
  .pdate { font-size:10px; color:#888; }
  .section { margin-bottom:22px; }
  .section-title { font-size:11px; font-weight:700; color:#1d4ed8; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .client-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; }
  .client-field { font-size:12px; color:#444; }
  .client-label { font-size:10px; color:#888; font-weight:600; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  thead th { background:#1d4ed8; color:white; padding:7px 10px; text-align:left; font-size:10.5px; }
  thead th.r { text-align:right; }
  tbody td { padding:6px 10px; border-bottom:1px solid #f0f0f0; color:#222; background:white; }
  tbody td.r { text-align:right; }
  tbody tr:nth-child(even) td { background:#f8faff; }
  .total-row { background:#eff6ff !important; font-weight:bold; }
  .total-box { margin-top:20px; text-align:right; }
  .total-label { font-size:12px; color:#555; font-weight:600; margin-bottom:4px; }
  .total-amount { font-size:28px; font-weight:800; color:#1d4ed8; }
  .nota { margin-top:16px; font-size:10.5px; color:#6b7280; font-style:italic; }
  .ft { text-align:center; font-size:9px; color:#9ca3af; margin-top:24px; padding-top:8px; border-top:1px solid #e5e7eb; }
  .no-print { position:fixed; top:12px; right:12px; z-index:100; display:flex; gap:8px; background:white; padding:8px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.15); }
  .btn-p { background:#1d4ed8; color:white; border:none; padding:7px 14px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px; }
  .btn-v { background:#6b7280; color:white; border:none; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:13px; }
`,f={supervisor:"Supervisores",vendedor:"Vendedores",impulsadora:"Impulsadoras",entregas:"Entregas"};function g(){let a=(0,d.useSearchParams)(),c=a.get("empresa")||"",g=a.get("nit")||"",h=a.get("contacto")||"",i=a.get("telefono")||"",j=a.get("total")||"0",k={};try{k=JSON.parse(a.get("roles")||"{}")}catch{}let l=Number(j),m=a=>"$"+Math.round(a).toLocaleString("es-CO"),n=new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"long",year:"numeric"}),o=Object.entries(k).filter(([,a])=>a.cantidad>0);return(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)("style",{dangerouslySetInnerHTML:{__html:e}}),(0,b.jsxs)("div",{className:"no-print",children:[(0,b.jsx)("button",{className:"btn-p",onClick:()=>window.print(),children:"🖨️ Imprimir / Guardar PDF"}),(0,b.jsx)("button",{className:"btn-v",onClick:()=>window.close(),children:"✕ Cerrar"})]}),(0,b.jsxs)("div",{className:"wrap",children:[(0,b.jsxs)("div",{className:"ph",children:[(0,b.jsxs)("div",{children:[(0,b.jsx)("div",{className:"pt",children:"TuAgentX Gestor"}),(0,b.jsx)("div",{className:"ps",children:"Cotización Comercial"})]}),(0,b.jsx)("div",{className:"pdate",children:n})]}),(0,b.jsxs)("div",{className:"section",children:[(0,b.jsx)("div",{className:"section-title",children:"Datos del cliente"}),(0,b.jsxs)("div",{className:"client-grid",children:[(0,b.jsxs)("div",{children:[(0,b.jsx)("div",{className:"client-label",children:"Empresa"}),(0,b.jsx)("div",{className:"client-field",children:c||"—"})]}),(0,b.jsxs)("div",{children:[(0,b.jsx)("div",{className:"client-label",children:"NIT"}),(0,b.jsx)("div",{className:"client-field",children:g||"—"})]}),(0,b.jsxs)("div",{children:[(0,b.jsx)("div",{className:"client-label",children:"Contacto"}),(0,b.jsx)("div",{className:"client-field",children:h||"—"})]}),(0,b.jsxs)("div",{children:[(0,b.jsx)("div",{className:"client-label",children:"Teléfono"}),(0,b.jsx)("div",{className:"client-field",children:i||"—"})]})]})]}),(0,b.jsxs)("div",{className:"section",children:[(0,b.jsx)("div",{className:"section-title",children:"Detalle de servicios"}),(0,b.jsxs)("table",{children:[(0,b.jsx)("thead",{children:(0,b.jsxs)("tr",{children:[(0,b.jsx)("th",{children:"Rol"}),(0,b.jsx)("th",{className:"r",style:{width:80},children:"Cantidad"}),(0,b.jsx)("th",{className:"r",style:{width:110},children:"Precio unitario"}),(0,b.jsx)("th",{className:"r",style:{width:110},children:"Subtotal / mes"})]})}),(0,b.jsx)("tbody",{children:o.map(([a,c])=>(0,b.jsxs)("tr",{children:[(0,b.jsx)("td",{children:f[a]??a}),(0,b.jsx)("td",{className:"r",children:c.cantidad}),(0,b.jsx)("td",{className:"r",children:m(c.precio)}),(0,b.jsx)("td",{className:"r",children:m(c.cantidad*c.precio)})]},a))})]})]}),(0,b.jsxs)("div",{className:"total-box",children:[(0,b.jsx)("div",{className:"total-label",children:"Total mensual"}),(0,b.jsx)("div",{className:"total-amount",children:m(l)})]}),(0,b.jsx)("div",{className:"nota",children:"Precios en COP  ·  Vigencia 30 días"}),(0,b.jsx)("div",{className:"ft",children:"gestor.tuagentx.com"})]})]})}a.s(["default",0,function(){return(0,b.jsx)(c.Suspense,{fallback:(0,b.jsx)("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Arial",color:"#555"},children:"Generando cotización..."}),children:(0,b.jsx)(g,{})})}])}];

//# sourceMappingURL=app_pdf-cotizacion_page_tsx_0veov95._.js.map