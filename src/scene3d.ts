import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { MECHS, type EnemyType } from './data';
import { tierOf, type Enemy, type Game, type Mech, type Projectile } from './game';
import { DEPLOY_X, LX, LY, ROWS, type Vec } from './layout';
import { BEAM_PINK, buildEnemy, buildMech, glowMat, tint, walk, type Model } from './models';
import { camera } from './view';

interface Explosion {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}

const EXPLOSION_SIZE: Partial<Record<EnemyType, number>> = { titan: 70, brute: 26, shield: 26, bomber: 34 };
const LIGHT_POOL = 6;

/** Renders the battlefield in 3D. The 2D canvas on top draws the UI and overlays. */
export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private mechModels = new Map<Mech, { model: Model; key: string; face: number }>();
  private enemyModels = new Map<Enemy, { model: Model; last: Vec; face: number; moving: number }>();
  private projMeshes = new Map<Projectile, THREE.Mesh>();
  private explosions: Explosion[] = [];
  private lights: { light: THREE.PointLight; life: number; max: number; peak: number }[] = [];
  private nextLight = 0;

  private deployZone!: THREE.Mesh;
  private statusLights: THREE.Mesh[] = [];
  private edgeLights: THREE.Mesh[] = [];
  private statusMats = { ok: glowMat('#6dffb8'), warn: glowMat('#ffd23f'), bad: glowMat('#ff3b6b'), off: glowMat('#5a1020') };
  private edgeOn = glowMat('#7df4ff');
  private edgeOff = new THREE.MeshBasicMaterial({ color: '#2f6d7a' });

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color('#04061a');
    this.buildSpace();
    this.buildDeck();
    this.buildMothership();
    this.buildLights();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
  }

  render(): void {
    this.composer.render();
  }

  // ---------- Static scenery ----------

  private buildSpace(): void {
    const stars = new Float32Array(2400 * 3);
    for (let k = 0; k < 2400; k++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(4000 + Math.random() * 1000);
      stars.set([v.x, v.y, v.z], k * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dfe7ff', size: 1.6, sizeAttenuation: false })));

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1300, 64, 48),
      new THREE.MeshStandardMaterial({ color: '#2a68b8', emissive: '#0c2347', roughness: 0.9, metalness: 0 }),
    );
    planet.position.set(420, -1500, -1220);
    this.scene.add(planet);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1360, 64, 48),
      new THREE.MeshBasicMaterial({ color: '#6ebeff', transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    atmosphere.position.copy(planet.position);
    this.scene.add(atmosphere);
  }

  private buildDeck(): void {
    const metal = new THREE.MeshStandardMaterial({ color: '#232a3b', roughness: 0.8, metalness: 0.3 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(LX, 22, LY), metal);
    deck.position.set(LX / 2, -11, LY / 2);
    deck.receiveShadow = true;
    this.scene.add(deck);

    // Raised trim along the edges.
    const trim = new THREE.MeshStandardMaterial({ color: '#46526b', roughness: 0.6, metalness: 0.5 });
    for (const [w, d, x, z] of [[LX, 4, LX / 2, 0], [LX, 4, LX / 2, LY], [4, LY, LX, LY / 2]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), trim);
      m.position.set(x, 0.5, z);
      m.receiveShadow = true;
      this.scene.add(m);
    }

    // Edge lights on the two visible sides.
    for (let k = 0; k <= 12; k++) {
      for (const [x, z] of [[LX + 0.6, (LY * k) / 12], [(LX * k) / 12, LY + 0.6]]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), this.edgeOff);
        l.position.set(x, -9, z);
        this.scene.add(l);
        this.edgeLights.push(l);
      }
    }

    this.deployZone = new THREE.Mesh(
      new THREE.PlaneGeometry(DEPLOY_X, LY),
      new THREE.MeshBasicMaterial({ color: '#4f8cff', transparent: true, opacity: 0.08, depthWrite: false }),
    );
    this.deployZone.rotation.x = -Math.PI / 2;
    this.deployZone.position.set(DEPLOY_X / 2, 0.3, LY / 2);
    this.scene.add(this.deployZone);

    const dash = glowMat('#ffe066', 0.55);
    for (let z = 4; z < LY; z += 18) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 10), dash);
      d.position.set(DEPLOY_X, 0.5, z + 5);
      this.scene.add(d);
    }

    const spawn = new THREE.Mesh(new THREE.PlaneGeometry(14, LY), new THREE.MeshBasicMaterial({ color: '#ff3b6b', transparent: true, opacity: 0.18, depthWrite: false }));
    spawn.rotation.x = -Math.PI / 2;
    spawn.position.set(LX - 7, 0.35, LY / 2);
    this.scene.add(spawn);
  }

  private buildMothership(): void {
    const ship = new THREE.Group();
    const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3, flatShading: true });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ship.add(mesh);
      return mesh;
    };
    const white = mat('#e8edf4');
    box(56, 74, LY + 60, white, -30, 26, LY / 2 - 6);
    box(40, 10, LY + 40, mat('#c4ccd9'), -34, 68, LY / 2 - 6);
    box(8, 3, LY + 61, mat('#2f5fe0'), -40, 63.6, LY / 2 - 6);
    box(4, 3, LY + 61, mat('#dc3540'), -32, 63.6, LY / 2 - 6);
    box(60, 20, 30, mat('#c4ccd9'), -30, -6, -30);
    // Bridge tower near the far end.
    box(30, 40, 54, white, -26, 92, 30);
    box(32, 6, 56, mat('#c4ccd9'), -26, 114, 30);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 46), glowMat('#6dffb8'));
    win.position.set(-10.6, 100, 30);
    ship.add(win);
    // Engines at the far end.
    for (const y of [10, 40]) {
      box(20, 18, 14, mat('#9aa6b8'), -30, y, -40);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 2), glowMat('#5fe3ff'));
      glow.position.set(-30, y, -47.5);
      ship.add(glow);
    }
    // Hangar doors facing the deck, one per enemy lane, with status lights.
    for (let r = 0; r < ROWS; r++) {
      const z = ((r + 0.5) / ROWS) * LY;
      box(2, 44, 40, mat('#10141e'), -1, 22, z);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 34), glowMat('#ffd23f', 0.8));
      strip.position.set(0.4, 42, z);
      ship.add(strip);
      const light = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 4), this.statusMats.ok);
      light.position.set(0.6, 52, z + 22);
      ship.add(light);
      this.statusLights.push(light);
    }
    this.scene.add(ship);
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight('#9fb8ff', '#1a1f2b', 0.9));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(LX / 2 + 300, 700, LY / 2 + 500);
    sun.target.position.set(LX / 2, 0, LY / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -480;
    sc.right = 480;
    sc.top = 420;
    sc.bottom = -420;
    sc.near = 100;
    sc.far = 1800;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight('#6ebeff', 0.6);
    rim.position.set(LX + 400, 200, -300);
    this.scene.add(rim);

    // A pool of point lights for explosion flashes (a fixed count avoids shader recompiles).
    for (let k = 0; k < LIGHT_POOL; k++) {
      const light = new THREE.PointLight('#ff9d2f', 0, 220, 1.6);
      this.scene.add(light);
      this.lights.push({ light, life: 0, max: 1, peak: 0 });
    }
  }

  // ---------- Per-frame sync ----------

  /**
   * Mirrors the game state into the scene. `ghost` is where the unit being dragged
   * would land (or null when it isn't over open deck).
   */
  sync(g: Game, dt: number, ghost: { from: number; at: Vec | null } | null): void {
    const t = g.time;
    this.syncMechs(g, t, dt, ghost);
    this.syncEnemies(g, t, dt);
    this.syncProjectiles(g);
    for (const b of g.blasts) this.explode(b.x, b.h, b.y, b.size, b.color);
    g.blasts.length = 0;
    this.updateFx(dt);

    const hp = g.baseHp / g.baseMax;
    const status = hp > 0.5 ? this.statusMats.ok : hp > 0.25 ? this.statusMats.warn : Math.sin(t * 10) > 0 ? this.statusMats.bad : this.statusMats.off;
    for (const l of this.statusLights) l.material = status;
    this.edgeLights.forEach((l, k) => (l.material = (Math.floor(t * 5) + Math.floor(k / 2)) % 5 === 0 ? this.edgeOn : this.edgeOff));
    const zone = this.deployZone.material as THREE.MeshBasicMaterial;
    zone.opacity = g.drag ? 0.18 + Math.sin(t * 6) * 0.05 : 0.08;
  }

  private syncMechs(g: Game, t: number, dt: number, ghost: { from: number; at: Vec | null } | null): void {
    const alive = new Set<Mech>();
    g.bays.forEach((m, i) => {
      if (!m) return;
      alive.add(m);
      const tier = tierOf(m.level);
      const key = `${m.type}:${tier}:${m.mk2}:${m.mk3}`;
      let entry = this.mechModels.get(m);
      if (!entry || entry.key !== key) {
        if (entry) this.scene.remove(entry.model.root);
        entry = { model: buildMech(m.type, tier, m.mk2, m.mk3), key, face: m.face };
        // Tilt in the model's own frame first, then turn it: lets wrecks fall over in any facing.
        entry.model.root.rotation.order = 'YZX';
        this.scene.add(entry.model.root);
        this.mechModels.set(m, entry);
      }
      const { model } = entry;
      const isGhost = ghost?.from === i;
      model.root.visible = m.spawn <= 0.1 && !(isGhost && !ghost?.at);
      const pos = isGhost && ghost?.at ? ghost.at : m;
      model.root.position.set(pos.x, m.wrecked ? 3 : 0, pos.y);

      // Turn smoothly towards the facing direction.
      let diff = m.face - entry.face;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      entry.face += diff * Math.min(1, dt * 10);
      model.root.rotation.y = -entry.face;

      model.root.rotation.z = m.wrecked ? -1.35 : 0;
      if (m.moving && !m.wrecked) walk(model, t, 1);
      else {
        walk(model, t, 0);
        if (!m.wrecked) model.body.position.y = Math.sin(t * 2.2 + m.hx) * 0.5;
      }
      for (const f of model.flames) f.visible = m.moving && !m.wrecked && Math.random() > 0.15;
      if (model.arm) {
        if (MECHS[m.type].attack === 'melee') model.arm.rotation.z = -m.recoil * 1.3;
        else if (m.type !== 'artillery') model.arm.position.x = -m.recoil * 2.5;
      }
      tint(model, m.flash, m.wrecked, isGhost ? 0.55 : 1);
    });
    for (const [m, entry] of this.mechModels) {
      if (alive.has(m)) continue;
      this.scene.remove(entry.model.root);
      this.mechModels.delete(m);
    }
  }

  private syncEnemies(g: Game, t: number, dt: number): void {
    const alive = new Set<Enemy>();
    for (const e of g.enemies) {
      alive.add(e);
      let entry = this.enemyModels.get(e);
      if (!entry) {
        const model = buildEnemy(e.type);
        model.body.userData.baseY = model.body.position.y;
        entry = { model, last: { x: e.x, y: e.y }, face: e.face, moving: 0 };
        this.scene.add(model.root);
        this.enemyModels.set(e, entry);
      }
      const { model } = entry;
      const moved = Math.hypot(e.x - entry.last.x, e.y - entry.last.y);
      entry.moving += ((moved > 0.05 ? 1 : 0) - entry.moving) * Math.min(1, dt * 8);
      entry.last = { x: e.x, y: e.y };
      model.root.position.set(e.x, 0, e.y);
      let diff = e.face - entry.face;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      entry.face += diff * Math.min(1, dt * 6);
      model.root.rotation.y = -entry.face;

      walk(model, t + e.lane, entry.moving);
      if (e.type === 'jet') model.body.rotation.x = Math.sin(t * 2 + e.lane) * 0.25;
      if (e.type === 'drone' || e.type === 'bomber') model.body.position.y = (model.body.userData.baseY as number) + Math.sin(t * 5 + e.lane) * 2;
      if (model.eye) model.eye.position.z = Math.sin(t * 1.6 + e.lane) * (e.type === 'titan' ? 7 : 2);
      if (model.blink) model.blink.visible = Math.sin(t * 12 + e.lane) > 0;
      for (const f of model.flames) f.visible = Math.random() > 0.2;
      if (model.arm) model.arm.rotation.z = -e.attack * (e.type === 'brute' ? 1.6 : 0.5);
      tint(model, e.flash, false, 1);
    }
    for (const [e, entry] of this.enemyModels) {
      if (alive.has(e)) continue;
      this.scene.remove(entry.model.root);
      this.enemyModels.delete(e);
      // Destroyed (or rammed into the mothership): blow it up.
      const size = EXPLOSION_SIZE[e.type] ?? 18;
      this.explode(e.x, e.type === 'jet' ? 44 : entry.model.height * 0.4, e.y, size, e.type === 'titan' ? '#ffef5c' : '#ff9d2f');
    }
  }

  private syncProjectiles(g: Game): void {
    const alive = new Set<Projectile>();
    for (const p of g.projectiles) {
      alive.add(p);
      let mesh = this.projMeshes.get(p);
      if (!mesh) {
        if (p.kind === 'bullet') {
          const pellet = p.owner.type === 'bulwark';
          const geo = pellet ? new THREE.SphereGeometry(1.6, 6, 4) : new THREE.CylinderGeometry(0.9, 0.9, 18, 6).rotateX(Math.PI / 2);
          mesh = new THREE.Mesh(geo, glowMat(pellet ? '#7df4ff' : BEAM_PINK));
        } else mesh = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), glowMat('#ffb347'));
        this.scene.add(mesh);
        this.projMeshes.set(p, mesh);
      }
      mesh.position.set(p.x, p.z, p.y);
      if (p.kind === 'bullet') mesh.lookAt(p.tx, p.tz, p.ty);
    }
    for (const [p, mesh] of this.projMeshes) {
      if (alive.has(p)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.projMeshes.delete(p);
      if (p.kind === 'shell') this.explode(p.tx, 6, p.ty, Math.max(18, p.splash * 0.7), '#ff9d2f');
      else if (p.splash > 0) this.explode(p.x, p.z, p.y, 14, '#ff9d2f');
      else this.explode(p.x, p.z, p.y, 5, p.owner.type === 'bulwark' ? '#7df4ff' : '#ffe066', false);
    }
  }

  private explode(x: number, y: number, z: number, size: number, color: string, light = true): void {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const max = 0.25 + size / 120;
    this.explosions.push({ mesh, life: max, max, size });
    if (!light) return;
    const slot = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % LIGHT_POOL;
    slot.light.position.set(x, y + 10, z);
    slot.light.color.set(color);
    slot.life = slot.max = max;
    slot.peak = 2000 + size * 120;
  }

  private updateFx(dt: number): void {
    for (const ex of this.explosions) {
      ex.life -= dt;
      const k = 1 - Math.max(0, ex.life) / ex.max;
      ex.mesh.scale.setScalar(ex.size * (0.3 + 0.7 * Math.sqrt(k)));
      (ex.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    }
    this.explosions = this.explosions.filter((ex) => {
      if (ex.life > 0) return true;
      this.scene.remove(ex.mesh);
      (ex.mesh.material as THREE.Material).dispose();
      ex.mesh.geometry.dispose();
      return false;
    });
    for (const l of this.lights) {
      l.life = Math.max(0, l.life - dt);
      l.light.intensity = l.peak * (l.life / l.max);
    }
  }
}
