module.exports=[721005,a=>{"use strict";var b=a.i(187924),c=a.i(572131);a.s(["default",0,function(){let a=(0,c.useRef)([]),d=(0,c.useRef)(null),e=(0,c.useRef)(null);return(0,c.useEffect)(()=>{let b=e.current,c=d.current;if(!b||!c)return;let f=b.getBoundingClientRect(),g=c.getBoundingClientRect().left-f.left,h=document.createElement("style"),i="";return a.current.forEach((a,b)=>{if(!a)return;let c=((100+Math.max(0,(g-(a.getBoundingClientRect().right-f.left))*800/g))/1400*100).toFixed(2),d=(parseFloat(c)+.1).toFixed(2),e=`tax-er${b}`;i+=`@keyframes ${e} {
        0%, ${c}%           { color: white; }
        ${d}%, 71.43% { color: #060a24; }
        88.57%, 100%          { color: white; }
      }`,a.style.animation=`${e} 1400ms linear infinite`}),h.textContent=i+=`@keyframes tax-travel {
      0%, 7.14%                        { transform: translateX(0); }
      64.29%,
      71.43%              { transform: translateX(-${g}px); }
      100%                                                         { transform: translateX(0); }
    }`,document.head.appendChild(h),c.style.animation="tax-travel 1400ms linear infinite",()=>{h.remove()}},[]),(0,b.jsx)("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#060a24"},children:(0,b.jsxs)("div",{ref:e,style:{display:"flex",alignItems:"center"},children:[["T","u","A","g","e","n","t"].map((c,d)=>(0,b.jsx)("span",{ref:b=>{a.current[d]=b},style:{fontSize:36,fontWeight:900,color:"white",display:"inline-block"},children:c},d)),(0,b.jsx)("span",{ref:d,style:{fontSize:36,fontWeight:900,color:"#3b82f6",display:"inline-block"},children:"X"})]})})}])}];

//# sourceMappingURL=app_%28app%29_loading_tsx_0.-gf9r._.js.map