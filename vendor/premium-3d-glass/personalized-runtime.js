import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
const plan = /* SCENE_PLAN */;
// No presentation on older paid snapshots: preserve their original rendering.
const look = plan.presentation || {fragments:4,depth:.35,bevel:.035,rotation:0,spread:.8,turn:.7,roughness:null,exposure:1.8,transparent:false,accent:'disc'};
const host = document.querySelector('[data-glass-scene]');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let dispose = () => {};
function mount() {
  if (!host || motion.matches) { document.documentElement.dataset.glassState = 'static'; return; }
  let renderer, scene, frame;
  const resources = [];
  const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
  const cross2 = (a, b) => a.x * b.y - a.y * b.x;
  /* GLASS_HELPERS */
  try {
    scene = new THREE.Scene();
    scene.background = look.transparent ? null : new THREE.Color(plan.palette[0]);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'width:100%;height:100%;display:block;position:absolute;inset:0;';
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'low-power',alpha:look.transparent});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = look.exposure;
    createGlassEnvironment();
    resources.push(scene.environment);
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    camera.position.set(0, .15, 6.5);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x151525, 2));
    const rim = new THREE.DirectionalLight(plan.palette[2], 5);
    rim.position.set(3,4,5);scene.add(rim);
    const pivot = new THREE.Group();pivot.rotation.z=look.rotation;scene.add(pivot);
    const fit = fitShape(parseShape(plan.silhouette), 2.8);
    const material = createGlassMaterial();
    material.attenuationColor.set(plan.palette[1]);
    if(look.roughness!==null)material.roughness=look.roughness;
    const wholeShape = new THREE.Shape(fit.outline);
    for(const hole of fit.holes) wholeShape.holes.push(new THREE.Path(hole));
    const wholeGeo = new THREE.ExtrudeGeometry(wholeShape,{depth:look.depth,steps:1,bevelEnabled:true,bevelSize:look.bevel,bevelThickness:look.bevel,bevelSegments:3,curveSegments:12});
    wholeGeo.translate(0,0,-look.depth/2);
    const whole = new THREE.Mesh(wholeGeo, material);pivot.add(whole);
    const pieces = shapeFragments(fit,look.fragments).map(contour => {
      const centred = recentre(contour);
      const mesh = new THREE.Mesh(makePrism(centred.contour,look.depth,look.bevel,look.bevel),material);
      mesh.userData.home = centred.home;mesh.position.copy(centred.home);pivot.add(mesh);return mesh;
    });
    if(look.accent!=='none'){
      const geometry=look.accent==='halo'?new THREE.TorusGeometry(1.2,.022,8,48):new THREE.SphereGeometry(1.1,24,12);
      const accent=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:plan.palette[2]}));
      accent.position.set(1.4,-.5,-1.5);scene.add(accent);
    }
    const resize = () => {
      const box=host.getBoundingClientRect();
      renderer.setSize(Math.max(1,box.width),Math.max(1,box.height),false);
      camera.aspect=Math.max(.2,box.width/Math.max(1,box.height));camera.position.z=camera.aspect<.8?8:6.5;camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);observer.observe(host);resize();
    let pointer={x:0,y:0},visible=true,stopped=false,last=0;
    const move=e=>{const b=host.getBoundingClientRect();pointer={x:(e.clientX-b.left)/b.width-.5,y:(e.clientY-b.top)/b.height-.5}};
    host.addEventListener('pointermove',move);
    const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting});intersection.observe(host);
    const cleanup=()=>{
      if(stopped)return;stopped=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();host.removeEventListener('pointermove',move);
      scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.material!==material)o.material.dispose()}});material.dispose();resources.forEach(r=>r?.dispose());renderer.dispose();canvas.remove();host.removeAttribute('data-glass-ready');document.documentElement.dataset.glassState='static';
    };
    dispose=cleanup;
    motion.addEventListener('change',e=>{if(e.matches)cleanup()},{once:true});
    canvas.addEventListener('webglcontextlost',cleanup,{once:true});
    function tick(time) {
      if(stopped)return;frame=requestAnimationFrame(tick);
      if(document.hidden||!visible||time-last<32)return;last=time;
      const b=host.getBoundingClientRect();
      const progress=THREE.MathUtils.clamp(-b.top/Math.max(1,b.height),0,1);
      const split=Math.sin(progress*Math.PI);
      pivot.rotation.y=THREE.MathUtils.lerp(pivot.rotation.y,pointer.x*.65+progress*Math.PI*look.turn,.06);
      pivot.rotation.x=THREE.MathUtils.lerp(pivot.rotation.x,-pointer.y*.25,.06);
      whole.visible=split<.025;
      pieces.forEach((piece,i)=>{piece.visible=!whole.visible;const h=piece.userData.home;const angle=i*Math.PI*2/pieces.length;piece.position.set(h.x+Math.cos(angle)*split*look.spread,h.y+Math.sin(angle)*split*look.spread,split*(i%2?.3:-.3));piece.rotation.z=split*(i%2?.25:-.25)});
      renderer.render(scene,camera);
    }
    host.append(canvas);host.setAttribute('data-glass-ready','true');
    renderer.render(scene,camera);document.documentElement.dataset.glassState='ready';
    window.__personalizedGlass={pieces:pieces.length,presentation:look,dispose:cleanup};frame=requestAnimationFrame(tick);
  } catch(error) {
    dispose();renderer?.dispose();host?.querySelector('canvas')?.remove();host?.removeAttribute('data-glass-ready');document.documentElement.dataset.glassState='static';console.warn('3D indisponible : illustration statique conservée.');
  }
}
mount();
window.addEventListener('pagehide',()=>dispose(),{once:true});
