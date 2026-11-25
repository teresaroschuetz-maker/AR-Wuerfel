// ===== AR Creator-Labor · Kern: USDZ mit antippbaren Notizen und Ton für AR Quick Look (iPad/iPhone) =====
// Ohne Abhängigkeiten, damit er auch in Node getestet werden kann.

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(daten) {
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i++) c = CRC_TABELLE[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// USDZ = unkomprimiertes ZIP, Dateidaten müssen auf 64 Byte ausgerichtet beginnen.
// Die .usda-Datei muss die erste Datei sein.
function zipUSDZ(dateien) {
  const enc = new TextEncoder();
  const teile = [];
  const zentral = [];
  let offset = 0;
  for (const d of dateien) {
    const name = enc.encode(d.name);
    const crc = crc32(d.data);
    let extraLen = (64 - ((offset + 30 + name.length) % 64)) % 64;
    if (extraLen > 0 && extraLen < 4) extraLen += 64; // Extra-Feld braucht mind. 4 Byte Kopf
    const kopf = new Uint8Array(30 + name.length + extraLen);
    const v = new DataView(kopf.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0, true);
    v.setUint16(8, 0, true); // gespeichert, nicht komprimiert
    v.setUint16(10, 0, true);
    v.setUint16(12, 0x21, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, d.data.length, true);
    v.setUint32(22, d.data.length, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, extraLen, true);
    kopf.set(name, 30);
    if (extraLen) {
      v.setUint16(30 + name.length, 0x1986, true); // frei gewählte Kennung fürs Auffüllen
      v.setUint16(32 + name.length, extraLen - 4, true);
    }
    zentral.push({ name, crc, groesse: d.data.length, offset });
    teile.push(kopf, d.data);
    offset += kopf.length + d.data.length;
  }
  const zStart = offset;
  for (const z of zentral) {
    const e = new Uint8Array(46 + z.name.length);
    const v = new DataView(e.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(12, 0, true);
    v.setUint16(14, 0x21, true);
    v.setUint32(16, z.crc, true);
    v.setUint32(20, z.groesse, true);
    v.setUint32(24, z.groesse, true);
    v.setUint16(28, z.name.length, true);
    v.setUint32(42, z.offset, true);
    e.set(z.name, 46);
    teile.push(e);
    offset += e.length;
  }
  const ende = new Uint8Array(22);
  const v = new DataView(ende.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, zentral.length, true);
  v.setUint16(10, zentral.length, true);
  v.setUint32(12, offset - zStart, true);
  v.setUint32(16, zStart, true);
  teile.push(ende);
  const gesamt = new Uint8Array(teile.reduce((s, t) => s + t.length, 0));
  let p = 0;
  for (const t of teile) { gesamt.set(t, p); p += t.length; }
  return gesamt;
}

// Kurzer „Ding“-Ton als WAV, damit der Test auch ohne eigene Aufnahme funktioniert
function dingWAV(frequenz = 880, dauer = 0.7, rate = 44100) {
  const n = Math.floor(dauer * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const huelle = Math.min(1, t * 200) * Math.exp(-t * 5);
    const s = (Math.sin(2 * Math.PI * frequenz * t) + 0.4 * Math.sin(2 * Math.PI * frequenz * 2 * t)) * 0.45 * huelle;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true);
  }
  return new Uint8Array(buf);
}

const zahl = (x) => {
  const s = (Math.abs(x) < 1e-7 ? 0 : x).toFixed(5);
  return s.replace(/\.?0+$/, "") || "0";
};

function meshUSDA(name, m, materialPfad, einzug, doppelseitig) {
  const pts = [], nrm = [], st = [];
  for (let i = 0; i < m.points.length; i += 3) pts.push(`(${zahl(m.points[i])}, ${zahl(m.points[i + 1])}, ${zahl(m.points[i + 2])})`);
  if (m.normals) for (let i = 0; i < m.normals.length; i += 3) nrm.push(`(${zahl(m.normals[i])}, ${zahl(m.normals[i + 1])}, ${zahl(m.normals[i + 2])})`);
  if (m.uvs) for (let i = 0; i < m.uvs.length; i += 2) st.push(`(${zahl(m.uvs[i])}, ${zahl(1 - m.uvs[i + 1])})`);
  const anzahlFlaechen = m.indices.length / 3;
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.points.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], m.points[i + k]); max[k] = Math.max(max[k], m.points[i + k]);
  }
  const e = einzug;
  return `${e}def Mesh "${name}" (
${e}    prepend apiSchemas = ["MaterialBindingAPI"]
${e})
${e}{
${e}    uniform bool doubleSided = ${doppelseitig ? 1 : 0}
${e}    float3[] extent = [(${min.map(zahl).join(", ")}), (${max.map(zahl).join(", ")})]
${e}    int[] faceVertexCounts = [${new Array(anzahlFlaechen).fill(3).join(", ")}]
${e}    int[] faceVertexIndices = [${Array.from(m.indices).join(", ")}]
${e}    rel material:binding = <${materialPfad}>
${nrm.length ? `${e}    normal3f[] normals = [${nrm.join(", ")}] (
${e}        interpolation = "vertex"
${e}    )
` : ""}${e}    point3f[] points = [${pts.join(", ")}]
${st.length ? `${e}    texCoord2f[] primvars:st = [${st.join(", ")}] (
${e}        interpolation = "vertex"
${e}    )
` : ""}${e}    uniform token subdivisionScheme = "none"
${e}}
`;
}

