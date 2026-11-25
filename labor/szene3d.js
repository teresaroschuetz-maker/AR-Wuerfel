// ===== AR Creator-Labor · 3D-Vorschau, Notiz-Punkte und Bau der AR-Datei =====
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { zipUSDZ, dingWAV, baueUSDA } from "./usdz.js";

export const FARBEN = ["#F28C28", "#1FA2A6", "#7B5CC9", "#3FA34D", "#2F6FD6", "#E04F7A"];
export const DING_FREQUENZEN = [880, 660, 990, 550, 740, 830, 620, 1040, 700, 940, 590, 780];
const PUNKT_R = 0.022;
const PANEL = { b: 0.3, h: 0.2 };
const WORT_H = 0.055;
const INFO_SCHILD = { b: 0.09, h: 0.09 };
const INFO_PANEL = { b: 0.42, h: 0.315 };
const enc = new TextEncoder();

export const BEISPIELMODELLE = {
  ente: { name: "Testente", urls: ["https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Duck/glTF-Binary/Duck.glb", "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb"] },
  fuchs: { name: "Testfuchs", urls: ["https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Fox/glTF-Binary/Fox.glb", "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb"] },
};

export function neueSzene() {
  return {
    version: 1,
    titel: "Neue Szene",
    groesse: 0.45,
    modell: { quelle: "beispiel", id: "ente" },
    info: { an: true, titel: "Info", text: "Hier stehen allgemeine Informationen, z. B. Herkunft, Größe und Besonderheiten.", ton: { art: "ding" } },
    notizen: [],
  };
}

// ---------- Zeichnen ----------
function textUmbruch(ctx, text, maxB) {
  const zeilen = [];
  for (const absatz of String(text).split("\n")) {
    let z = "";
    for (const w of absatz.split(/\s+/)) {
      const test = z ? z + " " + w : w;
      if (ctx.measureText(test).width > maxB && z) { zeilen.push(z); z = w; } else z = test;
    }
    zeilen.push(z);
  }
  return zeilen;
}
const hatTon = (z) => z.ton && z.ton.art !== "kein";

