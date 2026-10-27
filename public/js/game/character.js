// 角色控制器 — 低模小人 + 第三人称跟随相机 + AABB 碰撞 + 行走动画
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.yaw = Math.PI;          // 相机水平角
    this.pitch = 0.32;           // 俯仰
    this.dist = 11;              // 距离
    this.dragging = false;
    this.onKey = null;
    const down = (e) => {
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    const up = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 0 || e.button === 2) { this.dragging = true; this.__lx = e.clientX; this.__ly = e.clientY; }
    });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.__lx) * 0.005;
      this.pitch = Math.max(-0.1, Math.min(1.25, this.pitch + (e.clientY - this.__ly) * 0.004));
      this.__lx = e.clientX; this.__ly = e.clientY;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      this.dist = Math.max(4, Math.min(30, this.dist + Math.sign(e.deltaY) * 1.2));
    }, { passive: true });
  }
  axis() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    return { x, z };
  }
  get running() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
}

function buildCharacterMesh() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
  const skin = mat(0xf0c8a0), jacket = mat(0xd84f3f), pants = mat(0x39425a),
        shoe = mat(0x2b2b30), hair = mat(0x2e2620), cap = mat(0x35507a);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.95, 0.44), jacket);
  torso.position.y = 1.42; torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.5, 0.5), skin);
  head.position.y = 2.18; head.castShadow = true;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.54), hair);
  hairM.position.y = 2.38; g.add(hairM);
  const capM = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.6), cap);
  capM.position.set(0, 2.46, 0.04); g.add(capM);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.24), cap);
  brim.position.set(0, 2.4, 0.36); g.add(brim);

  const limb = (w, h, m, sleeveM, sleeveH = 0.42) => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
    body.position.y = -h / 2; body.castShadow = true;
    grp.add(body);
    if (sleeveM) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, sleeveH, w + 0.08), sleeveM);
      sl.position.y = -sleeveH / 2;
      grp.add(sl);
    }
    return grp;
  };
  const armL = limb(0.2, 0.78, skin, jacket);
  armL.position.set(-0.5, 1.86, 0); g.add(armL);
  const armR = limb(0.2, 0.78, skin, jacket);
  armR.position.set(0.5, 1.86, 0); g.add(armR);
  const legL = limb(0.26, 0.92, pants, pants, 0.5);
  legL.position.set(-0.2, 0.96, 0); g.add(legL);
  const legR = limb(0.26, 0.92, pants, pants, 0.5);
  legR.position.set(0.2, 0.96, 0); g.add(legR);
  // 鞋
  for (const [leg, sx] of [[legL, -0.2], [legR, 0.2]]) {
    const shoeM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.44), shoe);
    shoeM.position.set(0, -0.93, 0.06);
    leg.add(shoeM);
  }
  // 双肩包
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.2), mat(0x6b7f5a));
  bag.position.set(0, 1.5, -0.32); g.add(bag);

  g.userData.limbs = { armL, armR, legL, legR, torso, head };
  return g;
}