function materialUSDA(name, mat, pfad, einzug) {
  const e = einzug;
  const c = mat.color || [0.8, 0.8, 0.8];
  const deckkraft = mat.opacity == null ? 1 : mat.opacity;
  let s = `${e}def Material "${name}"
${e}{
${e}    token outputs:surface.connect = <${pfad}/Oberflaeche.outputs:surface>

${e}    def Shader "Oberflaeche"
${e}    {
${e}        uniform token info:id = "UsdPreviewSurface"
`;
  if (mat.texture) s += `${e}        color3f inputs:diffuseColor.connect = <${pfad}/Bild.outputs:rgb>
`;
  else s += `${e}        color3f inputs:diffuseColor = (${c.map(zahl).join(", ")})
`;
  if (mat.emissive && mat.texture) s += `${e}        color3f inputs:emissiveColor.connect = <${pfad}/Bild.outputs:rgb>
`;
  else if (mat.emissive) s += `${e}        color3f inputs:emissiveColor = (${c.map((x) => zahl(x * 0.55)).join(", ")})
`;
  s += `${e}        float inputs:metallic = 0
${mat.alpha && mat.texture ? `${e}        float inputs:opacity.connect = <${pfad}/Bild.outputs:a>
${e}        float inputs:opacityThreshold = 0.5
` : `${e}        float inputs:opacity = ${zahl(deckkraft)}
`}${e}        float inputs:roughness = ${zahl(mat.roughness == null ? 0.8 : mat.roughness)}
${e}        token outputs:surface
${e}    }
`;
  if (mat.texture) s += `
${e}    def Shader "UVLeser"
${e}    {
${e}        uniform token info:id = "UsdPrimvarReader_float2"
${e}        string inputs:varname = "st"
${e}        float2 outputs:result
${e}    }

${e}    def Shader "Bild"
${e}    {
${e}        uniform token info:id = "UsdUVTexture"
${e}        asset inputs:file = @${mat.texture}@
${e}        float4 inputs:scale = (${mat.texture && mat.color ? c.map(zahl).join(", ") : "1, 1, 1"}, 1)
${e}        token inputs:sourceColorSpace = "sRGB"
${e}        float2 inputs:st.connect = <${pfad}/UVLeser.outputs:result>
${e}        token inputs:wrapS = "repeat"
${e}        token inputs:wrapT = "repeat"
${e}        float outputs:a
${e}        float3 outputs:rgb
${e}    }
`;
  s += `${e}}
`;
  return s;
}

function kartenMesh(b, h) {
  const x = b / 2, y = h / 2;
  return {
    points: [-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0], // wird beim Schreiben auf USD-Konvention (v nach oben) gedreht
    indices: [0, 1, 2, 0, 2, 3],
  };
}

// Zerlegt ein Mesh in kleine räumliche Stücke. Apples AR-Ansicht prüft Tipps offenbar
// über eine Kiste um jedes Mesh – kleine Stücke ergeben kleine Kisten, die Punkte bleiben frei.
function teileMesh(m, zelle) {
  const P = m.points, gruppen = new Map();
  for (let f = 0; f < m.indices.length; f += 3) {
    const a = m.indices[f], b = m.indices[f + 1], c = m.indices[f + 2];
    const k = [0, 1, 2].map((d) => Math.floor((P[a * 3 + d] + P[b * 3 + d] + P[c * 3 + d]) / 3 / zelle)).join(",");
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(a, b, c);
  }
  const teile = [];
  for (const idx of gruppen.values()) {
    const neu = new Map(), pts = [], nrm = m.normals ? [] : null, uv = m.uvs ? [] : null, ind = [];
    for (const i of idx) {
      if (!neu.has(i)) {
        neu.set(i, pts.length / 3);
        pts.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        if (nrm) nrm.push(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]);
        if (uv) uv.push(m.uvs[i * 2], m.uvs[i * 2 + 1]);
      }
      ind.push(neu.get(i));
    }
    teile.push({ points: pts, normals: nrm, uvs: uv, indices: ind, material: m.material });
  }
  return teile;
}

