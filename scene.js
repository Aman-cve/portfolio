/* Live WebGL scene.
   One fixed canvas behind the page holds:
   - the PORTFOLIO wordmark as extruded 3D letters, pinned to where the DOM wordmark sits;
     each letter drops in on load and leans away from the cursor
   - a core with three materials (molten, glass, chrome) that reacts to the cursor and pulses on click
   - a geodesic cage, two orbit lines with satellites, and a field of drifting embers
   The core travels between sections as the page scrolls. If WebGL or the CDN is unavailable
   the page falls back to the plain CSS hero. */
(function () {
  'use strict';
  var root = document.documentElement;
  var canvas = document.getElementById('scene');
  var mm = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  var reduce = mm('(prefers-reduced-motion: reduce)');
  var finePointer = mm('(hover: hover) and (pointer: fine)');

  function ready(ok) {
    root.classList.add(ok ? 'webgl' : 'no-webgl');
    window.__sceneReady = true;
    window.dispatchEvent(new Event('scene-ready'));
  }

  if (!canvas) { ready(false); return; }
  try {
    var probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
  } catch (e) { ready(false); return; }

  Promise.all([
    import('three'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js')
  ]).then(function (m) {
    try {
      start(m[0], m[1].EffectComposer, m[2].RenderPass, m[3].UnrealBloomPass, m[4].OutputPass);
    } catch (err) {
      if (window.console) console.warn('[scene] failed to start', err);
      ready(false);
    }
  }).catch(function (err) {
    if (window.console) console.warn('[scene] could not load three.js', err);
    ready(false);
  });

  /* ---------- shaders ---------- */

  var NOISE = [
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0);',
    '  const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy));',
    '  vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz);',
    '  vec3 l=1.0-g;',
    '  vec3 i1=min(g.xyz,l.zxy);',
    '  vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx;',
    '  vec3 x2=x0-i2+C.yyy;',
    '  vec3 x3=x0-D.yyy;',
    '  i=mod289(i);',
    '  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857;',
    '  vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z);',
    '  vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy;',
    '  vec4 y=y_*ns.x+ns.yyyy;',
    '  vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy);',
    '  vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0;',
    '  vec4 s1=floor(b1)*2.0+1.0;',
    '  vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;',
    '  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x);',
    '  vec3 p1=vec3(a0.zw,h.y);',
    '  vec3 p2=vec3(a1.xy,h.z);',
    '  vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);',
    '  m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  var CORE_VERT = [
    'uniform float uTime;',
    'uniform float uAmp;',
    'uniform float uFreq;',
    'uniform vec3 uHit;',
    'uniform float uHitS;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'varying float vD;',
    'varying vec3 vP;',
    NOISE,
    'float disp(vec3 p){',
    '  float n=snoise(p*uFreq+vec3(0.0,uTime*0.22,uTime*0.11));',
    '  float n2=snoise(p*uFreq*2.1-vec3(uTime*0.17))*0.1;',
    '  float d=distance(p,uHit);',
    '  float h=exp(-d*d*3.2)*uHitS;',
    '  return (n+n2)*uAmp+h*0.15;',
    '}',
    'void main(){',
    '  vec3 p=normalize(position);',
    '  float d=disp(p);',
    '  vec3 pos=p*(1.0+d);',
    '  vec3 up=abs(p.y)<0.99?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);',
    '  vec3 t=normalize(cross(up,p));',
    '  vec3 b=cross(p,t);',
    '  float e=0.02;',
    '  vec3 pa=normalize(p+t*e);',
    '  vec3 pb=normalize(p+b*e);',
    '  vec3 n=normalize(cross(pa*(1.0+disp(pa))-pos,pb*(1.0+disp(pb))-pos));',
    '  vN=normalize(normalMatrix*n);',
    '  vec4 mv=modelViewMatrix*vec4(pos,1.0);',
    '  vV=-mv.xyz;',
    '  vD=d;',
    '  vP=p;',
    '  gl_Position=projectionMatrix*mv;',
    '}'
  ].join('\n');

  var CORE_FRAG = [
    'uniform sampler2D tBack;',
    'uniform vec2 uRes;',
    'uniform float uRefr;',
    'uniform float uHeat;',
    'uniform float uDim;',
    'uniform float uAmp;',
    'uniform float uTime;',
    'uniform float uHitS;',
    'uniform float uPulse;',
    'uniform vec3 uBg;',
    'uniform vec3 uEmber;',
    'uniform vec3 uHot;',
    'uniform vec3 uLight;',
    'uniform vec3 uHit;',
    'uniform vec3 uMat;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'varying vec3 vP;',
    'varying float vD;',
    NOISE,
    'vec3 hash3(vec3 p){',
    '  p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));',
    '  return fract(sin(p)*43758.5453);',
    '}',
    'vec2 cells(vec3 x){',
    '  vec3 i=floor(x);',
    '  vec3 f=fract(x);',
    '  float d1=8.0;',
    '  float d2=8.0;',
    '  for(int a=-1;a<=1;a++){for(int b=-1;b<=1;b++){for(int c=-1;c<=1;c++){',
    '    vec3 g=vec3(float(a),float(b),float(c));',
    '    vec3 r=g+hash3(i+g)-f;',
    '    float d=dot(r,r);',
    '    if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}',
    '  }}}',
    '  return vec2(sqrt(d1),sqrt(d2));',
    '}',
    'vec3 studio(vec3 r){',
    '  vec3 c=mix(vec3(0.016,0.011,0.01),vec3(0.1,0.078,0.068),smoothstep(-0.4,0.9,r.y));',
    '  c+=vec3(1.0,0.92,0.84)*smoothstep(0.6,0.84,r.y)*0.8;',
    '  c+=uEmber*(1.0-smoothstep(0.0,0.2,abs(r.y+0.2)))*0.95;',
    '  c+=uHot*smoothstep(0.72,0.98,r.x)*0.55;',
    '  c+=vec3(0.9,0.86,0.82)*smoothstep(0.8,0.98,-r.x)*0.3;',
    '  return c;',
    '}',
    'void main(){',
    '  vec3 N=normalize(vN);',
    '  vec3 V=normalize(vV);',
    '  float ndv=clamp(dot(N,V),0.0,1.0);',
    '  float fres=pow(1.0-ndv,2.6);',
    '  vec2 uv=gl_FragCoord.xy/uRes;',
    '  vec2 asp=vec2(uRes.y/uRes.x,1.0);',
    '  vec3 R=reflect(-V,N);',
    '  float nh=max(dot(N,normalize(normalize(uLight)+V)),0.0);',
    '  vec3 rim=mix(uEmber,uHot,fres)*fres*fres;',
    '  vec3 col=vec3(0.0);',
    '  if(uMat.x>0.002){',
    '    vec2 off=N.xy*uRefr*asp;',
    '    vec3 g;',
    '    g.r=texture2D(tBack,uv-off*0.95).r;',
    '    g.g=texture2D(tBack,uv-off).g;',
    '    g.b=texture2D(tBack,uv-off*1.05).b;',
    '    g*=vec3(0.9,0.84,0.8);',
    '    g=mix(g,vec3(0.016,0.011,0.01),0.4+0.35*fres);',
    '    g+=vec3(1.0,0.9,0.8)*smoothstep(0.38,0.94,R.y)*0.15;',
    '    g+=uEmber*(1.0-smoothstep(-0.98,-0.05,R.y))*0.4;',
    '    float heat=1.0-smoothstep(-0.62,-0.12,vD/max(uAmp,0.001)*0.5);',
    '    g+=uEmber*heat*heat*uHeat*0.9;',
    '    g+=rim*2.3;',
    '    g+=vec3(1.0,0.94,0.88)*(pow(nh,260.0)*1.5+pow(nh,26.0)*0.07);',
    '    g+=uHot*pow(max(dot(N,normalize(normalize(vec3(0.75,-0.35,0.45))+V)),0.0),40.0)*0.38;',
    '    col+=g*uMat.x;',
    '  }',
    '  if(uMat.y>0.002){',
    '    vec2 w=cells(vP*3.1);',
    '    float e=w.y-w.x;',
    '    float line=1.0-smoothstep(0.0,0.032,e);',
    '    float glow=exp(-e*11.0);',
    '    float wave=0.5+0.5*sin(uTime*0.9+snoise(vP*1.3+vec3(uTime*0.05))*4.0);',
    '    float dh=distance(vP,uHit);',
    '    float power=(0.1+0.9*wave*wave)*(0.6+uHeat)+exp(-dh*dh*3.0)*uHitS*1.6+uPulse*2.4;',
    '    vec3 m=vec3(0.024,0.017,0.015)*(0.55+0.9*w.x);',
    '    m+=vec3(1.0,0.9,0.8)*smoothstep(0.35,0.95,R.y)*0.045;',
    '    m+=vec3(1.0,0.94,0.88)*(pow(nh,70.0)*0.3+pow(nh,12.0)*0.03)*(1.0-line);',
    '    m+=uEmber*glow*0.3*power;',
    '    m+=mix(uEmber,vec3(1.0,0.7,0.3),line*power)*line*1.7*power;',
    '    m+=rim*1.7;',
    '    col+=m*uMat.y;',
    '  }',
    '  if(uMat.z>0.002){',
    '    vec3 c=studio(R);',
    '    c+=texture2D(tBack,uv+R.xy*asp*0.22).rgb*0.85;',
    '    c*=mix(vec3(0.8,0.76,0.73),vec3(1.0),fres);',
    '    c+=vec3(1.0,0.95,0.9)*pow(nh,300.0)*1.7;',
    '    c+=rim*0.7;',
    '    col+=c*uMat.z;',
    '  }',
    '  gl_FragColor=vec4(mix(uBg,col,uDim),1.0);',
    '}'
  ].join('\n');

  var EMBER_VERT = [
    'attribute vec3 aSeed;',
    'uniform float uTime;',
    'uniform float uShift;',
    'uniform float uSize;',
    'uniform float uH;',
    'uniform vec2 uMouse;',
    'uniform float uMouseS;',
    'uniform vec3 uCore;',
    'uniform float uPulse;',
    'varying float vA;',
    'varying float vS;',
    'void main(){',
    '  vec3 p=position;',
    '  float sp=0.05+aSeed.x*0.2;',
    '  p.y=mod(p.y+uTime*sp+uShift*(0.35+aSeed.z)+uH,2.0*uH)-uH;',
    '  p.x+=sin(uTime*0.35+aSeed.y*6.2831)*0.2;',
    '  p.z+=cos(uTime*0.27+aSeed.x*6.2831)*0.2;',
    '  vec2 dm=p.xy-uMouse*(1.0-p.z/10.0);',
    '  float dd=dot(dm,dm);',
    '  p.xy+=(vec2(-dm.y,dm.x)*0.55*exp(-dd*0.55)+dm*0.3*exp(-dd*0.9))*uMouseS;',
    '  vec3 dc=p-uCore;',
    '  float dl=max(length(dc),0.001);',
    '  p+=dc/dl*uPulse*1.5*exp(-dl*0.28);',
    '  vec4 mv=modelViewMatrix*vec4(p,1.0);',
    '  float dist=-mv.z;',
    '  gl_PointSize=uSize*(0.35+aSeed.z*1.15)/dist;',
    '  float tw=0.6+0.4*sin(uTime*(0.8+aSeed.y*2.4)+aSeed.x*40.0);',
    '  vA=(0.2+0.8*aSeed.y)*tw*smoothstep(1.2,5.0,dist)*(1.0+uPulse*1.5);',
    '  vS=aSeed.x;',
    '  gl_Position=projectionMatrix*mv;',
    '}'
  ].join('\n');

  var EMBER_FRAG = [
    'uniform vec3 uC1;',
    'uniform vec3 uC2;',
    'uniform float uFade;',
    'varying float vA;',
    'varying float vS;',
    'void main(){',
    '  float d=length(gl_PointCoord-0.5);',
    '  float a=1.0-smoothstep(0.04,0.5,d);',
    '  gl_FragColor=vec4(mix(uC1,uC2,vS)*a*a*vA*uFade,1.0);',
    '}'
  ].join('\n');

  var BURST_VERT = [
    'attribute vec3 aSeed;',
    'uniform float uB;',
    'uniform float uSize;',
    'uniform float uTime;',
    'varying float vA;',
    'varying float vS;',
    'void main(){',
    '  vec3 d=normalize(position);',
    '  vec3 p=d*(1.02+uB*(0.6+aSeed.x*3.4));',
    '  float a=uB*(1.2+aSeed.y*2.6);',
    '  float c=cos(a);',
    '  float s=sin(a);',
    '  p=vec3(p.x*c-p.z*s,p.y+sin(aSeed.z*6.2831+uTime*2.0)*0.2*uB,p.x*s+p.z*c);',
    '  vec4 mv=modelViewMatrix*vec4(p,1.0);',
    '  gl_PointSize=uSize*(0.5+aSeed.z*1.2)/-mv.z;',
    '  vA=0.55+0.45*aSeed.y;',
    '  vS=aSeed.x;',
    '  gl_Position=projectionMatrix*mv;',
    '}'
  ].join('\n');

  /* ---------- scene ---------- */

  function start(THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
    var mobile = window.innerWidth < 760 || mm('(pointer: coarse)');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(DPR);
    renderer.toneMapping = THREE.NoToneMapping;

    var C_BG = new THREE.Color(0x0c0a0a);
    var C_EMBER = new THREE.Color(0xf05a22);
    var C_HOT = new THREE.Color(0xff8a3c);
    var C_FG = new THREE.Color(0xf3eee8);
    renderer.setClearColor(C_BG, 1);

    var FOV = 35, CAM_Z = 10;
    var tanH = Math.tan(FOV * Math.PI / 360);
    var W = 1, H = 1, aspect = 1;
    function visH(dist) { return 2 * dist * tanH; }

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    camera.position.set(0, 0, CAM_Z);

    /* Rig: core + cage + orbits. Radius 1 in local units; scaled per section. */
    var rig = new THREE.Group();
    scene.add(rig);

    var coreU = {
      uTime: { value: 0 }, uAmp: { value: 0.095 }, uFreq: { value: 0.78 },
      uHit: { value: new THREE.Vector3(0, 0, 1) }, uHitS: { value: 0 },
      tBack: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uRefr: { value: 0.1 },
      uHeat: { value: 0.4 }, uDim: { value: 1 }, uPulse: { value: 0 }, uMat: { value: new THREE.Vector3(0, 1, 0) }, uLight: { value: new THREE.Vector3(-0.55, 0.75, 0.6) },
      uBg: { value: C_BG }, uEmber: { value: C_EMBER }, uHot: { value: C_HOT }
    };
    var core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, mobile ? 26 : 48),
      new THREE.ShaderMaterial({ uniforms: coreU, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG })
    );
    rig.add(core);

    function glowTexture() {
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var g = c.getContext('2d');
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }
    var glow = glowTexture();

    /* Geodesic cage with glowing nodes */
    var cage = new THREE.Group();
    var cageBase = new THREE.IcosahedronGeometry(1.34, 1);
    var cageLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(cageBase),
      new THREE.LineBasicMaterial({ color: C_EMBER, transparent: true, opacity: 0.15, depthWrite: false })
    );
    cageLines.renderOrder = 60;
    cage.add(cageLines);
    (function () {
      var pos = cageBase.getAttribute('position'), seen = {}, pts = [];
      for (var i = 0; i < pos.count; i++) {
        var key = pos.getX(i).toFixed(3) + '|' + pos.getY(i).toFixed(3) + '|' + pos.getZ(i).toFixed(3);
        if (seen[key]) continue;
        seen[key] = 1;
        pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      var nodes = new THREE.Points(g, new THREE.PointsMaterial({
        map: glow, color: C_HOT, size: 0.085, sizeAttenuation: true, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      nodes.renderOrder = 61;
      cage.add(nodes);
      cage.userData.nodes = nodes;
    })();
    rig.add(cage);

    /* Orbit lines with a bright satellite each */
    function circle(radius, segments) {
      var pts = [];
      for (var i = 0; i < segments; i++) {
        var a = i / segments * Math.PI * 2;
        pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return g;
    }
    function orbit(radius, color, opacity, tiltX, tiltY, speed) {
      var holder = new THREE.Group();
      holder.rotation.set(tiltX, tiltY, 0);
      var spin = new THREE.Group();
      holder.add(spin);
      var line = new THREE.LineLoop(circle(radius, 220), new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false }));
      line.renderOrder = 62;
      spin.add(line);
      var sat = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.32) }));
      sat.position.set(radius, 0, 0);
      spin.add(sat);
      var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: C_HOT, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(0.26);
      halo.position.copy(sat.position);
      halo.renderOrder = 63;
      spin.add(halo);
      holder.userData = { spin: spin, speed: speed, line: line };
      rig.add(holder);
      return holder;
    }
    var orbits = [
      orbit(1.6, C_FG, 0.2, 1.22, 0.28, 0.32),
      orbit(1.92, C_EMBER, 0.42, 1.42, -0.5, -0.21)
    ];

    /* Shock ring fired on click */
    var shock = new THREE.LineLoop(circle(1.15, 160), new THREE.LineBasicMaterial({ color: C_HOT, transparent: true, opacity: 0, depthWrite: false }));
    shock.renderOrder = 64;
    rig.add(shock);

    var shock2 = new THREE.LineLoop(circle(1.15, 160), new THREE.LineBasicMaterial({ color: C_EMBER, transparent: true, opacity: 0, depthWrite: false }));
    shock2.renderOrder = 64;
    rig.add(shock2);

    /* Soft ember halo behind the core */
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: C_EMBER, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(3.3);
    halo.position.z = -0.25;
    halo.renderOrder = 0;
    rig.add(halo);

    /* Embers */
    var EMBER_H = 7;
    var emberU = {
      uTime: { value: 0 }, uShift: { value: 0 }, uSize: { value: 34 * DPR }, uH: { value: EMBER_H },
      uC1: { value: new THREE.Color(0xea4a1c) }, uC2: { value: new THREE.Color(0xffa25e) }, uFade: { value: 0 },
      uMouse: { value: new THREE.Vector2() }, uMouseS: { value: 0 }, uCore: { value: new THREE.Vector3() }, uPulse: { value: 0 }
    };
    (function () {
      var n = mobile ? 1400 : 4400;
      var pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 22;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 2 * EMBER_H;
        pos[i * 3 + 2] = -9 + Math.random() * 26;
        seed[i * 3] = Math.random();
        seed[i * 3 + 1] = Math.random();
        seed[i * 3 + 2] = Math.pow(Math.random(), 2.2);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
      var pts = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: emberU, vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      pts.frustumCulled = false;
      pts.renderOrder = 50;
      scene.add(pts);
    })();

    /* 3D text. Every letter is its own extruded piece (stacked layers cut from one atlas texture
       drawn in Anton), pinned to the box of a DOM line, so letters can drop in one by one and lean
       away from the cursor. Used for the hero wordmark and the contact headline. */
    var WORD_Z = 2.6, texts = [], TAU = Math.PI * 2;
    function make3DText(o) {
      var T = { group: new THREE.Group(), letters: [], mats: [], built: false, on: false, t0: -1, LH: 1 };
      T.group.visible = false;
      scene.add(T.group);
      texts.push(T);

      T.build = function () {
        if (T.built || !o.els.length) return;
        var F = o.F, font = '400 ' + F + 'px Anton, Impact, "Arial Narrow", sans-serif';
        var c = document.createElement('canvas');
        var ctx = c.getContext('2d');
        function prep() { ctx.font = font; ctx.textBaseline = 'alphabetic'; }
        prep();
        var LS = o.ls * F, LH = o.lhf * F, padX = Math.round(F * 0.07), padY = Math.round(F * 0.2);
        var m = ctx.measureText('H');
        var fa = m.fontBoundingBoxAscent || F * 1.17, fd = m.fontBoundingBoxDescent || F * 0.33;
        var glyphs = [], atlasW = 0;
        o.els.forEach(function (el, li) {
          var line = el.textContent;
          for (var i = 0; i < line.length; i++) {
            var ch = line.charAt(i);
            if (ch === ' ' || ch === ' ') continue;
            var x0 = ctx.measureText(line.slice(0, i)).width, x1 = ctx.measureText(line.slice(0, i + 1)).width;
            var cell = Math.ceil(x1 - x0) + padX * 2;
            glyphs.push({ ch: ch, line: li, x: x0 + i * LS, cell: cell, ax: atlasW });
            atlasW += cell;
          }
        });
        if (!atlasW) return;
        c.width = atlasW;
        c.height = Math.ceil(LH) + padY * 2;
        prep();
        glyphs.forEach(function (g) {
          ctx.fillStyle = o.fill(ctx, g.line, padY, LH);
          ctx.fillText(g.ch, g.ax + padX, padY + (LH - (fa + fd)) / 2 + fa);
        });
        var tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

        var LAYERS = mobile ? 8 : 12;
        var near = new THREE.Color(0x7d1d0b), far = new THREE.Color(0x1d0603);
        for (var k = 0; k < LAYERS; k++) {
          var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
          if (k > 0) mat.color.copy(near).lerp(far, k / (LAYERS - 1));
          T.mats.push(mat);
        }
        /* Depth-only copy of each front face so orbit lines and embers pass behind the letters */
        var maskMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, colorWrite: false });
        glyphs.forEach(function (g, idx) {
          var geo = new THREE.PlaneGeometry(g.cell, c.height);
          var u0 = g.ax / c.width, u1 = (g.ax + g.cell) / c.width, uv = geo.getAttribute('uv');
          uv.setXY(0, u0, 1); uv.setXY(1, u1, 1); uv.setXY(2, u0, 0); uv.setXY(3, u1, 0);
          uv.needsUpdate = true;
          var grp = new THREE.Group();
          for (var i = LAYERS - 1; i >= 0; i--) {
            var mesh = new THREE.Mesh(geo, T.mats[i]);
            mesh.position.z = -i * 0.018 * F;
            mesh.renderOrder = LAYERS - i;
            grp.add(mesh);
          }
          grp.add(new THREE.Mesh(geo, maskMat));
          grp.visible = false;
          T.group.add(grp);
          T.letters.push({
            g: grp, line: g.line, cxc: g.x + g.cell / 2 - padX,
            ox: 0, oy: 1.6, oz: 1.1, rx: -1.5, ry: (Math.random() - 0.5) * 1.5,
            vox: 0, voy: 0, voz: 0, vrx: 0, vry: 0, delay: o.delay + idx * o.step, on: false
          });
        });
        T.LH = LH;
        T.built = true;
        if (o.cls) root.classList.add(o.cls);
      };

      /* gate: when true for the first time, the letters start dropping in */
      T.update = function (dt, opacity, gate, rx, ry) {
        if (!T.built) return;
        var rs = [], left = 1e9, right = -1e9, i;
        for (i = 0; i < o.els.length; i++) {
          var rc = o.els[i].getBoundingClientRect();
          rs.push(rc); left = Math.min(left, rc.left); right = Math.max(right, rc.right);
        }
        var top = rs[0].top, bottom = rs[rs.length - 1].bottom, bh = bottom - top;
        if (!(rs[0].width > 0) || bh <= 0) { T.on = false; T.group.visible = false; return; }
        var bcx = (left + right) / 2, bcy = (top + bottom) / 2;
        T.on = bcy + bh > -H * 0.3 && bcy - bh < H * 1.3;
        T.group.visible = T.on;
        if (!T.on) return;
        var wpp = visH(CAM_Z - WORD_Z) / H;
        T.group.position.set((bcx - W / 2) * wpp, (H / 2 - bcy) * wpp, WORD_Z);
        T.group.scale.setScalar(wpp);
        T.group.rotation.set(rx, ry, 0);
        T.group.updateMatrixWorld();
        for (i = 0; i < T.mats.length; i++) T.mats[i].opacity = opacity;
        if (gate && T.t0 < 0) T.t0 = time;

        var mL = null;
        if (hasMouse && finePointer && !reduce) {
          ndc.set(mouseT.x, mouseT.y);
          raycaster.setFromCamera(ndc, camera);
          planeN.set(0, 0, 1).applyQuaternion(T.group.quaternion);
          wPlane.setFromNormalAndCoplanarPoint(planeN, T.group.position);
          if (raycaster.ray.intersectPlane(wPlane, tmpV)) mL = T.group.worldToLocal(tmpV);
        }
        var since = time - T.t0;
        for (var q = 0; q < T.letters.length; q++) {
          var L = T.letters[q], r = rs[L.line], kk = r.height / T.LH, u = r.height * 2;
          var bx = r.left + L.cxc * kk - bcx, by = bcy - (r.top + r.height / 2);
          L.g.scale.setScalar(kk);
          if (reduce) { L.g.visible = true; L.g.position.set(bx, by, 0); L.g.rotation.set(0, 0, 0); continue; }
          if (!L.on) {
            if (T.t0 >= 0 && since > L.delay) { L.on = true; L.g.visible = true; } else continue;
          }
          var tx = 0, ty = 0, tz = 0, trx = 0, tyy = 0;
          if (mL) {
            var dx = (bx - mL.x) / u, dy = (by - mL.y) / u, dd = Math.sqrt(dx * dx + dy * dy), RAD = 0.62;
            if (dd < RAD) {
              var f = 1 - dd / RAD; f *= f;
              var inv = 1 / Math.max(dd, 0.02);
              tx = dx * inv * f * 0.1; ty = dy * inv * f * 0.1; tz = f * 0.26;
              tyy = dx * inv * f * 0.85; trx = -dy * inv * f * 0.85;
            }
          }
          L.vox += ((tx - L.ox) * SK - L.vox * SD) * dt; L.ox += L.vox * dt;
          L.voy += ((ty - L.oy) * SK - L.voy * SD) * dt; L.oy += L.voy * dt;
          L.voz += ((tz - L.oz) * SK - L.voz * SD) * dt; L.oz += L.voz * dt;
          L.vrx += ((trx - L.rx) * SK - L.vrx * SD) * dt; L.rx += L.vrx * dt;
          L.vry += ((tyy - L.ry) * SK - L.vry * SD) * dt; L.ry += L.vry * dt;
          L.g.position.set(bx + L.ox * u, by + L.oy * u, L.oz * u);
          L.g.rotation.set(L.rx, L.ry, 0);
        }
      };

      T.kick = function (amount) {
        T.letters.forEach(function (L) {
          L.voz += (2 + Math.random() * 1.6) * amount;
          L.vrx += (Math.random() - 0.5) * 8 * amount;
          L.vry += (Math.random() - 0.5) * 8 * amount;
        });
      };

      if (document.fonts && document.fonts.load) {
        document.fonts.load('400 120px Anton').then(T.build, T.build);
        setTimeout(T.build, 2500);
      } else {
        setTimeout(T.build, 600);
      }
      return T;
    }

    var spans = document.querySelectorAll('.hero__word span');
    var heroText = make3DText({
      els: Array.prototype.slice.call(spans), cls: 'text3d-hero', F: 400, lhf: 0.82, ls: -0.01, delay: 0.35, step: 0.085,
      fill: function (ctx, li, padY, LH) {
        var top = padY - li * LH, g = ctx.createLinearGradient(0, top, 0, top + LH * 2);
        g.addColorStop(0, '#ff7a33'); g.addColorStop(0.48, '#ea4a1c'); g.addColorStop(1, '#7a1608');
        return g;
      }
    });
    /* Contact headline: script.js has already split it into .line__in spans */
    var contactH = document.querySelector('.contact__big');
    var contactText = make3DText({
      els: Array.prototype.slice.call(document.querySelectorAll('.contact__big .line__in')), cls: 'text3d-contact', F: 300, lhf: 0.9, ls: 0.005, delay: 0.1, step: 0.05,
      fill: function (ctx, li, padY, LH) {
        var g = ctx.createLinearGradient(0, padY, 0, padY + LH);
        if (li === 0) { g.addColorStop(0, '#ebe5de'); g.addColorStop(1, '#bfb4a9'); }
        else { g.addColorStop(0, '#ff7a33'); g.addColorStop(0.5, '#ea4a1c'); g.addColorStop(1, '#8f1c0a'); }
        return g;
      }
    });

    /* Skills: text tags that orbit the core while it is parked beside "What I do" */
    var skillStage = document.getElementById('skillStage'), tags = [], skillW = 0, tagV = new THREE.Vector3();
    function buildTags() {
      if (tags.length) return;
      var names = ['Python', 'TypeScript', 'C / C++', 'FastAPI', 'Node.js', 'PostgreSQL', 'MongoDB', 'Docker', 'Linux', 'LLM Eval', 'OWASP', 'Burp Suite'];
      names.forEach(function (name, i) {
        var c = document.createElement('canvas'), ctx = c.getContext('2d'), fs = 44, gap = fs * 0.14, padX = 36;
        var font = '600 ' + fs + 'px Archivo, "Helvetica Neue", Arial, sans-serif', label = name.toUpperCase(), tw = 0, j;
        ctx.font = font;
        for (j = 0; j < label.length; j++) tw += ctx.measureText(label.charAt(j)).width + gap;
        c.width = Math.ceil(tw - gap + padX * 2);
        c.height = 96;
        ctx.font = font;
        var rr = (c.height - 6) / 2;
        ctx.beginPath();
        ctx.moveTo(3 + rr, 3);
        ctx.lineTo(c.width - 3 - rr, 3);
        ctx.arc(c.width - 3 - rr, 3 + rr, rr, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(3 + rr, c.height - 3);
        ctx.arc(3 + rr, 3 + rr, rr, Math.PI / 2, Math.PI * 1.5);
        ctx.closePath();
        ctx.fillStyle = 'rgba(14,11,11,0.84)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(242,100,48,0.95)' : 'rgba(243,238,232,0.4)';
        ctx.stroke();
        ctx.fillStyle = '#f3eee8';
        ctx.textBaseline = 'middle';
        var x = padX;
        for (j = 0; j < label.length; j++) {
          ctx.fillText(label.charAt(j), x, c.height / 2 + 3);
          x += ctx.measureText(label.charAt(j)).width + gap;
        }
        var tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
        sp.scale.set(0.36 * c.width / c.height, 0.36, 1);
        sp.renderOrder = 66;
        sp.visible = false;
        rig.add(sp);
        var ring = i % 3;
        tags.push({
          s: sp, R: [2.0, 2.6, 3.2][ring], a: Math.floor(i / 3) / 4 * TAU + ring * 0.6, speed: [0.2, -0.15, 0.12][ring],
          tilt: new THREE.Euler([0.95, 1.15, 0.8][ring], [0.3, -0.4, 0.55][ring], 0)
        });
      });
    }
    if (skillStage) {
      if (document.fonts && document.fonts.load) {
        document.fonts.load('600 44px Archivo').then(buildTags, buildTags);
        setTimeout(buildTags, 3000);
      } else {
        setTimeout(buildTags, 800);
      }
    }

    /* Burst: the core breaks into particles and pulls itself back together */
    var burstU = {
      uB: { value: 0 }, uSize: { value: 26 * DPR }, uTime: { value: 0 }, uFade: { value: 0 },
      uC1: { value: C_EMBER }, uC2: { value: new THREE.Color(0xffc48a) }
    };
    var burstPts = (function () {
      var n = mobile ? 2200 : 5200, pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
        seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random();
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
      var pts = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: burstU, vertexShader: BURST_VERT, fragmentShader: EMBER_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      pts.frustumCulled = false;
      pts.renderOrder = 67;
      pts.visible = false;
      rig.add(pts);
      return pts;
    })();
    var burstT = -1, burstArmed = true, burstKicked = false;
    function startBurst() {
      if (reduce || burstT >= 0) return;
      burstT = 0;
      burstKicked = false;
      pulse = Math.max(pulse, 0.8);
      needs = true;
    }

    /* Post: MSAA scene -> bloom -> output. A second, smaller target holds the scene without
       the core so the core can refract it. */
    var backRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    coreU.tBack.value = backRT.texture;
    var composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    var bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.65, 0.84);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    function resize() {
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      aspect = W / H;
      renderer.setPixelRatio(DPR);
      renderer.setSize(W, H, false);
      composer.setPixelRatio(DPR);
      composer.setSize(W, H);
      backRT.setSize(Math.max(2, Math.round(W * DPR * 0.7)), Math.max(2, Math.round(H * DPR * 0.7)));
      coreU.uRes.value.set(Math.floor(W * DPR), Math.floor(H * DPR));
      emberU.uSize.value = 34 * DPR * (H / 900);
      burstU.uSize.value = 26 * DPR * (H / 900);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      measure();
      needs = true;
    }

    /* Section poses, in screen units: nx/ny from -1..1 (edges), r as a fraction of viewport height */
    var sectionEls = ['work', 'services', 'about', 'contact'].map(function (id) { return document.getElementById(id); });
    var tops = [];
    function measure() {
      var sy = window.scrollY || 0;
      tops = sectionEls.map(function (el) { return el ? el.getBoundingClientRect().top + sy : 1e9; });
    }
    function poses() {
      if (W >= 900) return [
        { nx: 0, ny: 0.02, r: 0.31, dim: 0.42, heat: 0.3, cage: 0.08 },
        { nx: 1.04, ny: 0.06, r: 0.23, dim: 0.82, heat: 0.5, cage: 0.85 },
        { nx: 1.07, ny: -0.42, r: 0.18, dim: 0.62, heat: 0.6, cage: 0.4 },
        { nx: 0.6, ny: 0.16, r: 0.27, dim: 1, heat: 1.0, cage: 0.24 }
      ];
      return [
        { nx: -1.12, ny: 0.1, r: 0.16, dim: 0.5, heat: 0.55, cage: 0.22 },
        { nx: 1.14, ny: 0.3, r: 0.17, dim: 0.6, heat: 0.5, cage: 0.8 },
        { nx: 1.16, ny: -0.5, r: 0.15, dim: 0.5, heat: 0.6, cage: 0.4 },
        { nx: 0.5, ny: 0.52, r: 0.2, dim: 0.85, heat: 1.05, cage: 0.24 }
      ];
    }
    function wordRect() {
      if (spans.length < 2) return null;
      var a = spans[0].getBoundingClientRect(), b = spans[1].getBoundingClientRect();
      return { left: Math.min(a.left, b.left), top: a.top, w: Math.max(a.width, b.width), h: b.bottom - a.top };
    }
    function smooth(a, b, x) {
      var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }

    /* Input */
    var mouseT = { x: 0, y: 0 }, mouse = { x: 0, y: 0 }, hasMouse = false, moveEnergy = 0;
    var ndc = new THREE.Vector2(), raycaster = new THREE.Raycaster(), sphere = new THREE.Sphere(), hitV = new THREE.Vector3(), hitL = new THREE.Vector3(0, 0, 1);
    var hover = 0, hoverT = 0, pulse = 0, loadedAt = -1, SK = 120, SD = 12;
    var planeN = new THREE.Vector3(), wPlane = new THREE.Plane(), tmpV = new THREE.Vector3();
    function kick(amount) {
      pulse = Math.max(pulse, amount);
      texts.forEach(function (T) { if (T.on) T.kick(amount); });
      needs = true;
    }
    function setPointer(e) {
      var nx = e.clientX / W * 2 - 1, ny = -(e.clientY / H * 2 - 1);
      moveEnergy = Math.min(1, moveEnergy + Math.hypot(nx - mouseT.x, ny - mouseT.y) * 1.6);
      mouseT.x = nx; mouseT.y = ny;
      hasMouse = true; needs = true;
    }
    function overCore() {
      ndc.set(mouseT.x, mouseT.y);
      raycaster.setFromCamera(ndc, camera);
      sphere.center.copy(rig.position);
      sphere.radius = rig.scale.x * 1.12;
      return raycaster.ray.intersectSphere(sphere, hitV);
    }
    if (finePointer) window.addEventListener('pointermove', setPointer, { passive: true });
    window.addEventListener('pointerdown', function (e) {
      if (!finePointer) { mouseT.x = e.clientX / W * 2 - 1; mouseT.y = -(e.clientY / H * 2 - 1); }
      if (overCore()) kick(1);
    }, { passive: true });
    window.addEventListener('dblclick', function () { if (overCore()) startBurst(); });

    /* Core material switcher (buttons with data-core in the hero) */
    var MATS = { glass: 0, molten: 1, chrome: 2 }, matT = [0, 1, 0];
    var matButtons = Array.prototype.slice.call(document.querySelectorAll('[data-core]'));
    function setMat(name, fromUser) {
      if (!(name in MATS)) return;
      matT = [0, 0, 0];
      matT[MATS[name]] = 1;
      matButtons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-core') === name ? 'true' : 'false'); });
      if (fromUser) {
        try { localStorage.setItem('coreMaterial', name); } catch (e) {}
        kick(0.7);
      }
    }
    matButtons.forEach(function (b) {
      b.addEventListener('click', function () { setMat(b.getAttribute('data-core'), true); });
    });
    var savedMat = null;
    try { savedMat = localStorage.getItem('coreMaterial'); } catch (e) {}
    setMat(savedMat && savedMat in MATS ? savedMat : 'molten', false);
    coreU.uMat.value.set(matT[0], matT[1], matT[2]);

    /* Loop */
    var state = null, time = 0, emberTime = 0, last = performance.now(), lastSy = window.scrollY || 0, vel = 0, intro = 0, frames = 0, slow = 0, needs = true, tick = 0;
    function mixPose(a, b, t) {
      return {
        nx: a.nx + (b.nx - a.nx) * t, ny: a.ny + (b.ny - a.ny) * t, r: a.r + (b.r - a.r) * t,
        dim: a.dim + (b.dim - a.dim) * t, heat: a.heat + (b.heat - a.heat) * t, cage: a.cage + (b.cage - a.cage) * t
      };
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      var sy = window.scrollY || 0;
      if (reduce && !needs && sy === lastSy) { last = now; return; }
      needs = false;
      var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (!reduce) time += dt;
      if ((tick++ % 45) === 0) measure();

      vel += ((sy - lastSy) / dt - vel) * 0.12;
      lastSy = sy;
      var v = Math.max(-1, Math.min(1, vel / 2400));
      var k = 1 - Math.exp(-dt * 5.5), ks = 1 - Math.exp(-dt * 3.2);
      mouse.x += (mouseT.x - mouse.x) * ks;
      mouse.y += (mouseT.y - mouse.y) * ks;
      moveEnergy *= Math.exp(-dt * 2.2);

      var loaded = root.classList.contains('is-loaded');
      intro += ((loaded ? 1 : 0) - intro) * (1 - Math.exp(-dt * 2.6));
      if (reduce && loaded) intro = 1;

      /* Camera parallax */
      if (loaded && loadedAt < 0) loadedAt = time;
      var fly = reduce ? 1 : (loadedAt < 0 ? 0 : Math.min(1, (time - loadedAt) / 2.8));
      var fe = 1 - Math.pow(1 - fly, 4), fr = 1 - fe;
      camera.position.set(mouse.x * 0.6 - fr * 2.4, mouse.y * 0.36 + fr * 1.3, CAM_Z + fr * 13 - pulse * 0.3);
      camera.lookAt(0, 0, 0);
      camera.rotateZ(fr * 0.4);
      camera.updateMatrixWorld();

      /* Where the core should be: on the wordmark in the hero, then section poses as they scroll in */
      var wr = wordRect(), tgt;
      if (wr && wr.w > 0) {
        tgt = { nx: ((wr.left + wr.w * 0.6) / W - 0.5) * 2, ny: (0.5 - (wr.top + wr.h * 0.34) / H) * 2, r: wr.h * (W >= 900 ? 0.7 : 0.6) / H, dim: 1, heat: 0.2, cage: 0.03 };
      } else {
        tgt = { nx: 0.5, ny: 0.05, r: 0.26, dim: 1, heat: 0.2, cage: 0.03 };
      }
      var P = poses(), wts = [];
      /* In "What I do" the core parks on the stage element beside the heading */
      var sRect = skillStage ? skillStage.getBoundingClientRect() : null, stageOn = !!(sRect && sRect.width > 40);
      if (stageOn) {
        P[1] = {
          nx: ((sRect.left + sRect.width / 2) / W - 0.5) * 2, ny: (0.5 - (sRect.top + sRect.height / 2) / H) * 2,
          r: Math.min(sRect.width / 7.6, sRect.height / 5.4) / H, dim: 1, heat: 0.5, cage: 0.7
        };
      }
      for (var i = 0; i < P.length; i++) {
        wts[i] = smooth(tops[i] - H * 0.95, tops[i] - H * 0.3, sy);
        tgt = mixPose(tgt, P[i], wts[i]);
      }
      skillW += ((stageOn ? wts[1] * (1 - wts[2]) : 0) - skillW) * k;
      if (wts[3] > 0.9 && burstArmed && loaded) { burstArmed = false; startBurst(); }
      if (wts[3] < 0.25) burstArmed = true;
      if (!state) state = tgt;
      state = mixPose(state, tgt, reduce ? 1 : k);

      var vh0 = visH(CAM_Z), vw0 = vh0 * aspect;
      var back = 1 + 0.42 * Math.sin(Math.min(1, intro) * Math.PI) * (1 - intro);
      var scale = Math.max(0.0001, state.r * vh0 * (0.2 + 0.8 * intro) * back * (1 + pulse * 0.06 + Math.sin(time * 0.9) * 0.012));
      rig.position.set(state.nx * vw0 / 2, state.ny * vh0 / 2 + Math.sin(time * 0.8) * 0.045, 0);
      rig.scale.setScalar(scale);
      rig.rotation.set(-mouse.y * 0.18, mouse.x * 0.28, 0);

      /* Burst timeline: shell shrinks away, particles fly out, swirl, return, shell snaps back */
      var coreS = 1;
      if (burstT >= 0) {
        burstT += dt;
        var ph = Math.min(1, burstT / 2.6);
        burstU.uB.value = ph < 0.4 ? 1 - Math.pow(1 - ph / 0.4, 3) : (ph < 0.55 ? 1 : 1 - smooth(0.55, 0.96, ph));
        burstU.uFade.value = Math.min(1, ph / 0.04) * (1 - smooth(0.9, 1, ph)) * state.dim;
        burstU.uTime.value = time;
        var bo = (ph - 0.82) / 0.18 - 1;
        coreS = ph < 0.1 ? 1 - ph / 0.1 : (ph < 0.82 ? 0 : 1 + 2.2 * bo * bo * bo + 1.2 * bo * bo);
        burstPts.visible = true;
        if (ph >= 0.84 && !burstKicked) { burstKicked = true; kick(0.9); }
        if (ph >= 1) { burstT = -1; burstPts.visible = false; coreS = 1; }
      }
      core.scale.setScalar(Math.max(0.0001, coreS));

      /* Skill tags on their orbits */
      for (var ti = 0; ti < tags.length; ti++) {
        var tg = tags[ti], vis = skillW * intro;
        tg.s.visible = vis > 0.01;
        if (!tg.s.visible) continue;
        if (!reduce) tg.a += dt * tg.speed;
        tg.s.position.copy(tagV.set(Math.cos(tg.a) * tg.R, Math.sin(tg.a) * tg.R, 0).applyEuler(tg.tilt));
        tg.s.material.opacity = vis;
      }

      /* Cursor on the core: the surface rises to meet it */
      hoverT = 0;
      if (hasMouse && finePointer && overCore()) {
        hoverT = 1;
        core.worldToLocal(hitV).normalize();
        hitL.lerp(hitV, 0.25).normalize();
      }
      hover += (hoverT - hover) * k;
      pulse *= Math.exp(-dt * 2.4);
      if (pulse < 0.002) pulse = 0;

      core.rotation.y += dt * (0.16 + v * 1.4) * (reduce ? 0 : 1);
      core.rotation.x = Math.sin(time * 0.21) * 0.25;
      cage.rotation.y -= dt * 0.07 * (reduce ? 0 : 1);
      cage.rotation.x += dt * 0.045 * (reduce ? 0 : 1);
      orbits.forEach(function (o) { o.userData.spin.rotation.z += dt * o.userData.speed * (1 + Math.abs(v) * 3) * (reduce ? 0 : 1); });

      coreU.uTime.value = time;
      var um = coreU.uMat.value;
      um.x += (matT[0] - um.x) * ks; um.y += (matT[1] - um.y) * ks; um.z += (matT[2] - um.z) * ks;
      coreU.uPulse.value = pulse;
      coreU.uAmp.value = 0.095 + um.z * 0.05 + moveEnergy * 0.035 + Math.abs(v) * 0.09 + pulse * 0.2;
      coreU.uLight.value.set(-0.55 + mouse.x * 1.1 + Math.sin(time * 0.31) * 0.3, 0.75 + mouse.y * 0.8 + Math.cos(time * 0.23) * 0.15, 0.62);
      coreU.uHit.value.copy(hitL);
      coreU.uHitS.value = hover;
      coreU.uRefr.value = state.r * 0.72;
      coreU.uHeat.value = state.heat + hover * 0.35 + pulse * 1.4;
      coreU.uDim.value = state.dim * Math.min(1, intro * 1.4);
      cageLines.material.opacity = (state.cage + hover * 0.2 + pulse * 0.4) * state.dim * intro * coreS;
      cage.userData.nodes.material.opacity = Math.min(1, state.cage * 1.3 + pulse) * state.dim * intro;
      halo.material.opacity = Math.min(1, 0.11 + state.heat * 0.06 + hover * 0.06 + pulse * 0.45) * state.dim * intro * (0.35 + 0.65 * coreS);
      orbits[0].userData.line.material.opacity = 0.2 * state.dim * intro;
      orbits[1].userData.line.material.opacity = 0.42 * state.dim * intro;
      shock.material.opacity = pulse * 0.9;
      shock.scale.setScalar(1 + (1 - pulse) * 1.7);
      shock2.material.opacity = pulse * pulse * 0.6;
      shock2.scale.setScalar(1 + (1 - pulse * pulse) * 2.6);

      emberTime += dt * (1 + Math.abs(v) * 5 + pulse * 3) * (reduce ? 0 : 1);
      emberU.uTime.value = emberTime;
      emberU.uMouse.value.set(mouse.x * vw0 / 2, mouse.y * vh0 / 2);
      emberU.uMouseS.value += ((hasMouse ? 1 : 0) - emberU.uMouseS.value) * k;
      emberU.uCore.value.copy(rig.position);
      emberU.uPulse.value = pulse;
      emberU.uShift.value = sy * 0.0042;
      emberU.uFade.value = Math.min(1, intro * 1.2);

      /* Pin the 3D text to its DOM lines and move each letter on its own spring */
      var away = Math.min(1, sy / Math.max(1, H));
      heroText.update(dt, Math.min(1, intro * 1.8), loaded, -mouse.y * 0.07 - away * 0.38, -0.2 + mouse.x * 0.13);
      contactText.update(dt, Math.min(1, intro * 1.8), !!(contactH && contactH.classList.contains('is-in')), -mouse.y * 0.05, -0.12 + mouse.x * 0.1);

      /* Pass 1: everything except the core, for refraction. Pass 2: full scene with bloom. */
      core.visible = false; halo.visible = false;
      texts.forEach(function (T) { T.group.visible = false; });
      renderer.setRenderTarget(backRT);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      core.visible = true; halo.visible = true;
      texts.forEach(function (T) { T.group.visible = T.on; });
      composer.render();

      /* If the machine is struggling, drop resolution once */
      if (frames < 90 && loaded) {
        frames++;
        if (frames > 20 && dt > 0.024) slow++;
        if (frames === 90 && slow > 35 && DPR > 1) {
          DPR = Math.max(1, DPR - 0.5);
          resize();
          if (DPR > 1) { frames = 0; slow = 0; }
        }
      }
    }

    window.addEventListener('resize', resize);
    window.addEventListener('scroll', function () { needs = true; }, { passive: true });
    resize();
    ready(true);
    requestAnimationFrame(frame);
  }
})();
