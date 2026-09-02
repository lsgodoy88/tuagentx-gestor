(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,669644,e=>{"use strict";var t=e.i(843476),n=e.i(500932),i=e.i(271645);e.s(["default",0,function(e){let s,a,r,o,l,d,c=(0,n.c)(14),{active:u,borderRadius:b,duration:x}=e,h=void 0===b?20:b,p=void 0===x?4:x,[m,f]=(0,i.useState)(!1);if(c[0]===Symbol.for("react.memo_cache_sentinel")?(s=()=>{f("u">typeof navigator&&(navigator.hardwareConcurrency<=4||/Mobi|Android/i.test(navigator.userAgent)))},a=[],c[0]=s,c[1]=a):(s=c[0],a=c[1]),(0,i.useEffect)(s,a),m){let e,n=`
        @keyframes bb-pulse {
          0%, 100% { outline-color: rgba(59,130,246,0.8); outline-offset: 0px; }
          50%       { outline-color: rgba(59,130,246,0.2); outline-offset: 4px; }
        }
        .bb-host {
          border-radius: ${h}px;
          outline: 2px solid rgba(59,130,246,0);
          outline-offset: 0px;
          transition: outline-color 0.3s, outline-offset 0.3s;
        }
        .bb-host.bb-active {
          border: 1.5px solid rgba(59,130,246,0.5) !important;
          animation: bb-pulse ${.6*p}s ease-in-out infinite;
        }
      `;return c[2]!==n?(e=(0,t.jsx)("style",{children:n}),c[2]=n,c[3]=e):e=c[3],e}let g=`
        @property --bb-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes bb-spin {
          to { --bb-angle: 360deg; }
        }
        .bb-ring {
          position: absolute;
          inset: 0;
          border-radius: ${h}px;
          background: conic-gradient(
            from var(--bb-angle),
            transparent 0%,
            transparent 60%,
            #3b82f6 72%,
            #93c5fd 78%,
            #3b82f6 84%,
            transparent 92%,
            transparent 100%
          );
          animation: bb-spin ${p}s linear infinite;
          pointer-events: none;
          transition: opacity 0.5s ease;
          z-index: 0;
        }
        .bb-glow {
          position: absolute;
          inset: -6px;
          border-radius: ${h+6}px;
          background: conic-gradient(
            from var(--bb-angle),
            transparent 0%,
            transparent 65%,
            rgba(59,130,246,0.5) 75%,
            rgba(147,197,253,0.18) 80%,
            transparent 90%,
            transparent 100%
          );
          animation: bb-spin ${p}s linear infinite;
          filter: blur(8px);
          pointer-events: none;
          transition: opacity 0.5s ease;
          z-index: -1;
        }
      `;c[4]!==g?(r=(0,t.jsx)("style",{children:g}),c[4]=g,c[5]=r):r=c[5];let v=+!!u;c[6]!==v?(o=(0,t.jsx)("div",{className:"bb-glow",style:{opacity:v}}),c[6]=v,c[7]=o):o=c[7];let y=+!!u;return c[8]!==y?(l=(0,t.jsx)("div",{className:"bb-ring",style:{opacity:y}}),c[8]=y,c[9]=l):l=c[9],c[10]!==l||c[11]!==r||c[12]!==o?(d=(0,t.jsxs)(t.Fragment,{children:[r,o,l]}),c[10]=l,c[11]=r,c[12]=o,c[13]=d):d=c[13],d}])},836664,e=>{"use strict";e.s(["notifyModuleClose",0,()=>window.dispatchEvent(new Event("module:close")),"notifyModuleOpen",0,()=>window.dispatchEvent(new Event("module:open"))])},100494,e=>{"use strict";var t=e.i(843476),n=e.i(271645),i=e.i(669644),s=e.i(836664);e.s(["default",0,function({onGuardado:e,onClose:a}){let r=(0,n.useRef)(null),o=(0,n.useRef)(crypto.randomUUID());(0,n.useEffect)(()=>((0,s.notifyModuleOpen)(),()=>{(0,s.notifyModuleClose)()}),[]);let[l,d]=(0,n.useState)([]),[c,u]=(0,n.useState)(!1),[b,x]=(0,n.useState)(!1),[h,p]=(0,n.useState)(""),[m,f]=(0,n.useState)([]),[g,v]=(0,n.useState)(""),[y,j]=(0,n.useState)(""),[w,N]=(0,n.useState)(""),[k,z]=(0,n.useState)(new Date().toLocaleDateString("en-CA",{timeZone:"America/Bogota"}));async function C(e){if(!(l.length>=4)){u(!0),p("");try{var t;let n=await new Promise((t,n)=>{let i=new FileReader;i.onload=e=>t(e.target?.result),i.onerror=n,i.readAsDataURL(e)});n=await (t=n,new Promise(e=>{let n=new Image;n.onload=()=>{let t=Math.min(1,1280/Math.max(n.width,n.height)),i=document.createElement("canvas");i.width=Math.round(n.width*t),i.height=Math.round(n.height*t),i.getContext("2d").drawImage(n,0,0,i.width,i.height),e(i.toDataURL("image/jpeg",.8))},n.onerror=()=>e(t),n.src=t}));let i=l.length;d(e=>[...e,{base64:n,key:"",subiendo:!0}]);let s=await fetch("/api/impulsar/evento/fotos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({archivoBase64:n,eventoId:o.current,fotoIdx:i})}),a=await s.json();if(!s.ok)throw Error(a.error||"Error subiendo");d(e=>e.map((e,t)=>t===i?{...e,key:a.key,subiendo:!1}:e))}catch(e){d(e=>e.slice(0,-1)),p("Error subiendo foto: "+(e?.message||""))}finally{u(!1),r.current&&(r.current.value="")}}}async function S(){if(0===l.length)return void p("Adjunta al menos 1 foto");if(l.some(e=>e.subiendo))return void p("Espera a que terminen de subir las fotos");if(!g)return void p("Selecciona un cliente");if(!w.trim())return void p("Ingresa el tipo de evento");if(!k)return void p("Selecciona una fecha");x(!0),p("");try{let t=await fetch("/api/impulsar/evento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clienteId:g,ciudad:y||null,tipoEvento:w.trim(),fecha:k,fotos:l.map(e=>e.key)})}),n=await t.json();if(!t.ok)throw Error(n.error||"Error guardando");e()}catch(e){p("Error: "+(e?.message||""))}finally{x(!1)}}(0,n.useEffect)(()=>{fetch("/api/impulsar/clientes").then(e=>e.json()).then(e=>f(e.clientes||[]))},[]);let E=l.some(e=>e.subiendo),R=l.length>0&&!E&&g&&w.trim()&&k;return(0,t.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center px-4",style:{background:"rgba(0,0,0,0.65)"},onClick:a,children:(0,t.jsxs)("div",{onClick:e=>e.stopPropagation(),className:`bb-host${E?" bb-active":""}`,style:{position:"relative",width:"100%",maxWidth:400,borderRadius:22,padding:2*!!E,background:E?void 0:"transparent",overflow:"hidden"},children:[(0,t.jsx)(i.default,{active:E,borderRadius:22,duration:4}),(0,t.jsxs)("div",{className:"w-full p-5 space-y-4 overflow-y-auto",style:{background:"#141c2e",border:E?"none":"1px solid #1e2a3d",borderRadius:20,maxHeight:"92vh",position:"relative",zIndex:1},children:[(0,t.jsx)("h3",{className:"text-white font-semibold text-base",children:"Registrar Evento"}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("label",{className:"text-zinc-400 text-xs font-semibold block mb-2",children:["Fotos ",(0,t.jsx)("span",{className:"text-red-400",children:"*"}),(0,t.jsxs)("span",{className:"text-zinc-600 ml-1",children:["(",l.length,"/4)"]})]}),(0,t.jsxs)("div",{className:"grid grid-cols-4 gap-2",children:[l.map((e,n)=>(0,t.jsxs)("div",{className:"relative aspect-square rounded-xl overflow-hidden",style:{background:"#0d1220",border:"1px solid #1e2a3d"},children:[e.subiendo?(0,t.jsx)("div",{className:"w-full h-full flex items-center justify-center",children:(0,t.jsx)("span",{className:"text-zinc-500 text-xs",children:"⏳"})}):(0,t.jsx)("img",{src:e.base64,alt:"",className:"w-full h-full object-cover"}),!e.subiendo&&(0,t.jsx)("button",{onClick:()=>{d(e=>e.filter((e,t)=>t!==n))},className:"absolute top-1 right-1 bg-black/60 rounded-full w-5 h-5 flex items-center justify-center text-white text-xs",children:"×"})]},n)),l.length<4&&(0,t.jsx)("button",{onClick:()=>r.current?.click(),disabled:c,className:"aspect-square rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40",style:{background:"#0d1220",border:"2px dashed rgba(59,130,246,0.3)"},children:(0,t.jsx)("span",{className:"text-xl",children:"+"})})]}),(0,t.jsx)("input",{ref:r,type:"file",accept:"image/*",capture:"environment",className:"hidden",onChange:e=>{e.target.files?.[0]&&C(e.target.files[0])}})]}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("label",{className:"text-zinc-400 text-xs font-semibold block mb-1",children:["Cliente ",(0,t.jsx)("span",{className:"text-red-400",children:"*"})]}),(0,t.jsxs)("select",{value:g,onChange:e=>{var t;let n;return v(t=e.target.value),n=m.find(e=>e.id===t),void j(n?.ciudad||"")},className:"w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500",children:[(0,t.jsx)("option",{value:"",children:"— Seleccionar cliente —"}),m.map(e=>(0,t.jsx)("option",{value:e.id,children:e.nombre},e.id))]})]}),y&&(0,t.jsxs)("div",{children:[(0,t.jsx)("label",{className:"text-zinc-400 text-xs font-semibold block mb-1",children:"Ciudad"}),(0,t.jsx)("input",{value:y,onChange:e=>j(e.target.value),className:"w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"})]}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("label",{className:"text-zinc-400 text-xs font-semibold block mb-1",children:["Tipo de evento ",(0,t.jsx)("span",{className:"text-red-400",children:"*"})]}),(0,t.jsx)("input",{type:"text",value:w,onChange:e=>N(e.target.value),placeholder:"Ej: Degustación, Lanzamiento, Exhibición...",className:"w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"})]}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("label",{className:"text-zinc-400 text-xs font-semibold block mb-1",children:["Fecha ",(0,t.jsx)("span",{className:"text-red-400",children:"*"})]}),(0,t.jsx)("input",{type:"date",value:k,onChange:e=>z(e.target.value),className:"w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500",style:{colorScheme:"dark"}})]}),h&&(0,t.jsx)("p",{className:"text-red-400 text-xs",children:h}),(0,t.jsxs)("div",{className:"flex gap-2 pt-1",children:[(0,t.jsx)("button",{onClick:a,className:"flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors",children:"Cancelar"}),(0,t.jsx)("button",{onClick:S,disabled:!R||b,className:"flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors",children:b?"Guardando...":"Guardar"})]})]})]})})}])},813291,e=>{e.n(e.i(100494))}]);