function kugelMesh(r, ringe = 12, segmente = 20) {
  const points = [], normals = [], indices = [];
  for (let a = 0; a <= ringe; a++) {
    const t = (a / ringe) * Math.PI;
    for (let b = 0; b <= segmente; b++) {
      const p = (b / segmente) * Math.PI * 2;
      const x = Math.sin(t) * Math.sin(p), y = Math.cos(t), z = Math.sin(t) * Math.cos(p);
      normals.push(x, y, z); points.push(x * r, y * r, z * r);
    }
  }
  for (let a = 0; a < ringe; a++) for (let b = 0; b < segmente; b++) {
    const i = a * (segmente + 1) + b, j = i + segmente + 1;
    if (a > 0) indices.push(i, j, i + 1);
    if (a < ringe - 1) indices.push(i + 1, j, j + 1);
  }
  return { points, normals, uvs: null, indices };
}

function sichtbarkeitsAktion(name, typ, ziele, einzug) {
  const e = einzug;
  return `${e}def Preliminary_Action "${name}"
${e}{
${e}    rel affectedObjects = [${ziele.map((z) => `<${z}>`).join(", ")}]
${e}    double duration = 0
${e}    token easeType = "none"
${e}    token info:id = "Visibility"
${e}    token motionType = "none"
${e}    double moveDistance = 0
${e}    token style = "basic"
${e}    token type = "${typ}"
${e}}
`;
}

function tonAktion(name, ziel, datei, einzug) {
  const e = einzug;
  return `${e}def Preliminary_Action "${name}"
${e}{
${e}    rel affectedObjects = <${ziel}>
${e}    asset audio = @${datei}@
${e}    token auralMode = "nonSpatial"
${e}    double gain = 1
${e}    token info:id = "Audio"
${e}    token multiplePerformOperation = "allow"
${e}    token type = "play"
${e}}
`;
}

/**
 * szene = {
 *   tier: { meshes:[{points,normals,uvs,indices,material}], materials:[{color,texture,opacity}], matrix:[16] (Spalten wie three.js) },
 *   notizen: [{ position:[x,y,z], pin:{b,h,textur}, panel:{b,h,textur}, ton: "audio/…" | null }]
 * }
 */