function zeichneNotiz(n) {
  const c = document.createElement("canvas"); c.width = 960; c.height = 640;
  const x = c.getContext("2d");
  x.fillStyle = "#FFFDF6"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = FARBEN[n.farbe % FARBEN.length]; x.fillRect(0, 0, c.width, 26); x.fillRect(0, 0, 14, c.height);
  x.fillStyle = "#22252B"; x.textBaseline = "top";
  x.font = "bold 58px system-ui, -apple-system, sans-serif";
  x.fillText((hatTon(n) ? "🔊 " : "") + (n.titel || "Notiz"), 50, 56);
  x.font = "44px system-ui, -apple-system, sans-serif";
  textUmbruch(x, n.text || "", c.width - 100).slice(0, 8).forEach((z, i) => x.fillText(z, 50, 150 + i * 56));
  x.fillStyle = "#8A8F9C"; x.font = "32px system-ui, sans-serif";
  x.fillText("Tippen zum Schließen", 50, c.height - 62);
  return c;
}
function zeichneWort(n) {
  const h = 160;
  const schrift = "bold 96px system-ui, -apple-system, sans-serif";
  const m = document.createElement("canvas").getContext("2d"); m.font = schrift;
  const ton = hatTon(n), wort = (n.titel || "Wort").trim();
  const b = Math.min(1400, Math.ceil(m.measureText(wort).width + (ton ? 190 : 90)));
  const c = document.createElement("canvas"); c.width = b; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = FARBEN[n.farbe % FARBEN.length]; x.fillRect(0, 0, b, h);
  x.fillStyle = "rgba(255,255,255,.22)"; x.fillRect(0, 0, b, 12);
  x.fillStyle = "#fff"; x.font = schrift; x.textBaseline = "middle";
  let px = 45;
  if (ton) { x.font = "84px system-ui, sans-serif"; x.fillText("🔊", px, h / 2 + 6); px += 110; x.font = schrift; }
  x.fillText(wort, px, h / 2 + 6);
  return c;
}
function panelBild(n) {
  if (n.typ === "wort") { const c = zeichneWort(n); return { c, b: WORT_H * c.width / c.height, h: WORT_H }; }
  return { c: zeichneNotiz(n), b: PANEL.b, h: PANEL.h };
}
function zeichneInfoSchild() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#2F6FD6"; x.beginPath(); x.arc(128, 128, 108, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#fff"; x.font = "bold 160px Georgia, 'Times New Roman', serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("i", 128, 138);
  return c;
}
function zeichneInfoPanel(info) {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 900;
  const x = c.getContext("2d");
  x.fillStyle = "#FFFDF6"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#2F6FD6"; x.fillRect(0, 0, c.width, 30);
  x.beginPath(); x.arc(92, 112, 44, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#fff"; x.font = "bold 62px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("i", 92, 116);
  x.textAlign = "left"; x.textBaseline = "top"; x.fillStyle = "#22252B";
  x.font = "bold 62px system-ui, -apple-system, sans-serif";
  x.fillText((hatTon(info) ? "🔊 " : "") + (info.titel || "Info"), 160, 80);
  x.font = "42px system-ui, -apple-system, sans-serif";
  textUmbruch(x, info.text || "", c.width - 120).slice(0, 13).forEach((z, i) => x.fillText(z, 60, 200 + i * 52));
  x.fillStyle = "#8A8F9C"; x.font = "32px system-ui, sans-serif";
  x.fillText("Tippen zum Schließen", 60, c.height - 60);
  return c;
}
const canvasZuBytes = (c) => new Promise((ok) => c.toBlob(async (b) => ok(new Uint8Array(await b.arrayBuffer())), "image/png"));
async function bildZuPNG(bild, max = 2048) {
  const b = bild.width, h = bild.height; if (!b || !h) return null;
  const f = Math.min(1, max / Math.max(b, h));
  const c = document.createElement("canvas"); c.width = Math.round(b * f); c.height = Math.round(h * f);
  c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
  return canvasZuBytes(c);
}
const textur = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

// ---------- Die Szene ----------
export class Szene3D {
  /**
   * @param {HTMLElement} el  Container für die Vorschau
   * @param {{ tonQuelle?: (datei:string)=>({daten:Uint8Array,mime:string,endung:string}|null) }} opt
   */
  constructor(el, opt = {}) {
    this.el = el;
    this.tonQuelle = opt.tonQuelle || (() => null);
    this.szene = neueSzene();
    this.roh = null;           // Modell-Daten in Original-Einheiten
    this.tierGruppe = null;
    this.beimPlatzieren = null; // Funktion(punkt) während des Platzierens
    this.lageCache = new Map();
    this.dingCache = {};

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);
    this.welt = new THREE.Scene();
    this.welt.background = new THREE.Color("#EAE6DC");
    this.kamera = new THREE.PerspectiveCamera(45, 4 / 3, 0.01, 60);
    this.kamera.position.set(0.25, 0.55, 1.25);
    this.steuerung = new OrbitControls(this.kamera, this.renderer.domElement);
    this.steuerung.target.set(0, 0.25, 0); this.steuerung.enableDamping = true;
    this.welt.add(new THREE.HemisphereLight(0xffffff, 0x998877, 2.2));
    const sonne = new THREE.DirectionalLight(0xffffff, 1.8); sonne.position.set(1, 2, 1.5); this.welt.add(sonne);
    this.boden = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: "#D9D3C5" }));
    this.boden.rotation.x = -Math.PI / 2; this.welt.add(this.boden);
    this.notizGruppe = new THREE.Group(); this.welt.add(this.notizGruppe);
    this.klickbar = [];
    new ResizeObserver(() => this.#groesse()).observe(el); this.#groesse();
    this.renderer.setAnimationLoop(() => { this.steuerung.update(); this.renderer.render(this.welt, this.kamera); });

    let druck = null;
    const cv = this.renderer.domElement;
    cv.addEventListener("pointerdown", (e) => { druck = [e.clientX, e.clientY]; });
    cv.addEventListener("pointerup", (e) => {
      if (!druck || Math.hypot(e.clientX - druck[0], e.clientY - druck[1]) > 6) return;
      this.#tipp(e.clientX, e.clientY);
    });
  }

  #groesse() {
    const b = this.el.clientWidth, h = this.el.clientHeight || 1;
    this.renderer.setSize(b, h, false); this.kamera.aspect = b / h; this.kamera.updateProjectionMatrix();
  }

  get g() { return this.szene.groesse || 0.45; }
  get s() { return this.roh ? this.g / this.roh.maxDim : 1; }
  get tierHoehe() { return this.roh ? this.roh.groesse.y * this.s : 0.3; }
  get tierMasse() { return this.roh ? { b: this.roh.groesse.x * this.s, t: this.roh.groesse.z * this.s } : { b: 0.4, t: 0.4 }; }
  matrix() {
    const s = this.s, r = this.roh;
    return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -r.mitte.x * s, -r.min.y * s, -r.mitte.z * s, 1];
  }

  // ---- Modell ----
  async ladeModell(quelle) {
    // Auch komprimierte Modelle (Draco, Meshopt, KTX2-Texturen) lesen können
    const loader = new GLTFLoader();
    const draco = new DRACOLoader(); draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      const ktx2 = new KTX2Loader().setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/").detectSupport(this.renderer);
      loader.setKTX2Loader(ktx2);
    } catch (e) { /* ohne KTX2 weiter */ }
    let gltf = null, fehler = null;
    if (quelle instanceof ArrayBuffer) gltf = await loader.parseAsync(quelle, "");
    else for (const url of [].concat(quelle)) { try { gltf = await loader.loadAsync(url); break; } catch (e) { fehler = e; } }
    if (!gltf) throw fehler || new Error("Modell nicht ladbar");
    const wurzel = gltf.scene;
    wurzel.updateMatrixWorld(true);
    this.roh = await this.#extrahiere(wurzel);
    if (this.tierGruppe) this.welt.remove(this.tierGruppe);
    this.tierGruppe = new THREE.Group();
    this.tierGruppe.add(wurzel);
    this.welt.add(this.tierGruppe);
    this.lageCache.clear();
    this.#anwendenGroesse();
  }

  #anwendenGroesse() {
    if (!this.tierGruppe) return;
    this.tierGruppe.matrix.identity(); this.tierGruppe.position.set(0, 0, 0); this.tierGruppe.scale.set(1, 1, 1);
    this.tierGruppe.applyMatrix4(new THREE.Matrix4().fromArray(this.matrix()));
    this.tierGruppe.updateMatrixWorld(true);
    const g = this.g;
    this.boden.scale.setScalar(Math.max(0.6, g * 1.4));
    this.steuerung.target.set(0, this.tierHoehe * 0.55, 0);
    const abstand = Math.max(0.9, g * 2.6);
    this.kamera.position.set(abstand * 0.2, this.tierHoehe * 0.8 + abstand * 0.25, abstand);
    this.kamera.far = abstand * 20; this.kamera.updateProjectionMatrix();
    this.aktualisiere();
  }

  setzeGroesse(m) { this.szene.groesse = m; this.lageCache.clear(); this.#anwendenGroesse(); }

  async #extrahiere(wurzel) {
    const meshes = [], materialien = [], matIndex = new Map(), texturen = [];
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const liste = [];
    wurzel.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.attributes?.position) liste.push(o); });
    for (const o of liste) {
      const g = o.geometry, pos = g.attributes.position, n = pos.count;
      if (o.isSkinnedMesh) o.skeleton.update();
      nm.getNormalMatrix(o.matrixWorld);
      const P = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
        P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; min.min(v); max.max(v);
      }
      let N = null;
      if (g.attributes.normal) {
        N = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; }
      }
      let UV = null;
      if (g.attributes.uv) { UV = new Float32Array(n * 2); for (let i = 0; i < n; i++) { UV[i * 2] = g.attributes.uv.getX(i); UV[i * 2 + 1] = g.attributes.uv.getY(i); } }
      const idx = g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const gruppen = g.groups.length ? g.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
      for (const gr of gruppen) {
        const mat = mats[gr.materialIndex] || mats[0];
        if (!matIndex.has(mat)) {
          const eintrag = { color: mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.8, 0.8, 0.8], opacity: mat.transparent ? mat.opacity : 1, roughness: mat.roughness ?? 0.8 };
          if (mat.map?.image && !mat.map.isCompressedTexture) {
            let png = null;
            try { png = await bildZuPNG(mat.map.image); } catch (e) { png = null; }
            if (png) { eintrag.texture = `textures/tier_${texturen.length}.png`; texturen.push({ name: eintrag.texture, data: png }); }
          }
          matIndex.set(mat, materialien.length); materialien.push(eintrag);
        }
        meshes.push({ points: P, normals: N, uvs: UV, indices: idx.slice(gr.start, Math.min(idx.length, gr.start + gr.count)), material: matIndex.get(mat) });
      }
    }
    if (!meshes.length || !isFinite(min.x)) throw new Error("Die Datei enthält kein sichtbares 3D-Modell.");
    const groesse = new THREE.Vector3().subVectors(max, min);
    return { meshes, materials: materialien, texturen, min, max, groesse, mitte: new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5), maxDim: Math.max(groesse.x, groesse.y, groesse.z) || 1 };
  }

  // ---- Punkte (gespeichert relativ zur Größe, damit sie beim Ändern der Größe mitwandern) ----
  inWelt(p) { return p.map((v) => v * this.g); }
  punktMitte(punkt) { const p = this.inWelt(punkt.p); return p.map((v, k) => v + punkt.n[k] * PUNKT_R * 1.15); }
  #trefferAufTier(start, richtung) {
    if (!this.tierGruppe) return null;
    this.tierGruppe.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(start, richtung.clone().normalize());
    const t = ray.intersectObject(this.tierGruppe, true)[0];
    if (!t) return null;
    const n = t.face ? t.face.normal.clone().transformDirection(t.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
    if (n.dot(ray.ray.direction) > 0) n.negate();
    return { p: t.point.toArray().map((v) => +(v / this.g).toFixed(5)), n: n.toArray().map((v) => +v.toFixed(4)) };
  }
  standardPunkt(i) {
    const y = this.tierHoehe * Math.max(0.2, 0.75 - 0.15 * (i % 4));
    const x = ((i % 3) - 1) * this.tierMasse.b * 0.15;
    return this.#trefferAufTier(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1))
      || this.#trefferAufTier(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0))
      || { p: [0, this.tierHoehe / this.g, 0], n: [0, 1, 0] };
  }

  #panelLage(punkt, b, h, wort) {
    const schluessel = [punkt.p.join(","), b.toFixed(3), h.toFixed(3), this.g, this.tierGruppe?.uuid, this.szene.notizen.map((m) => m.punkt ? m.punkt.p.join(",") : "-").join(";")].join("|");
    if (this.lageCache.has(schluessel)) return this.lageCache.get(schluessel);
    let dx = punkt.n[0], dz = punkt.n[2];
    const l = Math.hypot(dx, dz);
    if (l < 0.35) { dx = 0; dz = 1; } else { dx /= l; dz /= l; }
    const drehung = Math.atan2(dx, dz);
    const vorne = new THREE.Vector3(dx, 0, dz), rechts = new THREE.Vector3(dz, 0, -dx);
    const basis = new THREE.Vector3().fromArray(this.punktMitte(punkt));
    const ray = new THREE.Raycaster();
    const hoch = h / 2 + (wort ? 0.03 : 0.035);
    if (this.tierGruppe) this.tierGruppe.updateMatrixWorld(true);
    const pruefe = (d, heben) => {
      let yy = hoch + heben;
      if (basis.y + yy - h / 2 < 0.01) yy = 0.01 - basis.y + h / 2;
      const mitte = basis.clone().addScaledVector(vorne, d); mitte.y += yy;
      const v = [dx * d, yy, dz * d];
      if (this.tierGruppe) for (const u of [-0.45, 0, 0.45]) for (const w of [-0.45, 0, 0.45]) {
        const s = mitte.clone().addScaledVector(rechts, u * b); s.y += w * h;
        ray.set(s.clone().addScaledVector(vorne, 3), vorne.clone().negate());
        const t = ray.intersectObject(this.tierGruppe, true)[0];
        if (t && t.distance < 2.995) return { v, frei: false };
      }
      for (const andere of this.szene.notizen) {
        if (!andere.punkt || andere.punkt === punkt) continue;
        const q = new THREE.Vector3().fromArray(this.punktMitte(andere.punkt)).sub(mitte);
        if (q.dot(vorne) < 0.02 && Math.abs(q.dot(rechts)) < b / 2 + 0.04 && Math.abs(q.y) < h / 2 + 0.04) return { v, frei: false };
      }
      return { v, frei: true };
    };
    let versatz = null;
    suche: for (const heben of [0, 0.05, 0.1, 0.16, 0.24, 0.34]) {
      for (let d = wort ? 0.03 : 0.05; d <= 0.45; d += 0.04) {
        const r = pruefe(d, heben);
        if (!versatz) versatz = r.v;
        if (r.frei) { versatz = r.v; break suche; }
      }
    }
    const lage = { versatz, drehung };
    this.lageCache.set(schluessel, lage);
    return lage;
  }
  #infoLage() {
    const m = this.tierMasse;
    return { p: [-(m.b / 2) - 0.08, 0.07, m.t / 2], versatz: [-(INFO_PANEL.b / 2) + 0.06, INFO_PANEL.h / 2 + 0.06, 0.01] };
  }

  // ---- Vorschau ----
  zeige(szene) { this.szene = szene; this.lageCache.clear(); this.#anwendenGroesse(); }

  aktualisiere() {
    this.notizGruppe.clear(); this.klickbar = [];
    if (!this.tierGruppe) return;
    this.szene.notizen.forEach((n, i) => {
      if (!n.punkt) return;
      const g = new THREE.Group(); g.position.fromArray(this.punktMitte(n.punkt));
      const bild = panelBild(n);
      const farbe = new THREE.Color(FARBEN[n.farbe % FARBEN.length]);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(PUNKT_R, 20, 12), new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe.clone().multiplyScalar(0.55), roughness: 0.4 }));
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(bild.b, bild.h), new THREE.MeshBasicMaterial({ map: textur(bild.c), side: THREE.DoubleSide }));
      const lage = this.#panelLage(n.punkt, bild.b, bild.h, n.typ === "wort");
      panel.position.fromArray(lage.versatz); panel.rotation.y = lage.drehung; panel.visible = false;
      pin.userData = { art: "pin", ziel: n, panel }; panel.userData = { art: "panel" };
      g.add(pin, panel); this.notizGruppe.add(g); this.klickbar.push(pin, panel);
    });
    const info = this.szene.info;
    if (info?.an) {
      const lage = this.#infoLage();
      const g = new THREE.Group(); g.position.fromArray(lage.p);
      const schild = new THREE.Mesh(new THREE.PlaneGeometry(INFO_SCHILD.b, INFO_SCHILD.h), new THREE.MeshBasicMaterial({ map: textur(zeichneInfoSchild()), alphaTest: 0.5, side: THREE.DoubleSide }));
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(INFO_PANEL.b, INFO_PANEL.h), new THREE.MeshBasicMaterial({ map: textur(zeichneInfoPanel(info)), side: THREE.DoubleSide }));
      panel.position.fromArray(lage.versatz); panel.visible = false;
      schild.userData = { art: "pin", ziel: info, panel }; panel.userData = { art: "panel" };
      g.add(schild, panel); this.notizGruppe.add(g); this.klickbar.push(schild, panel);
    }
  }

  #tipp(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.kamera);
    if (this.beimPlatzieren) {
      const p = this.#trefferAufTier(ray.ray.origin, ray.ray.direction);
      const f = this.beimPlatzieren;
      if (p) { this.beimPlatzieren = null; this.lageCache.clear(); }
      f(p);
      return;
    }
    const t = ray.intersectObjects(this.klickbar.filter((o) => o.visible), false)[0];
    if (!t) return;
    const d = t.object.userData;
    if (d.art === "pin") { d.panel.visible = true; this.spieleTon(d.ziel); }
    else t.object.visible = false;
  }

  // ---- Töne ----
  tonDatei(ziel) {
    if (!ziel?.ton || ziel.ton.art === "kein") return null;
    if (ziel.ton.art === "datei") return this.tonQuelle(ziel.ton.datei);
    const i = ziel === this.szene.info ? -1 : this.szene.notizen.indexOf(ziel);
    const f = i < 0 ? 523 : DING_FREQUENZEN[i % DING_FREQUENZEN.length];
    if (!this.dingCache[f]) this.dingCache[f] = { daten: dingWAV(f), mime: "audio/wav", endung: "wav" };
    return this.dingCache[f];
  }
  spieleTon(ziel) {
    const t = this.tonDatei(ziel); if (!t) return;
    if (this.audio) this.audio.pause();
    this.audio = new Audio(URL.createObjectURL(new Blob([t.daten], { type: t.mime })));
    this.audio.play().catch(() => {});
  }

  // ---- AR-Datei (USDZ) ----
  async baueUSDZ() {
    if (!this.roh) throw new Error("Kein Modell geladen");
    const dateien = [...this.roh.texturen];
    const daten = { tier: { meshes: this.roh.meshes, materials: this.roh.materials, matrix: this.matrix() }, notizen: [] };
    for (const n of this.szene.notizen) {
      if (!n.punkt) continue;
      const k = daten.notizen.length;
      const bild = panelBild(n);
      const panelName = `textures/panel_${k}.png`;
      dateien.push({ name: panelName, data: await canvasZuBytes(bild.c) });
      const t = this.tonDatei(n);
      let ton = null;
      if (t && t.endung !== "webm") { ton = `audio/notiz_${k}.${t.endung}`; dateien.push({ name: ton, data: t.daten }); }
      const lage = this.#panelLage(n.punkt, bild.b, bild.h, n.typ === "wort");
      daten.notizen.push({
        position: this.punktMitte(n.punkt),
        punkt: { radius: PUNKT_R, farbe: new THREE.Color(FARBEN[n.farbe % FARBEN.length]).toArray() },
        panel: { b: bild.b, h: bild.h, textur: panelName, versatz: lage.versatz, drehungY: lage.drehung * 180 / Math.PI },
        ton,
      });
    }
    const info = this.szene.info;
    if (info?.an) {
      const lage = this.#infoLage(), t = this.tonDatei(info);
      dateien.push({ name: "textures/info_schild.png", data: await canvasZuBytes(zeichneInfoSchild()) });
      dateien.push({ name: "textures/info_panel.png", data: await canvasZuBytes(zeichneInfoPanel(info)) });
      let ton = null;
      if (t && t.endung !== "webm") { ton = `audio/info.${t.endung}`; dateien.push({ name: ton, data: t.daten }); }
      daten.notizen.push({
        position: lage.p,
        punkt: { karte: { ...INFO_SCHILD, textur: "textures/info_schild.png" } },
        panel: { ...INFO_PANEL, textur: "textures/info_panel.png", versatz: lage.versatz, drehungY: 0 },
        ton,
      });
    }
    const usda = baueUSDA(daten);
    const zip = zipUSDZ([{ name: "szene.usda", data: enc.encode(usda) }, ...dateien]);
    return new Blob([zip], { type: "model/vnd.usdz+zip" });
  }
}

// Prüft, ob das Gerät Apples AR-Ansicht öffnen kann (iPad/iPhone mit Safari)
export const kannAR = () => document.createElement("a").relList.supports("ar");

// Bild für den AR-Knopf (Apple verlangt ein Bild im AR-Link)
export function arKnopfBild(text = "📱 Im Raum ansehen") {
  const c = document.createElement("canvas"); c.width = 640; c.height = 120;
  const x = c.getContext("2d");
  x.fillStyle = "#1FA2A6"; x.beginPath(); x.roundRect(0, 0, 640, 120, 60); x.fill();
  x.fillStyle = "#fff"; x.font = "bold 46px system-ui, -apple-system, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 320, 64);
  return c.toDataURL("image/png");
}