export class Character {
  constructor(scene, camera, input, city) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.city = city;
    this.mesh = buildCharacterMesh();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(6, 0, 170);   // 天安门广场附近出生
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.radius = 0.55;
    this.speedWalk = 6.5;
    this.speedRun = 12.5;
    this.jumpV = 9;
    this.g = -24;
    this.grounded = true;
    this.phase = 0;
    this.camPos = new THREE.Vector3();
    this._lastGroundBoxH = -Infinity;
  }

  groundHeight() {
    const city = this.city;
    let h = city.groundY(this.pos.x, this.pos.z);
    // 可以站上低矮平台(建筑顶/台基)
    for (const b of city.colliders.query(this.pos.x, this.pos.z, this.radius + 0.5)) {
      if (Math.abs(this.pos.x - b.x) < b.hw + this.radius * 0.5 &&
          Math.abs(this.pos.z - b.z) < b.hd + this.radius * 0.5) {
        if (b.h <= this.pos.y + 0.65 && b.h > h) h = b.h;
      }
    }
    return h;
  }

  update(dt) {
    const inp = this.input;
    const ax = inp.axis();
    const moving = ax.x !== 0 || ax.z !== 0;
    const speed = inp.running ? this.speedRun : this.speedWalk;

    // 相机相对方向移动
    if (moving) {
      const cy = inp.yaw;
      const fx = Math.sin(cy), fz = Math.cos(cy);
      // 前方 = -(fx, fz)? yaw 定义:相机在人物后方;直接用 yaw 反推
      const dirX = (-ax.z) * -Math.sin(cy) + ax.x * Math.cos(cy);
      const dirZ = (-ax.z) * -Math.cos(cy) - ax.x * Math.sin(cy);
      const len = Math.hypot(dirX, dirZ) || 1;
      this.vel.x = (dirX / len) * speed;
      this.vel.z = (dirZ / len) * speed;
      // 面朝移动方向
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 12);
    } else {
      this.vel.x *= Math.max(0, 1 - dt * 10);
      this.vel.z *= Math.max(0, 1 - dt * 10);
    }

    // 跳跃 & 重力
    const ground = this.groundHeight();
    if (inp.keys.has('Space') && this.grounded) {
      this.vel.y = this.jumpV;
      this.grounded = false;
    }
    this.vel.y += this.g * dt;

    // 分轴移动 + 碰撞
    this.tryMove('x', this.vel.x * dt);
    this.tryMove('z', this.vel.z * dt);
    this.pos.y += this.vel.y * dt;

    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.05) {
      this.grounded = false;
    }

    // 同步 mesh
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;

    // 行走动画
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const L = this.mesh.userData.limbs;
    if (spd > 0.4 && this.grounded) {
      this.phase += dt * spd * 1.35;
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      const amp = Math.min(1, spd / this.speedWalk) * 0.75;
      L.legL.rotation.x = s * amp;
      L.legR.rotation.x = -s * amp;
      L.armL.rotation.x = -s * amp * 0.85;
      L.armR.rotation.x = s * amp * 0.85;
      L.torso.position.y = 1.42 + Math.abs(c) * 0.035 * amp;
      L.head.position.y = 2.18 + Math.abs(c) * 0.035 * amp;
    } else if (!this.grounded) {
      L.legL.rotation.x = 0.5; L.legR.rotation.x = -0.3;
      L.armL.rotation.x = -0.9; L.armR.rotation.x = -0.9;
    } else {
      this.phase += dt * 2;
      const s = Math.sin(this.phase) * 0.04;
      L.legL.rotation.x *= 0.8; L.legR.rotation.x *= 0.8;
      L.armL.rotation.x = s; L.armR.rotation.x = -s;
    }

    this.updateCamera(dt);
  }

  tryMove(axis, delta) {
    if (delta === 0) return;
    const old = this.pos[axis];
    this.pos[axis] += delta;
    const R = this.radius;
    for (const b of this.city.colliders.query(this.pos.x, this.pos.z, R + 2)) {
      // 楼顶以上不挡(允许跳上矮台)
      if (this.pos.y >= b.h - 0.35) continue;
      const dx = this.pos.x - b.x, dz = this.pos.z - b.z;
      if (Math.abs(dx) < b.hw + R && Math.abs(dz) < b.hd + R) {
        if (axis === 'x') {
          this.pos.x = b.x + Math.sign(dx || (delta > 0 ? -1 : 1)) * (b.hw + R);
        } else {
          this.pos.z = b.z + Math.sign(dz || (delta > 0 ? -1 : 1)) * (b.hd + R);
        }
      }
    }
    if (axis === 'x') this.vel.x = 0; else this.vel.z = 0;
  }

  updateCamera(dt) {
    const inp = this.input;
    const { yaw, pitch, dist } = inp;
    const cx = this.pos.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = this.pos.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = this.pos.y + 2 + Math.sin(pitch) * dist;
    _v.set(cx, cy, cz);
    // 相机不穿地
    const gh = this.city.groundY(cx, cz) + 1.2;
    if (_v.y < gh) _v.y = gh;
    this.camPos.lerp(_v, Math.min(1, dt * 8));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.pos.x, this.pos.y + 2.1, this.pos.z);
  }

  teleport(x, z) {
    // 真实地图建筑密集,落点需避开碰撞盒:螺旋搜索最近空位
    const blocked = (px, pz) => {
      for (const b of this.city.colliders.query(px, pz, this.radius + 1)) {
        if (Math.abs(px - b.x) < b.hw + this.radius && Math.abs(pz - b.z) < b.hd + this.radius) return true;
      }
      return false;
    };
    let fx = x, fz = z;
    if (blocked(x, z)) {
      outer: for (let r = 4; r <= 90; r += 4) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
          if (!blocked(px, pz)) { fx = px; fz = pz; break outer; }
        }
      }
    }
    this.pos.set(fx, this.city.groundY(fx, fz) + 0.5, fz);
    this.vel.set(0, 0, 0);
  }
}