function baueUSDA(szene) {
  const S = "/Root/Scenes/Szene";
  const M = `${S}/Materialien`;
  let materialien = "";
  let inhalt = "";
  const I = "            ";

  // Tier
  const tm = szene.tier.matrix; // spaltenweise (three.js) – entspricht zeilenweise in USD
  const zeilen = [0, 1, 2, 3].map((r) => `(${[0, 1, 2, 3].map((c) => zahl(tm[r * 4 + c])).join(", ")})`).join(", ");
  inhalt += `${I}def Xform "Tier"
${I}{
${I}    matrix4d xformOp:transform = ( ${zeilen} )
${I}    uniform token[] xformOpOrder = ["xformOp:transform"]

`;
  szene.tier.materials.forEach((mat, i) => { materialien += materialUSDA(`TierMat_${i}`, mat, `${M}/TierMat_${i}`, I + "    "); });
  // Stückgröße: etwa 1/14 der größten Abmessung (in Modell-Einheiten)
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of szene.tier.meshes) for (let i = 0; i < m.points.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], m.points[i + k]); hi[k] = Math.max(hi[k], m.points[i + k]);
  }
  const zelle = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / (szene.tier.stuecke || 14);
  let nr = 0;
  szene.tier.meshes.forEach((m) => {
    const teile = zelle > 0 ? teileMesh(m, zelle) : [m];
    for (const t of teile) inhalt += meshUSDA(`Teil_${nr++}`, t, `${M}/TierMat_${m.material}`, I + "    ", false);
  });
  inhalt += `${I}}

`;

  // Notizen
  const panels = [];
  szene.notizen.forEach((n, i) => {
    const N = `${S}/Notiz_${i}`;
    panels.push(`${N}/Panel`);
    if (n.punkt.karte) materialien += materialUSDA(`PinMat_${i}`, { texture: n.punkt.karte.textur, emissive: true, roughness: 1, alpha: true }, `${M}/PinMat_${i}`, I + "    ");
    else materialien += materialUSDA(`PinMat_${i}`, { color: n.punkt.farbe, emissive: true, roughness: 0.4 }, `${M}/PinMat_${i}`, I + "    ");
    materialien += materialUSDA(`PanelMat_${i}`, { texture: n.panel.textur, emissive: true, roughness: 1 }, `${M}/PanelMat_${i}`, I + "    ");
    inhalt += `${I}def Xform "Notiz_${i}"
${I}{
${I}    double3 xformOp:translate = (${n.position.map(zahl).join(", ")})
${I}    uniform token[] xformOpOrder = ["xformOp:translate"]

${I}    def Xform "Pin"
${I}    {
${n.punkt.karte
  ? meshUSDA("Schild", kartenMesh(n.punkt.karte.b, n.punkt.karte.h), `${M}/PinMat_${i}`, I + "        ", true)
  : meshUSDA("Punkt", kugelMesh(n.punkt.radius), `${M}/PinMat_${i}`, I + "        ", false)}${I}    }

${I}    def Xform "Panel"
${I}    {
${I}        double3 xformOp:translate = (${n.panel.versatz.map(zahl).join(", ")})
${I}        float xformOp:rotateY = ${zahl(n.panel.drehungY || 0)}
${I}        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateY"]
${meshUSDA("Karte", kartenMesh(n.panel.b, n.panel.h), `${M}/PanelMat_${i}`, I + "        ", true)}${I}    }
${I}}

`;
  });

  // Verhalten (Apple „Preliminary“-Schema, wie es Reality Composer schreibt)
  let verhalten = "";
  if (panels.length) {
    const B = `${S}/Start_Verstecken`;
    verhalten += `${I}def Preliminary_Behavior "Start_Verstecken"
${I}{
${I}    rel actions = <${B}/Aktion>
${I}    uniform bool exclusive = 0
${I}    rel triggers = <${B}/Ausloeser>

${I}    def Preliminary_Trigger "Ausloeser"
${I}    {
${I}        token info:id = "SceneTransition"
${I}        token type = "enter"
${I}    }

${sichtbarkeitsAktion("Aktion", "hide", panels, I + "    ")}${I}}

`;
  }
  szene.notizen.forEach((n, i) => {
    const N = `${S}/Notiz_${i}`;
    const B = `${S}/Notiz_${i}_Oeffnen`;
    const aktionen = [`${B}/Gruppe/Zeigen`];
    if (n.ton) aktionen.push(`${B}/Gruppe/Ton`);
    verhalten += `${I}def Preliminary_Behavior "Notiz_${i}_Oeffnen"
${I}{
${I}    rel actions = <${B}/Gruppe>
${I}    uniform bool exclusive = 0
${I}    rel triggers = <${B}/Ausloeser>

${I}    def Preliminary_Trigger "Ausloeser"
${I}    {
${I}        rel affectedObjects = <${N}/Pin>
${I}        token info:id = "TapGesture"
${I}    }

${I}    def Preliminary_Action "Gruppe"
${I}    {
${I}        rel actions = [${aktionen.map((a) => `<${a}>`).join(", ")}]
${I}        token info:id = "Group"
${I}        bool loops = 0
${I}        int performCount = 1
${I}        token type = "parallel"

${sichtbarkeitsAktion("Zeigen", "show", [`${N}/Panel`], I + "        ")}${n.ton ? tonAktion("Ton", N, n.ton, I + "        ") : ""}${I}    }
${I}}

`;
    const B2 = `${S}/Notiz_${i}_Schliessen`;
    verhalten += `${I}def Preliminary_Behavior "Notiz_${i}_Schliessen"
${I}{
${I}    rel actions = <${B2}/Aktion>
${I}    uniform bool exclusive = 0
${I}    rel triggers = <${B2}/Ausloeser>

${I}    def Preliminary_Trigger "Ausloeser"
${I}    {
${I}        rel affectedObjects = <${N}/Panel>
${I}        token info:id = "TapGesture"
${I}    }

${sichtbarkeitsAktion("Aktion", "hide", [`${N}/Panel`], I + "    ")}${I}}

`;
  });

  return `#usda 1.0
(
    customLayerData = {
        string creator = "AR Creator-Labor (Test)"
    }
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{
    def Scope "Scenes" (
        kind = "sceneLibrary"
    )
    {
        def Xform "Szene" (
            customData = {
                bool preliminary_collidesWithEnvironment = 0
                string sceneName = "Szene"
            }
            sceneName = "Szene"
        )
        {
            token preliminary:anchoring:type = "plane"
            token preliminary:planeAnchoring:alignment = "horizontal"

${inhalt}${verhalten}            def Scope "Materialien"
            {
${materialien}            }
        }
    }
}
`;
}


export { crc32, zipUSDZ, dingWAV, baueUSDA, kartenMesh, kugelMesh, teileMesh };
