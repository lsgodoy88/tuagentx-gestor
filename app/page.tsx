'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import CotizadorGestor from '@/components/Cotizador'
import PlanesDinamicos from '@/components/PlanesDinamicos'

export default function HomePage() {
  const [precios, setPrecios] = useState<Record<string, number>>({})
  const [preciosLoading, setPreciosLoading] = useState(true)

  useEffect(() => {
    fetch('/api/precios/publico')
      .then(r => r.json())
      .then((data: { precios: { rol: string; precio: number }[] }) => {
        const map: Record<string, number> = {}
        for (const p of data.precios ?? []) map[p.rol] = p.precio
        setPrecios(map)
        setPreciosLoading(false)
      })
      .catch(() => setPreciosLoading(false))
  }, [])
  return (
    <div style={{minHeight:'auto',background:'#06050f',display:'flex',flexDirection:'column',fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:'#fff',overflowX:'hidden'}}>
      <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 40px',background:'rgba(6,5,15,0.92)',backdropFilter:'blur(20px)',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontWeight:800,fontSize:'1.3rem'}}>
          <div style={{width:34,height:34,background:'#2563eb',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontSize:16}}>🗺️</span>
          </div>
          <div style={{display:'flex',alignItems:'baseline',gap:4}}>
            <span style={{letterSpacing:0}}>{'TuAgent'}<span style={{color:'#2563eb'}}>X</span></span>
            <span style={{fontSize:'.8rem',color:'#93c5fd',fontWeight:600,verticalAlign:'baseline'}}>Gestor</span>
          </div>
        </div>
        <Link href="/login" style={{background:'#2563eb',color:'#fff',fontWeight:700,padding:'8px 20px',borderRadius:8,textDecoration:'none',fontSize:'.85rem'}}>Ingresar →</Link>
      </nav>

      {/* HERO */}
      <div style={{flex:1,padding:'80px 24px 40px',minHeight:'auto',background:'radial-gradient(ellipse at 70% 50%, rgba(37,99,235,.15) 0%, transparent 60%)'}}>
        <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row items-center gap-10 md:gap-16">

          {/* LEFT: texto + CTAs */}
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left gap-5">
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(37,99,235,.1)',border:'1px solid rgba(37,99,235,.22)',borderRadius:16,padding:'8px 20px',fontSize:'.8rem',fontWeight:700,letterSpacing:1,textTransform:'uppercase' as const,color:'#93c5fd',boxShadow:'0 0 20px rgba(37,99,235,.4), 0 0 40px rgba(37,99,235,.2)'}}>📍 Gestión de fuerza de campo</div>
            <h1 style={{fontSize:'clamp(2rem,5vw,3rem)',fontWeight:800,lineHeight:1.12,letterSpacing:-.5,margin:0}}>Tu equipo en campo,<br/><span style={{color:'#93c5fd'}}>bajo control total</span></h1>
            <p style={{color:'#9ca3af',fontSize:'clamp(.9rem,2vw,1.05rem)',lineHeight:1.65,maxWidth:420,margin:0}}>Rutas, visitas, GPS y reportes en tiempo real. Supervisores, vendedores e impulsadoras, todos conectados desde el móvil.</p>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center',width:'100%',maxWidth:340}}>
              <button onClick={() => { document.getElementById('demoGps')?.scrollIntoView({behavior:'smooth'}); setTimeout(() => (window as any).iniciarDemoGps?.(), 800); }} style={{flex:1,minWidth:160,background:'#2563eb',color:'#fff',fontWeight:700,padding:'10px 20px',borderRadius:10,border:'none',fontSize:'.85rem',textAlign:'center' as const,cursor:'pointer',boxShadow:'0 0 24px rgba(37,99,235,.3)'}}>📍 Probar Demo</button>
              <button onClick={() => document.getElementById('cotizador')?.scrollIntoView({behavior:'smooth'})} style={{flex:1,minWidth:160,background:'transparent',color:'#93c5fd',fontWeight:700,padding:'10px 20px',borderRadius:10,border:'1px solid rgba(37,99,235,.3)',fontSize:'.85rem',textAlign:'center' as const,cursor:'pointer',boxShadow:'0 0 20px rgba(37,99,235,.4), 0 0 40px rgba(37,99,235,.15)'}}>💰 Cotiza Ya</button>
            </div>
            <p style={{fontSize:'.72rem',color:'#6b7280'}}>✓ Sin contrato · ✓ Funciona desde el movil · ✓ Soporte en español</p>
          </div>

          {/* RIGHT: mockup animado */}
          <div className="flex-1 flex justify-center">
            <div style={{width:'100%',maxWidth:480,background:'#111',borderRadius:16,border:'1px solid rgba(255,255,255,.07)',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,.7), 0 0 40px rgba(37,99,235,.3), 0 0 80px rgba(37,99,235,.15)'}}>
              <div style={{background:'#0e0d1e',padding:'10px 12px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#2563eb,#4f46e5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>🗺️</div>
                <div><div style={{fontSize:'.9rem',fontWeight:700}}>Ruta activa · Hoy</div><div style={{fontSize:'.72rem',color:'#93c5fd'}}>● 3 en turno</div></div>
                <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                  <div style={{background:'rgba(37,99,235,.15)',border:'1px solid rgba(37,99,235,.25)',borderRadius:8,padding:'4px 10px',textAlign:'center'}}>
                    <div style={{fontSize:'1.1rem',fontWeight:800,color:'#93c5fd'}} id="visitCount">0</div>
                    <div style={{fontSize:'.65rem',color:'#9ca3af'}}>visitas</div>
                  </div>
                  <div style={{background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.2)',borderRadius:8,padding:'4px 10px',textAlign:'center'}}>
                    <div style={{fontSize:'1.1rem',fontWeight:800,color:'#10b981'}} id="saleCount">0</div>
                    <div style={{fontSize:'.65rem',color:'#9ca3af'}}>ventas</div>
                  </div>
                </div>
              </div>
              <div style={{position:'relative',background:'#0d1117',height:220}}>
                <svg viewBox="0 0 340 180" style={{width:'100%',height:'100%'}}>
                  <defs><pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M 34 0 L 0 0 0 34" fill="none" stroke="rgba(37,99,235,.06)" strokeWidth=".5"/></pattern></defs>
                  <rect width="340" height="180" fill="url(#grid)"/>
                  <line x1="0" y1="90" x2="340" y2="90" stroke="rgba(255,255,255,.04)" strokeWidth="8"/>
                  <line x1="170" y1="0" x2="170" y2="180" stroke="rgba(255,255,255,.04)" strokeWidth="8"/>
                  <line x1="0" y1="45" x2="340" y2="45" stroke="rgba(255,255,255,.03)" strokeWidth="4"/>
                  <line x1="0" y1="135" x2="340" y2="135" stroke="rgba(255,255,255,.03)" strokeWidth="4"/>
                  <line x1="85" y1="0" x2="85" y2="180" stroke="rgba(255,255,255,.03)" strokeWidth="4"/>
                  <line x1="255" y1="0" x2="255" y2="180" stroke="rgba(255,255,255,.03)" strokeWidth="4"/>
                  <polyline id="rutaLine" points="" fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="4 2" opacity=".7"/>
                  {[[55,130],[130,60],[200,120],[270,55],[300,140]].map(([x,y],i)=>(
                    <g key={i}>
                      <circle cx={x} cy={y} r="10" fill="rgba(37,99,235,.12)" stroke="rgba(37,99,235,.3)" strokeWidth="1"/>
                      <circle cx={x} cy={y} r="5" fill="#2563eb" opacity=".7"/>
                      <text x={x} y={y+4} textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold">{i+1}</text>
                    </g>
                  ))}
                  <g id="cursor" transform="translate(55,130)">
                    <circle r="9" fill="#10b981" opacity=".25"/>
                    <circle r="5" fill="#10b981"/>
                    <text textAnchor="middle" y="4" fill="#000" fontSize="6" fontWeight="bold">C</text>
                  </g>
                  <circle id="pulse" cx="55" cy="130" r="5" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0"/>
                </svg>
                <div id="statusBadge" style={{position:'absolute',bottom:10,left:10,background:'rgba(16,185,129,.15)',border:'1px solid rgba(16,185,129,.3)',borderRadius:8,padding:'4px 10px',fontSize:'.65rem',color:'#10b981',fontWeight:600}}>📍 En punto 1</div>
              </div>
              <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:4}}>
                {['Tienda Norte','Almacen Centro','Punto Sur','Bodega Este','Local Oeste'].map((name,i)=>(
                  <div key={i} id={'pt'+i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px',borderRadius:6,background:'rgba(255,255,255,.02)',transition:'all .3s'}}>
                    <div style={{width:16,height:16,borderRadius:'50%',background:'rgba(37,99,235,.2)',border:'1px solid rgba(37,99,235,.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'.55rem',fontWeight:700,color:'#93c5fd'}}>{i+1}</div>
                    <span style={{fontSize:'.85rem',flex:1,color:'rgba(255,255,255,.6)'}}>{name}</span>
                    <span id={'ptst'+i} style={{fontSize:'.72rem',color:'rgba(255,255,255,.25)'}}>—</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}.shimmer-section{background:linear-gradient(90deg,transparent 0%,rgba(37,99,235,.08) 50%,transparent 100%);background-size:200% 100%;animation:shimmer 4s ease-in-out infinite}`}</style>

      {/* FEATURES */}
      <div className="shimmer-section" style={{padding:'32px 24px 40px',borderTop:'1px solid rgba(255,255,255,.05)',boxShadow:'0 0 40px rgba(37,99,235,.15)'}}>
        <div className="max-w-screen-xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[['🗺️','Rutas asignadas','Con orden de visita'],['📍','GPS tiempo real','Mapa Leaflet'],['👥','Multi-rol','Supervisores y vendedores'],['📊','Reportes diarios','Ventas, cobros, entregas'],['⚡','Impulsadoras','GPS validado'],['🔔','Notif push','Alertas instantaneas']].map(([ico,name,desc])=>(
              <div key={name} style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,padding:'12px 14px',textAlign:'left'}}>
                <div style={{fontSize:'1.1rem',marginBottom:5}}>{ico}</div>
                <div style={{fontSize:'.78rem',fontWeight:600,marginBottom:2}}>{name}</div>
                <div style={{fontSize:'.7rem',color:'#9ca3af',lineHeight:1.3}}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECCIÓN DEMO GPS */}
      <div id="demoGps" className="shimmer-section" style={{background:'rgba(0,0,0,.25)',padding:'40px 24px',borderTop:'1px solid rgba(37,99,235,.1)',boxShadow:'0 0 40px rgba(37,99,235,.15)'}}>
        <div className="max-w-screen-xl mx-auto">
          <div style={{maxWidth:520,margin:'0 auto',textAlign:'center'}}>
            <div style={{fontSize:'.68rem',fontWeight:700,letterSpacing:2,textTransform:'uppercase',color:'#93c5fd',marginBottom:12}}>🗺️ DEMO EN VIVO</div>
            <h2 style={{fontSize:'clamp(1.4rem,3vw,1.9rem)',fontWeight:800,marginBottom:12}}>Ve cómo funciona<br/><span style={{color:'#93c5fd'}}>con tu ubicación real</span></h2>
            <p style={{color:'#9ca3af',fontSize:'.9rem',lineHeight:1.6,marginBottom:28,maxWidth:380,margin:'0 auto 28px'}}>Activa el GPS y te mostramos una ruta simulada cerca de ti, tal como la ven tus vendedores en campo.</p>
            <button id="btnDemoGps" onClick={() => {if(typeof window!=='undefined')(window as any).iniciarDemoGps()}} style={{background:'#2563eb',color:'#fff',fontWeight:700,padding:'14px 32px',borderRadius:10,border:'none',fontSize:'1rem',cursor:'pointer',boxShadow:'0 0 24px rgba(37,99,235,.3)',marginBottom:24}}>📍 Probar demo GPS</button>
            <div id="demoMapContainer" style={{display:'none',width:'100%',borderRadius:16,overflow:'hidden',border:'1px solid rgba(37,99,235,.2)',boxShadow:'0 20px 60px rgba(0,0,0,.7), 0 0 40px rgba(37,99,235,.3), 0 0 80px rgba(37,99,235,.15)'}}>
              <div style={{background:'#0e0d1e',padding:'10px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 6px #10b981'}}></div>
                <span style={{fontSize:'.9rem',fontWeight:700,color:'#fff'}}>Ruta demo · 3 puntos</span>
                <span id="demoStatus" style={{marginLeft:'auto',fontSize:'.65rem',color:'#93c5fd'}}>Cargando mapa...</span>
              </div>
              <div id="demoMap" style={{height:'clamp(280px,50vw,380px)'}}></div>
              <div id="demoPuntos" style={{padding:'10px',display:'flex',flexDirection:'column',gap:4,overflow:'visible'}}></div>
            </div>
            <p id="demoError" style={{display:'none',color:'#f87171',fontSize:'.8rem',marginTop:12}}>GPS no disponible. Intenta desde el móvil.</p>
          </div>
        </div>
      </div>

      <PlanesDinamicos precios={precios} loading={preciosLoading} />
      <CotizadorGestor precios={precios} loading={preciosLoading} />
      <footer style={{background:'#07070a',padding:'24px 40px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{fontWeight:800,fontSize:'.95rem'}}>{'TuAgent'}<span style={{color:'#2563eb'}}>X</span> <span style={{fontSize:'.65rem',color:'#93c5fd',fontWeight:600}}>Gestor</span></div>
        <div style={{color:'#6b7280',fontSize:'.75rem'}}>© 2026 TuAgentX · Colombia</div>
      </footer>
      <script dangerouslySetInnerHTML={{__html:`const pts=[[55,130],[130,60],[200,120],[270,55],[300,140]];let ci=0,visitC=0,saleC=0;const cursor=document.getElementById('cursor');const rutaLine=document.getElementById('rutaLine');const pulse=document.getElementById('pulse');const statusBadge=document.getElementById('statusBadge');const visitCount=document.getElementById('visitCount');const saleCount=document.getElementById('saleCount');const names=['Tienda Norte','Almacen Centro','Punto Sur','Bodega Este','Local Oeste'];function moveTo(idx){const[x,y]=pts[idx];cursor.setAttribute('transform','translate('+x+','+y+')');pulse.setAttribute('cx',x);pulse.setAttribute('cy',y);const seg=pts.slice(0,idx+1).map(p=>p[0]+','+p[1]).join(' ');rutaLine.setAttribute('points',seg);pulse.style.opacity='1';pulse.setAttribute('r','5');let r=5;const pint=setInterval(()=>{r+=0.6;pulse.setAttribute('r',r);pulse.style.opacity=String(Math.max(0,1-(r-5)/12));if(r>17){clearInterval(pint);pulse.style.opacity='0'}},30);const ptEl=document.getElementById('pt'+idx);const ptstEl=document.getElementById('ptst'+idx);if(ptEl){ptEl.style.background='rgba(37,99,235,.12)';ptEl.style.borderLeft='2px solid #2563eb'}statusBadge.textContent='📍 En '+names[idx];visitC++;visitCount.textContent=visitC;if(Math.random()>.45){saleC++;saleCount.textContent=saleC;if(ptstEl){ptstEl.textContent='💰 venta';ptstEl.style.color='#10b981'}}else{if(ptstEl){ptstEl.textContent='✓ visita';ptstEl.style.color='#93c5fd'}}}function step(){if(ci>=pts.length){setTimeout(()=>{ci=0;visitC=0;saleC=0;visitCount.textContent='0';saleCount.textContent='0';rutaLine.setAttribute('points','');cursor.setAttribute('transform','translate('+pts[0][0]+','+pts[0][1]+')');for(let i=0;i<5;i++){const el=document.getElementById('pt'+i);const st=document.getElementById('ptst'+i);if(el){el.style.background='rgba(255,255,255,.02)';el.style.borderLeft='none'}if(st){st.textContent='—';st.style.color='rgba(255,255,255,.25)'}}statusBadge.textContent='📍 En punto 1';setTimeout(step,600)},3000);return}moveTo(ci);ci++;setTimeout(step,ci===pts.length?2500:1400)}setTimeout(step,900);`}}/>

      <script dangerouslySetInnerHTML={{__html:`
        function iniciarDemoGps() {
          var btn = document.getElementById('btnDemoGps');
          var container = document.getElementById('demoMapContainer');
          var error = document.getElementById('demoError');
          var status = document.getElementById('demoStatus');
          btn.textContent = '📡 Obteniendo GPS...';
          btn.disabled = true;
          if (!navigator.geolocation) {
            error.style.display = 'block';
            btn.textContent = '📍 Probar demo GPS';
            btn.disabled = false;
            return;
          }
          navigator.geolocation.getCurrentPosition(function(pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            btn.textContent = '🔍 Buscando comercios...';

            function buildQuery(radius) {
              return '[out:json][timeout:15];(' +
                'node["shop"](around:' + radius + ',' + lat + ',' + lng + ');' +
                'node["amenity"](around:' + radius + ',' + lat + ',' + lng + ');' +
                'node["office"](around:' + radius + ',' + lat + ',' + lng + ');' +
                'node["tourism"](around:' + radius + ',' + lat + ',' + lng + ');' +
                ');out 50;';
            }

            function filterNamed(elements) {
              return elements.filter(function(n) { return n.tags && n.tags.name; }).slice(0, 3);
            }

            function renderDemo(nodes) {
              var puntos;
              if (nodes && nodes.length > 0) {
                puntos = nodes.map(function(n, i) {
                  return { lat: n.lat, lng: n.lon, nombre: n.tags.name };
                });
              } else {
                puntos = [
                  {lat: lat + 0.0009, lng: lng + 0.0005, nombre: 'Tienda Don Carlos'},
                  {lat: lat - 0.0007, lng: lng + 0.0012, nombre: 'Supermercado El Ahorro'},
                  {lat: lat + 0.0004, lng: lng - 0.0010, nombre: 'Distribuidora La 15'}
                ];
              }

              container.style.display = 'block';
              btn.style.display = 'none';
              status.textContent = 'GPS activo';
              setTimeout(function() {
                container.scrollIntoView({behavior:'smooth', block:'center'});
              }, 100);

              if (!document.getElementById('leafletCss')) {
                var lCss = document.createElement('link');
                lCss.id = 'leafletCss';
                lCss.rel = 'stylesheet';
                lCss.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(lCss);
              }
              var lScript = document.createElement('script');
              lScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
              lScript.onload = function() {
                var L = window.L;
                var mapHeight = window.innerWidth < 640 ? 280 : 380;
                document.getElementById('demoMap').style.height = mapHeight + 'px';
                var map = L.map('demoMap', {zoomControl: true, attributionControl: false}).setView([lat, lng], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);

                var iconUser = L.divIcon({html: '<div style="background:#10b981;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px #10b981"></div>', className:'', iconSize:[14,14], iconAnchor:[7,7]});
                L.marker([lat, lng], {icon: iconUser}).addTo(map).bindPopup('<b>📍 Tu ubicación</b>');

                var coordsRuta = [[lat, lng]];
                puntos.forEach(function(p) { coordsRuta.push([p.lat, p.lng]); });
                L.polyline(coordsRuta, {color:'#2563eb', weight:3, dashArray:'8 5', opacity:0.8}).addTo(map);

                var demoPuntosEl = document.getElementById('demoPuntos');
                var markers = [];
                var rowEls = [];

                puntos.forEach(function(p, i) {
                  var iconPunto = L.divIcon({
                    html: '<div id="demoMarker'+i+'" style="background:#2563eb;width:28px;height:28px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.5)">'+(i+1)+'</div>',
                    className:'', iconSize:[28,28], iconAnchor:[14,14]
                  });
                  var m = L.marker([p.lat, p.lng], {icon: iconPunto}).addTo(map)
                    .bindPopup('<b>'+(i+1)+'. '+p.nombre+'</b><br><span style="color:#2563eb">⏳ Pendiente</span>');
                  markers.push(m);

                  var row = document.createElement('div');
                  row.id = 'demoRow' + i;
                  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.03);transition:all .3s;';
                  row.innerHTML = '<div id="demoRowNum'+i+'" style="width:20px;height:20px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:#fff;flex-shrink:0">'+(i+1)+'</div><span style="font-size:.75rem;color:rgba(255,255,255,.7);flex:1">'+p.nombre+'</span><span id="demoRowSt'+i+'" style="font-size:.65rem;color:#93c5fd">Pendiente</span>';
                  demoPuntosEl.appendChild(row);
                  rowEls.push(row);
                });

                status.textContent = '📍 En ' + puntos[0].nombre;

                // Animated tour
                var tourIdx = 0;
                function tourStep() {
                  var p = puntos[tourIdx];
                  status.textContent = '📍 En ' + p.nombre;
                  map.panTo([p.lat, p.lng]);
                  markers[tourIdx].openPopup();

                  var markerEl = document.getElementById('demoMarker' + tourIdx);
                  if (markerEl) { markerEl.style.background = '#10b981'; markerEl.textContent = '✓'; }
                  var rowEl = rowEls[tourIdx];
                  if (rowEl) { rowEl.style.background = 'rgba(16,185,129,.08)'; rowEl.style.borderLeft = '2px solid #10b981'; }
                  var numEl = document.getElementById('demoRowNum' + tourIdx);
                  if (numEl) { numEl.style.background = '#10b981'; numEl.textContent = '✓'; }
                  var stEl = document.getElementById('demoRowSt' + tourIdx);
                  if (stEl) { stEl.textContent = 'Visitado'; stEl.style.color = '#10b981'; }

                  tourIdx++;
                  if (tourIdx < puntos.length) {
                    setTimeout(tourStep, 2200);
                  } else {
                    setTimeout(function() {
                      status.textContent = puntos.length + ' comercios recorridos ✓';
                    }, 1000);
                  }
                }
                setTimeout(tourStep, 1000);
              };
              document.head.appendChild(lScript);
            }

            var radios = [100, 300, 500, 1000];
            var radioIdx = 0;

            function tryRadius() {
              var radius = radios[radioIdx];
              btn.textContent = '📍 Organizando tu ruta de hoy...';
              fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: buildQuery(radius)
              })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                var named = filterNamed(data.elements || []);
                if (named.length >= 3) {
                  renderDemo(named);
                } else if (radioIdx < radios.length - 1) {
                  radioIdx++;
                  tryRadius();
                } else {
                  renderDemo(named.length > 0 ? named : null);
                }
              })
              .catch(function() { renderDemo(null); });
            }

            tryRadius();

          }, function() {
            error.style.display = 'block';
            btn.textContent = '📍 Probar demo GPS';
            btn.disabled = false;
          }, {timeout: 10000, enableHighAccuracy: true});
        }
        window.iniciarDemoGps = iniciarDemoGps;
      `}} />


    </div>
  )
}
