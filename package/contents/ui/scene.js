// Pixel City: motor de la escena. Lo usan el fondo de Plasma (main.qml) y el arnés de pruebas (preview.html).
// Todo se dibuja con fillRect en coordenadas enteras sobre un lienzo de baja resolución que luego se
// escala sin suavizado, así cada "pixel" del arte ocupa varios pixeles reales de la pantalla.

// ---------- utilidades ----------

function rng(seed) {
    var a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Número pseudoaleatorio estable en [0, 1) para un par de enteros.
function hash2(a, b) {
    var h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x632BE5AB, 0xC2B2AE35);
    h ^= h >>> 13;
    h = Math.imul(h, 0x27D4EB2F);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function ri(R, a, b) { return Math.floor(a + R() * (b - a + 1)); }
function pick(R, arr) { return arr[Math.floor(R() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mul(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }

function css(c) {
    var r = clamp(Math.round(c[0]), 0, 255), g = clamp(Math.round(c[1]), 0, 255), b = clamp(Math.round(c[2]), 0, 255);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function rect(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function disc(ctx, cx, cy, r, col) {
    ctx.fillStyle = col;
    var n = Math.floor(r);
    for (var dy = -n; dy <= n; dy++) {
        var hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
        ctx.fillRect(Math.round(cx) - hw, Math.round(cy) + dy, hw * 2 + 1, 1);
    }
}

function ell(ctx, cx, cy, rx, ry, col) {
    ctx.fillStyle = col;
    var n = Math.floor(ry);
    for (var dy = -n; dy <= n; dy++) {
        var hw = Math.floor(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
        ctx.fillRect(Math.round(cx) - hw, Math.round(cy) + dy, hw * 2 + 1, 1);
    }
}

// ---------- paleta según la hora ----------

var KEYS = [
    { h: 0,    top: "#0b1030", mid: "#1c2452", hor: "#3a3a6c", cl: "#3e4372", cs: "#262b4e", amb: 0.34, night: 1 },
    { h: 4.8,  top: "#10163a", mid: "#2a2a5e", hor: "#5c4672", cl: "#4c4c7a", cs: "#2e2e54", amb: 0.38, night: 0.95 },
    { h: 6.2,  top: "#46578f", mid: "#c08aa2", hor: "#f7b48a", cl: "#f2c4b0", cs: "#8e7f9e", amb: 0.72, night: 0.45 },
    { h: 7.8,  top: "#5d95d6", mid: "#a6cbea", hor: "#eaeee6", cl: "#ffffff", cs: "#b7c3d6", amb: 1.0,  night: 0 },
    { h: 13,   top: "#4f8fd8", mid: "#94c4ee", hor: "#d6ebf4", cl: "#ffffff", cs: "#b4c4da", amb: 1.0,  night: 0 },
    { h: 16.8, top: "#7d9bcc", mid: "#e3cfa6", hor: "#f6e1a2", cl: "#fbf0cc", cs: "#a4a1b4", amb: 0.95, night: 0.05 },
    { h: 18.4, top: "#86789f", mid: "#efc07c", hor: "#f6a26e", cl: "#f6d39e", cs: "#8b86a0", amb: 0.8,  night: 0.35 },
    { h: 19.6, top: "#2f305e", mid: "#7b5b8c", hor: "#df8a78", cl: "#a07c9c", cs: "#4b4569", amb: 0.52, night: 0.8 },
    { h: 21,   top: "#0b1030", mid: "#1c2452", hor: "#3a3a6c", cl: "#3e4372", cs: "#262b4e", amb: 0.34, night: 1 },
    { h: 24,   top: "#0b1030", mid: "#1c2452", hor: "#3a3a6c", cl: "#3e4372", cs: "#262b4e", amb: 0.34, night: 1 }
];

function palette(w, hour) {
    var i = 0;
    while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
    var a = KEYS[i], b = KEYS[i + 1];
    var f = clamp((hour - a.h) / (b.h - a.h), 0, 1);
    f = f * f * (3 - 2 * f);
    var P = { hour: hour };
    var keys = ["top", "mid", "hor", "cl", "cs"];
    for (var k = 0; k < keys.length; k++) P[keys[k]] = mix(rgb(a[keys[k]]), rgb(b[keys[k]]), f);
    P.amb = a.amb + (b.amb - a.amb) * f;
    P.night = a.night + (b.night - a.night) * f;

    var rain = w ? w.rain : 0, snow = !!(w && w.snow);
    if (rain > 0) {
        // La nieve deja un cielo gris claro; la tormenta, uno casi negro.
        var gray = mul(snow ? [168, 172, 186] : [122, 128, 142], 0.45 + 0.55 * P.amb);
        if (w.storm) gray = mul(gray, 0.72);
        P.top = mix(P.top, mul(gray, 0.85), rain * 0.6);
        P.mid = mix(P.mid, gray, rain * 0.6);
        P.hor = mix(P.hor, mul(gray, 1.1), rain * 0.55);
        P.cl = mix(P.cl, mul(gray, 1.12), rain * 0.7);
        P.cs = mix(P.cs, mul(gray, 0.72), rain * 0.7);
        P.amb *= 1 - (snow ? 0.1 : (w.storm ? 0.32 : 0.22)) * rain;
        P.night = Math.max(P.night, rain * (w.storm ? 0.45 : 0.3));
    }
    P.rain = rain;
    P.snow = snow;
    P.snowCover = w ? w.snowCover : 0;

    // Neblina: aclara el horizonte y deja el cielo lechoso.
    var fog = w ? w.fog : 0;
    P.fog = fog;
    P.fogc = mul(mix(P.hor, [232, 230, 236], 0.5), 0.55 + 0.45 * P.amb);
    if (fog > 0) {
        P.top = mix(P.top, P.fogc, fog * 0.2);
        P.mid = mix(P.mid, P.fogc, fog * 0.45);
        P.hor = mix(P.hor, P.fogc, fog * 0.65);
        P.cl = mix(P.cl, P.fogc, fog * 0.3);
        P.cs = mix(P.cs, P.fogc, fog * 0.4);
    }
    P.haze = mix(P.hor, P.mid, 0.35);
    P.water = mix(mix(P.hor, P.mid, 0.6), [28, 36, 72], 0.3);
    P.waterDeep = mix(P.water, [20, 24, 52], 0.35);
    return P;
}

// Fracción de ventanas encendidas cuando ya está oscuro.
function occupancy(h) {
    if (h >= 17 && h < 22) return 0.7;
    if (h >= 22) return 0.7 - (h - 22) * 0.18;
    if (h < 5) return 0.34 - h * 0.04;
    if (h < 8) return 0.3;
    return 0.25;
}

// Qué tanta gente pasea según la hora (0..1).
function busy(h) {
    if (h < 5) return 0.12;
    if (h < 7) return 0.35;
    if (h < 10) return 0.85;
    if (h < 12) return 0.6;
    if (h < 15) return 0.9;
    if (h < 17) return 0.7;
    if (h < 21) return 1;
    if (h < 23) return 0.5;
    return 0.25;
}

// Tono de un objeto iluminado por el ambiente.
function lit(c, P) {
    return mix(mul(c, 0.35 + 0.65 * P.amb), [24, 26, 58], (1 - P.amb) * 0.3);
}

// ---------- generación del mundo ----------

var BCOLS = ["#8d89a6", "#7b7896", "#9b94ad", "#6f6d8e", "#a7a1b8", "#858aa3", "#9a8f9f", "#7e8698", "#b08a96", "#7a94a8", "#a8987f"];
var LITS = [
    ["#ffd97a", "#ffe6a3", "#ffcb6b", "#fff1c4"],
    ["#bfe3ff", "#d6f0ff", "#a9d2f5", "#e6f6ff"],
    ["#ffb8d6", "#ffd0e4", "#f7a6c8", "#ffe0ee"],
    ["#d4f7a8", "#c2ef96", "#e8ffc8", "#ffe6a3"]
];
var NEON = ["#ff5fa2", "#5ff2ff", "#ffd35f", "#9dff6a", "#c08cff", "#ff8a5f"];
var AWNINGS = ["#c0504d", "#4d7cc0", "#d9a441", "#4f9a6a", "#9a5fb0", "#d0707a"];

var DEPTH = [
    { minW: 8,  maxW: 20, minH: 0.10, maxH: 0.25, gap0: -2, gap1: 2,  ww: 1, wh: 1, gx: 2, gy: 2 },
    { minW: 14, maxW: 30, minH: 0.15, maxH: 0.33, gap0: 0,  gap1: 6,  ww: 2, wh: 2, gx: 2, gy: 2 },
    { minW: 24, maxW: 50, minH: 0.17, maxH: 0.38, gap0: 3,  gap1: 16, ww: 2, wh: 3, gx: 3, gy: 3 }
];

// opts.style fuerza un estilo para los edificios cercanos (lo usa la hoja de propuestas).
function create(W, H, seed, opts) {
    var R = rng(seed || 7);
    var w = { W: W, H: H, opts: opts || {} };
    w.yW = Math.round(H * 0.60);       // línea del agua
    w.yP = Math.round(H * 0.80);       // barandal del paseo
    w.base = w.yW - 5;                 // pie de los edificios; abajo queda la calle de enfrente
    w.axis = w.yW - 1;                 // eje del reflejo
    w.ground = w.yP + 9;               // inicio del piso del paseo
    w.windows = [];
    w.antennas = [];
    w.signs = [];
    w.tvs = [];
    w.leds = [];
    w.screens = [];
    w.catAds = [];
    w.refl = [];
    var id = { n: 1 };
    w.layers = [genLayer(w, R, 0, id), genLayer(w, R, 1, id), genLayer(w, R, 2, id)];

    ensureCat(w);

    // Las luces de antena que tapa un edificio más cercano no se dibujan.
    w.antennas = w.antennas.filter(function (a) { return !occluded(w, a.x, a.y, a.depth); });

    w.stars = [];
    for (var i = 0; i < Math.round(W * H / 900); i++)
        w.stars.push({ x: ri(R, 0, W - 1), y: ri(R, 0, Math.round(w.base * 0.75)), b: 0.3 + R() * 0.7 });

    // Nubes alargadas en capas: más anchas y planas cuanto más cerca del horizonte.
    w.clouds = [];
    var nc = Math.round(W / 50) + 3;
    for (i = 0; i < nc + 7; i++) {
        var storm = i >= nc;
        var cy = storm ? ri(R, 4, 50) : ri(R, 8, Math.round(w.base * 0.62));
        var low = cy / w.base;
        var span = storm ? ri(R, 70, 130) : Math.round(ri(R, 26, 60) * (0.8 + low));
        var c = { x: ri(R, 0, W - 1), y: cy, span: span, storm: storm, flat: 0.45 + 0.25 * (1 - low), puffs: [] };
        var k = Math.max(3, Math.round(span / 7));
        for (var j = 0; j < k; j++) {
            var u = j / (k - 1) * 2 - 1;
            var r = Math.max(2, Math.round((storm ? 9 : 6) * (1 - u * u * 0.7) * (0.6 + R() * 0.6)));
            c.puffs.push({ dx: Math.round(u * span / 2 + (R() - 0.5) * 6), dy: -Math.round(r * c.flat) + ri(R, 0, 1), r: r });
        }
        w.clouds.push(c);
    }

    w.waterLines = [];
    for (var y = w.yW + 1; y < w.yP + 6; y += 2)
        for (i = 0; i < Math.round(W / 30); i++)
            w.waterLines.push({ x: ri(R, 0, W - 1), y: y, len: ri(R, 3, 14), light: R() < 0.5 });

    w.lamps = [];
    w.benches = [];
    for (var x = ri(R, 24, 40); x < W - 10; x += ri(R, 90, 120)) {
        w.lamps.push(x);
        if (R() < 0.75 && x + 45 < W - 20) w.benches.push(x + ri(R, 36, 52));
    }

    w.trees = [makeTree(R, ri(R, 4, 16), w.yP - ri(R, 4, 12), H), makeTree(R, W - ri(R, 6, 18), w.yP - ri(R, 0, 10), H)];
    w.hedge = [];
    for (x = -4; x < W + 8; x += ri(R, 6, 11)) w.hedge.push({ x: x, r: ri(R, 4, 7) });

    w.people = [];
    w.pigeons = [];
    w.flocks = [];
    w.gulls = [];
    w.cars = [];
    w.boats = [];
    w.planes = [];
    w.drops = [];
    w.splashes = [];
    w.meteors = [];
    w.blimp = { x: Math.round(W * (0.2 + R() * 0.3)), y: ri(R, 16, 34), dir: 1, speed: 5 };
    w.timers = { blimp: 60, person: 0, flock: 6, gull: 12, car: 0, boat: 15, plane: 25, meteor: 150, pigeon: 5, weather: 900 + R() * 1200,
        fog: 20, bolt: 8, show: 40, rocket: 0 };
    w.rain = 0;
    w.rainTarget = 0;
    w.rainChance = 0.18;
    // Escenarios del clima (ver step): nieve, tormenta, neblina, arcoíris y fuegos artificiales.
    w.month = new Date().getMonth();
    w.snow = false;            // la precipitación actual es nieve
    w.storm = false;           // la lluvia actual trae relámpagos
    w.snowCover = 0;           // nieve acumulada en techos, barandal y árboles (0..1)
    w.fog = 0;
    w.fogTarget = 0;
    w.wet = 0;                 // recuerdo de la última lluvia, para el arcoíris
    w.rainbow = 0;
    w.bolt = null;
    w.flash = 0;
    w.show = 0;                // segundos que le quedan al espectáculo de fuegos artificiales
    w.rockets = [];
    w.sparks = [];
    w.hour = 12;
    w.lock = false;            // setWeather fija el clima (arneses de prueba)

    // Silueta de la ciudad: lo que está arriba de sky[x] se ve contra el cielo.
    w.sky = [];
    for (x = 0; x < W; x++) w.sky.push(w.base);
    for (var d = 0; d < 3; d++)
        for (i = 0; i < w.layers[d].length; i++) {
            var bb = w.layers[d][i];
            for (j = 0; j < bb.tiers.length; j++) {
                var T = bb.tiers[j];
                for (var tx = 0; tx < T.w; tx++) {
                    var top = T.top;
                    if (bb.slant) {
                        // Techo en diagonal: la columna empieza donde la alcanza el corte.
                        var off = bb.slant.dir > 0 ? tx : T.w - 1 - tx, rr = 0;
                        while (rr < bb.slant.h && Math.max(1, Math.round(T.w * (rr + 1) / bb.slant.h)) <= off) rr++;
                        top += rr;
                    }
                    var sx = T.x + tx;
                    if (sx >= 0 && sx < W && top < w.sky[sx]) w.sky[sx] = top;
                }
            }
        }
    for (i = 0; i < 4; i++) w.pigeons.push(newPigeon(w, true, ri(R, 20, W - 20)));
    for (i = 0; i < 2; i++) w.pigeons.push(newPigeon(w, false, ri(R, 30, W - 30)));
    return w;
}

function makeTree(R, x, cy, H) {
    var t = { x: x, cy: cy, puffs: [] };
    for (var i = 0; i < 9; i++) {
        var r = ri(R, 7, 13);
        var p = { dx: ri(R, -16, 16), dy: ri(R, -18, 12), r: r, dots: [] };
        for (var j = 0; j < 7; j++) {
            var a = R() * Math.PI * 2, d = R() * (r - 2);
            p.dots.push({ x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d), light: j < 3 });
        }
        t.puffs.push(p);
    }
    return t;
}

function genLayer(w, R, depth, id) {
    var D = DEPTH[depth], list = [];
    var x = -Math.floor(R() * D.maxW);
    while (x < w.W) {
        var bw = ri(R, D.minW, D.maxW);
        var bh = ri(R, Math.round(D.minH * w.H), Math.round(D.maxH * w.H));
        if (depth === 2 && R() < 0.12) bh = Math.round(w.H * (0.41 + R() * 0.06));
        list.push(makeBuilding(w, R, depth, x, bw, bh, id));
        x += bw + ri(R, D.gap0, D.gap1);
    }
    return list;
}

var GLASS = ["#5e7f9a", "#6a8fa8", "#4f6e8c", "#7a9fb0", "#5a7a86", "#6d7fa0", "#7d8fb4"];
// Mezcla de estilos de los edificios cercanos: sobre todo vidrio, vidrio con techo en diagonal y clásicos con anuncios.
var STYLES = [["classic", 0.3], ["glass", 0.2], ["gslant", 0.15], ["slant", 0.07], ["led", 0.08], ["round", 0.07], ["green", 0.06], ["twin", 0.07]];
var MODERN = { glass: 1, gslant: 1, led: 1, slant: 1, brace: 1 };

function pickStyle(R, depth, bw, opts) {
    var s = "classic";
    if (depth === 2 && opts.style) s = opts.style;
    else if (depth === 1) s = R() < 0.5 ? "classic" : (R() < 0.7 ? "glass" : "round");
    else if (depth === 2) {
        var r = R(), acc = 0;
        for (var i = 0; i < STYLES.length; i++) {
            acc += STYLES[i][1];
            if (r < acc) { s = STYLES[i][0]; break; }
        }
    }
    if (s === "twin" && bw < 30) s = "glass";
    if (s === "green" && bw < 22) s = "classic";
    return s;
}

function makeBuilding(w, R, depth, x, bw, bh, id) {
    var D = DEPTH[depth], base = w.base;
    var style = depth === 0 ? "classic" : pickStyle(R, depth, bw, w.opts);
    if (MODERN[style]) bh = Math.min(Math.round(bh * 1.12), w.base - 12);
    var top = base - bh;
    var glassy = style === "glass" || style === "gslant" || style === "brace" || style === "led" || style === "round";
    var b = {
        x: x, w: bw, top: top, depth: depth, style: style, tiers: [], wins: [], roof: [], sign: null, shop: null,
        col: rgb(pick(R, glassy ? GLASS : BCOLS))
    };
    var tr = R();
    b.tone = tr < 0.6 ? 0 : (tr < 0.8 ? 1 : (tr < 0.92 ? 2 : 3));
    if (glassy && R() < 0.5) b.tone = 1;

    // Volumen.
    if (style === "twin") {
        var gap = ri(R, 4, 6), tw = Math.floor((bw - gap) / 2);
        b.tiers.push({ x: x, w: tw, top: top, own: true });
        b.tiers.push({ x: x + tw + gap, w: tw, top: top + ri(R, 0, 8), own: true });
        b.bridge = { x: x + tw, w: gap, y: top + Math.round(bh * (0.3 + R() * 0.2)) };
    } else if (style === "led" && bw >= 18) {
        // Corona escalonada.
        var steps = ri(R, 2, 3), cur = { x: x, w: bw, top: base - Math.round(bh * 0.7) };
        b.tiers.push(cur);
        for (var s = 1; s < steps; s++) {
            var inset = Math.max(2, Math.round(bw * 0.12));
            var nt = { x: cur.x + inset, w: cur.w - 2 * inset, top: s === steps - 1 ? top : cur.top - Math.round(bh * 0.15) };
            if (nt.w < 6) break;
            b.tiers.push(nt);
            cur = nt;
        }
    } else if ((style === "classic" || style === "glass") && depth > 0 && bw >= 16 && R() < 0.35) {
        var h1 = Math.round(bh * (0.55 + R() * 0.2));
        var ins = Math.max(2, Math.round(bw * (0.12 + R() * 0.14)));
        b.tiers.push({ x: x, w: bw, top: base - h1 });
        b.tiers.push({ x: x + ins, w: bw - 2 * ins, top: top });
    } else {
        b.tiers.push({ x: x, w: bw, top: top });
    }
    if (style === "slant" || style === "gslant") b.slant = { h: Math.min(12, Math.max(4, Math.round(bw * (0.18 + R() * 0.17)))), dir: R() < 0.5 ? 1 : -1 };

    // Ventanas según el estilo.
    var ww = D.ww, wh = D.wh, gx = D.gx, gy = D.gy, ribbon = false;
    if (depth === 2) {
        var v = pick(R, [[2, 3, 3, 3], [3, 2, 2, 3], [2, 2, 2, 2], [3, 3, 2, 3], [2, 4, 3, 2]]);
        ww = v[0]; wh = v[1]; gx = v[2]; gy = v[3];
        ribbon = style === "classic" && R() < 0.3;
    } else if (depth === 1) {
        if (R() < 0.4) ww = 1;
        ribbon = style === "classic" && R() < 0.3;
    }
    if (style === "glass" || style === "gslant" || style === "brace") { ww = 3; wh = 2; gx = 1; gy = 1; }
    if (style === "round") { ww = 2; wh = 3; gx = 1; gy = 1; }
    if (style === "led") { ww = 2; wh = 2; gx = 2; gy = 2; }
    var segW = ri(R, 3, 6);
    for (var i = 0; i < b.tiers.length; i++) {
        var T = b.tiers[i];
        var y0 = T.top + (depth === 2 ? 4 : 2);
        if (b.slant) y0 = T.top + b.slant.h + 2;
        var y1 = i === 0 || T.own ? base - (depth === 2 ? 8 : 2) : b.tiers[i - 1].top - 2;
        var m = depth === 2 ? (glassy ? 2 : 3) : (depth === 1 ? 2 : 1);
        var inner = T.w - 2 * m - (depth > 0 ? 1 : 0);
        var yy, xx;
        if (style === "green") {
            // Departamentos con balcones: un piso cada 5 filas.
            b.floors = [];
            b.plants = [];
            for (yy = T.top + 3; yy + 5 <= y1; yy += 5) {
                b.floors.push(yy + 3);
                for (xx = T.x + 2; xx + 3 <= T.x + T.w - 2; xx += 5) addWin(w, b, R, xx, yy, 4, 3, id);
                for (xx = T.x; xx < T.x + T.w; xx++) if (R() < 0.3) b.plants.push({ x: xx, y: yy + 2, k: R() < 0.3 });
            }
        } else if (!ribbon) {
            var cols = Math.floor((inner + gx) / (ww + gx));
            if (cols < 1) continue;
            var sx = T.x + m + Math.floor((inner - (cols * (ww + gx) - gx)) / 2);
            for (yy = y0; yy + wh <= y1; yy += wh + gy)
                for (var c = 0; c < cols; c++) {
                    if (depth === 0 && R() < 0.35) continue;
                    addWin(w, b, R, sx + c * (ww + gx), yy, ww, wh, id);
                }
        } else {
            for (yy = y0; yy + 2 <= y1; yy += 4)
                for (xx = T.x + m; xx + 2 <= T.x + m + inner; xx += segW + 1)
                    addWin(w, b, R, xx, yy, Math.min(segW, T.x + m + inner - xx), 2, id);
        }
    }

    // Techo.
    var TT = b.tiers[b.tiers.length - 1];
    var r = R();
    if (depth === 2 && style === "classic" && TT.w >= 16 && R() < 0.6) {
        var ad = pick(R, [ADS[0], ADS[0], ADS[1], ADS[2], ADS[3]]);
        if (ad.cat && TT.w < 26) ad = ADS[1 + Math.floor(R() * 3)];
        var bbh = ad.cat ? 18 : 10;
        var bbw = ad.cat ? Math.min(TT.w + 4, ri(R, 30, 34)) : Math.min(TT.w - 2, ri(R, 15, 19));
        var bbx = TT.x + Math.floor((TT.w - bbw) / 2);
        b.billboard = {
            x: bbx, y: TT.top - 3 - bbh, w: bbw, h: bbh, ad: ad, ph: R() * 16,
            lx0: Math.max(bbx + 2, TT.x + 1), lx1: Math.min(bbx + bbw - 3, TT.x + TT.w - 2)
        };
        if (ad.cat) w.catAds.push(b.billboard);
    } else if (depth === 0) {
        if (r < 0.25) addAntenna(w, b, TT, TT.x + ri(R, 1, Math.max(1, TT.w - 2)), ri(R, 3, 7), R);
    } else if (b.slant) {
        addAntenna(w, b, TT, b.slant.dir > 0 ? TT.x + 1 : TT.x + TT.w - 2, ri(R, 4, 10), R);
    } else if (style === "twin") {
        addAntenna(w, b, b.tiers[0], b.tiers[0].x + Math.floor(b.tiers[0].w / 2), ri(R, 6, 12), R);
    } else if (style === "led") {
        addAntenna(w, b, TT, TT.x + Math.floor(TT.w / 2), ri(R, 8, 18), R);
    } else if (r < 0.28) {
        addAntenna(w, b, TT, TT.x + ri(R, 2, Math.max(2, TT.w - 3)), depth === 2 ? ri(R, 6, 16) : ri(R, 4, 9), R);
    } else if (r < 0.40 && depth === 2 && TT.w >= 18 && style === "classic") {
        b.roof.push({ t: "tank", x: TT.x + ri(R, 3, TT.w - 10) });
    } else if (r < 0.52 && TT.w >= 10 && style === "classic") {
        b.roof.push({ t: "spire" });
        var st = Math.ceil((TT.w - 2) / 2);
        w.antennas.push({ x: TT.x + Math.floor(TT.w / 2), y: TT.top - st * 2 - 4, ph: R() * 2, depth: depth });
    } else if (r < 0.58 && TT.w >= 12 && style === "classic") {
        b.roof.push({ t: "dome" });
    } else if (R() < 0.6 && style !== "round") {
        b.roof.push({ t: "box", x: TT.x + ri(R, 1, Math.max(1, TT.w - 7)), w: ri(R, 3, 5), h: ri(R, 2, 3) });
    }

    if (depth === 2 && style === "classic") {
        b.balc = R() < 0.4;
    }
    if (depth === 2 && style === "led") {
        b.led = { col: rgb(pick(R, NEON)), ph: R() * 10 };
        w.leds.push(b);
        if (bw >= 22 && R() < 0.7) {
            var scw = Math.min(16, bw - 8);
            b.screen = { x: x + Math.floor((bw - scw) / 2), y: b.tiers[0].top + ri(R, 6, 14), w: scw, h: Math.round(scw * 0.6), id: id.n++ };
            w.screens.push(b.screen);
        }
    }
    if (depth === 2 && style === "classic" && bw >= 20 && R() < 0.4) {
        var vertical = R() < 0.45;
        var sw = vertical ? 4 : ri(R, 8, Math.min(16, bw - 6));
        var sh = vertical ? ri(R, 10, 18) : ri(R, 4, 6);
        var sxs = vertical ? (R() < 0.5 ? x + 1 : x + bw - 5) : x + Math.floor((bw - sw) / 2);
        var sy = top + ri(R, 4, Math.max(5, Math.min(24, bh - sh - 12)));
        var bits = [];
        for (var k = 0; k < (sw - 2) * (sh - 2); k++) bits.push(R() < 0.55);
        b.sign = { x: sxs, y: sy, w: sw, h: sh, col: rgb(pick(R, NEON)), bits: bits, id: id.n++ };
        w.signs.push(b.sign);
    }
    if (depth === 2 && style !== "twin") b.shop = { awn: rgb(pick(R, AWNINGS)), door: ri(R, 3, Math.max(3, bw - 6)) };
    return b;
}

// Garantiza al menos un anuncio de gato visible: usa el edificio clásico más ancho que lo permita.
function ensureCat(w) {
    function onScreen(q) { return q.x > 0 && q.x + q.w < w.W; }
    if (w.catAds.some(onScreen)) return;
    var best = null, bw = 0;
    for (var i = 0; i < w.layers[2].length; i++) {
        var b = w.layers[2][i], T = b.tiers[b.tiers.length - 1];
        if (b.style !== "classic" || T.w < 26 || T.x < 4 || T.x + T.w > w.W - 4) continue;
        if (b.roof.some(function (q) { return q.t === "ant" || q.t === "spire"; })) continue;
        if (T.w > bw) { best = b; bw = T.w; }
    }
    if (!best) return;
    var TT = best.tiers[best.tiers.length - 1], bbw = Math.min(TT.w + 4, 32), bbx = TT.x + Math.floor((TT.w - bbw) / 2);
    best.roof = [];
    best.billboard = {
        x: bbx, y: TT.top - 21, w: bbw, h: 18, ad: ADS[0], ph: 0,
        lx0: Math.max(bbx + 2, TT.x + 1), lx1: Math.min(bbx + bbw - 3, TT.x + TT.w - 2)
    };
    w.catAds.push(best.billboard);
}

function addWin(w, b, R, x, y, ww, wh, id) {
    var win = { x: x, y: y, w: ww, h: wh, id: id.n++ };
    b.wins.push(win);
    if (b.depth === 2 && R() < 0.03) w.tvs.push(win);
}

function addAntenna(w, b, TT, x, h, R) {
    b.roof.push({ t: "ant", x: x, h: h, y0: TT.top });
    w.antennas.push({ x: x, y: TT.top - h - 1, ph: R() * 2, depth: b.depth });
}

function occluded(w, x, y, depth) {
    for (var d = depth + 1; d < 3; d++) {
        var L = w.layers[d];
        for (var i = 0; i < L.length; i++)
            for (var j = 0; j < L[i].tiers.length; j++) {
                var T = L[i].tiers[j];
                if (x >= T.x && x < T.x + T.w && y >= T.top - 2) return true;
            }
    }
    return false;
}

// ---------- capa: cielo (se repinta cada ~30 s) ----------

function sunPos(w, hour) {
    if (hour < 5.6 || hour > 19.4) return null;
    var f = (hour - 5.6) / 13.8, s = Math.sin(Math.PI * f);
    return { x: Math.round(w.W * (0.08 + 0.84 * f)), y: Math.round(w.base - s * (w.base - 16)), low: 1 - s };
}

function moonPos(w, hour) {
    var hh = hour < 12 ? hour + 24 : hour;
    if (hh < 19.2 || hh > 30.2) return null;
    var f = (hh - 19.2) / 11, s = Math.sin(Math.PI * f);
    return { x: Math.round(w.W * (0.88 - 0.76 * f)), y: Math.round(w.base - s * (w.base - 18)) };
}

function skyAt(P, t) {
    return t < 0.55 ? mix(P.top, P.mid, t / 0.55) : mix(P.mid, P.hor, (t - 0.55) / 0.45);
}

function drawSky(ctx, w, P) {
    var W = w.W, bh = 5, n = Math.ceil(w.yW / bh) + 1;
    var prev = null;
    for (var i = 0; i < n; i++) {
        var col = css(skyAt(P, clamp((i + 0.5) * bh / w.yW, 0, 1)));
        rect(ctx, 0, i * bh, W, bh, col);
        if (prev) {
            // Tramado entre bandas, típico del pixel art.
            ctx.fillStyle = prev;
            for (var x = i % 2; x < W; x += 2) ctx.fillRect(x, i * bh, 1, 1);
        }
        prev = col;
    }
    rect(ctx, 0, n * bh, W, w.H - n * bh, css(P.hor));

    if (P.night > 0.15) {
        for (i = 0; i < w.stars.length; i++) {
            var s = w.stars[i];
            ctx.globalAlpha = clamp((P.night - 0.15) * 1.3, 0, 1) * s.b * (1 - P.rain);
            rect(ctx, s.x, s.y, 1, 1, "#fff8e8");
        }
        ctx.globalAlpha = 1;
    }

    var sun = sunPos(w, P.hour);
    if (sun) drawRays(ctx, w, P, sun);
    if (sun) {
        var sc = mix([255, 246, 214], [255, 170, 110], sun.low);
        ctx.globalAlpha = 0.18 * (1 - P.rain);
        disc(ctx, sun.x, sun.y, 13, css(mix(sc, P.hor, 0.3)));
        ctx.globalAlpha = 0.35 * (1 - P.rain);
        disc(ctx, sun.x, sun.y, 9, css(sc));
        ctx.globalAlpha = 1 - P.rain * 0.7;
        disc(ctx, sun.x, sun.y, 6, css(sc));
        ctx.globalAlpha = 1;
    }
    var moon = moonPos(w, P.hour);
    if (moon) {
        ctx.globalAlpha = 0.15 * (1 - P.rain);
        disc(ctx, moon.x, moon.y, 8, "#d8dcf0");
        ctx.globalAlpha = 1 - P.rain * 0.8;
        disc(ctx, moon.x, moon.y, 5, "#f4f1dc");
        rect(ctx, moon.x - 2, moon.y - 1, 2, 2, "#d9d4bc");
        rect(ctx, moon.x + 2, moon.y + 2, 1, 1, "#d9d4bc");
        rect(ctx, moon.x + 1, moon.y - 3, 1, 1, "#d9d4bc");
        ctx.globalAlpha = 1;
    }
    if (sun && w.rainbow > 0.02) drawRainbow(ctx, w, P, sun);
}

// Rayos de sol que salen de detrás de los edificios cuando el sol está bajo (amanecer y
// atardecer). Con neblina se marcan más. Cada rayo es una cuña recortada fila por fila.
function drawRays(ctx, w, P, sun) {
    var k = clamp((sun.low - 0.45) / 0.5, 0, 1) * (1 - P.rain) * (1 + 0.8 * P.fog);
    if (k < 0.03) return;
    var c = mix([255, 236, 190], [255, 180, 120], sun.low), col = css(c);
    // Resplandor cálido en el horizonte, alrededor del sol.
    for (var g = 0; g < 4; g++) {
        ctx.globalAlpha = 0.1 * k;
        ell(ctx, sun.x, w.base, Math.round(w.W * (0.42 - g * 0.09)), Math.round(w.base * (0.42 - g * 0.08)), col);
    }
    var reach = sun.y - 4;
    ctx.fillStyle = col;
    for (var i = 0; i < 7; i++) {
        var a = (i - 3) * 0.36 + (hash2(i, 5) - 0.5) * 0.2, da = 0.045 + hash2(i, 9) * 0.05;
        var t0 = Math.tan(a - da), t1 = Math.tan(a + da), str = 0.6 + hash2(i, 13) * 0.4;
        for (var y = Math.max(0, sun.y - 6); y >= 0; y--) {
            var up = sun.y - y, fade = 1 - (up / reach) * (up / reach);
            if (fade <= 0) break;
            var x0 = Math.round(sun.x + up * t0), x1 = Math.round(sun.x + up * t1);
            if (x1 < 0 || x0 >= w.W) continue;
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.2 * k * str * fade;
            ctx.fillRect(x0, y, Math.max(1, x1 - x0), 1);
        }
    }
    ctx.globalAlpha = 1;
}

// Arcoíris del lado opuesto al sol, después de la lluvia.
var RAINBOW = ["#ff5a5a", "#ffa040", "#ffe45a", "#70dc70", "#5aa8ff", "#9070ff"];
function drawRainbow(ctx, w, P, sun) {
    var cx = sun.x < w.W / 2 ? Math.round(w.W * 0.7) : Math.round(w.W * 0.3);
    var cy = w.base + 8, R0 = Math.round(w.base * 0.86);
    var k = w.rainbow * 0.48 * (1 - P.rain * 0.6);
    for (var b = 0; b < RAINBOW.length; b++) {
        ctx.fillStyle = RAINBOW[b];
        for (var s = 0; s < 2; s++) {
            var r = R0 - b * 2 - s, prev = null;
            for (var x = cx - r; x <= cx + r; x++) {
                if (x < 0 || x >= w.W) { prev = null; continue; }
                var dx = x - cx, y = Math.round(cy - Math.sqrt(r * r - dx * dx));
                // Más tenue arriba, como los de verdad.
                ctx.globalAlpha = k * (0.55 + 0.45 * Math.abs(dx) / r);
                var y0 = prev === null ? y : Math.min(y, prev + 1), y1 = prev === null ? y : Math.max(y, prev - 1);
                ctx.fillRect(x, y0, 1, y1 - y0 + 1);
                prev = y;
            }
        }
    }
    ctx.globalAlpha = 1;
}

// ---------- capa: nubes (lienzo de 2W de ancho, se repite cada W) ----------

function drawClouds(ctx, w, P) {
    var W = w.W;
    ctx.clearRect(0, 0, W * 2, w.H);
    var L = css(P.cl), M = css(mix(P.cl, P.cs, 0.45)), S = css(P.cs);
    for (var i = 0; i < w.clouds.length; i++) {
        var c = w.clouds[i];
        if (c.storm && w.rain < 0.15) continue;
        ctx.globalAlpha = c.storm ? clamp((w.rain - 0.15) * 2, 0, 1) : 1;
        for (var o = -1; o <= 1; o++) {
            var X = c.x + o * W;
            if (X + c.span < 0 || X - c.span > W * 2) continue;
            var j, p, sq = c.flat;
            for (j = 0; j < c.puffs.length; j++) { p = c.puffs[j]; ell(ctx, X + p.dx, c.y + p.dy + 2, p.r * 1.8, p.r * sq + 1, S); }
            for (j = 0; j < c.puffs.length; j++) { p = c.puffs[j]; ell(ctx, X + p.dx, c.y + p.dy, p.r * 1.8 - 1, p.r * sq, M); }
            for (j = 0; j < c.puffs.length; j++) {
                p = c.puffs[j];
                if (p.r >= 3) ell(ctx, X + p.dx - 2, c.y + p.dy - 1, p.r * 1.1, Math.max(1, p.r * sq * 0.55), L);
            }
        }
    }
    ctx.globalAlpha = 1;
}

// ---------- capa: ciudad, agua y paseo (se repinta cada ~30 s) ----------

function bcol(c, P, depth) {
    var d = mix(mul(c, P.amb), P.hor, 0.10);
    d = mix(d, [24, 26, 58], (1 - P.amb) * 0.35);
    if (depth === 0) d = mix(d, P.haze, 0.55);
    else if (depth === 1) d = mix(d, P.haze, 0.28);
    return d;
}

function drawBuilding(ctx, w, b, P, t, hour, collect) {
    var base = w.base;
    var c = bcol(b.col, P, b.depth);
    var cs = css(c), dk = css(mul(c, 0.8)), lt = css(mix(c, [255, 255, 255], 0.13));
    var i, T, st = b.style;
    for (i = 0; i < b.tiers.length; i++) {
        T = b.tiers[i];
        var y0 = T.top;
        if (b.slant) {
            // Techo cortado en diagonal.
            var sh = b.slant.h;
            for (var rr0 = 0; rr0 < sh; rr0++) {
                var wr = Math.max(1, Math.round(T.w * (rr0 + 1) / sh));
                var sx0 = b.slant.dir > 0 ? T.x : T.x + T.w - wr;
                rect(ctx, sx0, T.top + rr0, wr, 1, cs);
                rect(ctx, b.slant.dir > 0 ? sx0 + wr - 1 : sx0, T.top + rr0, 1, 1, st === "gslant" && P.night > 0.4 ? "#dff0ff" : lt);
            }
            y0 = T.top + sh;
        }
        if (st === "round") {
            rect(ctx, T.x + 2, y0, T.w - 4, 1, cs);
            rect(ctx, T.x + 1, y0 + 1, T.w - 2, 1, cs);
            y0 += 2;
        }
        rect(ctx, T.x, y0, T.w, base - y0, cs);
        if (st === "round") {
            // Fachada curva: luz a la izquierda, sombra degradada a la derecha.
            rect(ctx, T.x, y0, 1, base - y0, lt);
            rect(ctx, T.x + 1, y0, 1, base - y0, css(mix(c, [255, 255, 255], 0.07)));
            rect(ctx, T.x + T.w - 3, y0, 1, base - y0, css(mul(c, 0.88)));
            rect(ctx, T.x + T.w - 2, y0, 2, base - y0, dk);
        } else if (b.depth > 0) {
            rect(ctx, T.x + T.w - 2, y0, 2, base - y0, dk);
            rect(ctx, T.x, y0, 1, base - y0, lt);
        }
        if (!b.slant) rect(ctx, T.x, y0, T.w, 1, lt);
        if (b.depth === 2 && st === "classic") rect(ctx, T.x, T.top + 1, T.w, 1, dk);
    }
    if (b.bridge) {
        rect(ctx, b.bridge.x, b.bridge.y, b.bridge.w, 4, css(mul(c, 0.9)));
        rect(ctx, b.bridge.x, b.bridge.y + 1, b.bridge.w, 2, css(P.night > 0.5 ? [255, 226, 160] : mix(c, P.mid, 0.5)));
    }

    // Ventanas: cada una se prende y apaga a su propio ritmo.
    var occ = occupancy(hour) * clamp(P.night * 1.6, 0, 1);
    var unlit = P.night > 0.5 ? css(mul(c, 0.62)) : css(mix(mul(c, 0.72), P.mid, 0.3));
    var haze = b.depth === 0 ? 0.35 : (b.depth === 1 ? 0.12 : 0);
    var lits = LITS[b.tone].map(function (h) { return css(mix(rgb(h), P.haze, haze)); });
    var glass = st === "glass" || st === "gslant" || st === "brace" || st === "round" || st === "led";
    for (i = 0; i < b.wins.length; i++) {
        var win = b.wins[i];
        var on = occ > 0 && hash2(win.id, Math.floor((t + win.id * 37) / (70 + (win.id % 11) * 35))) < occ;
        var col = on ? lits[win.id % lits.length] : unlit;
        if (!on && glass && P.night < 0.6) {
            // El vidrio refleja el cielo, con una franja de brillo en diagonal.
            var g = mix(skyAt(P, clamp(1 - (win.y - b.top) / (base - b.top), 0, 1) * 0.6 + 0.3), c, 0.45);
            if (((win.x - win.y * 0.7 + b.x * 3) % 41 + 41) % 41 < 6) g = mix(g, [255, 255, 255], 0.3);
            col = css(mix(g, P.haze, haze));
        }
        rect(ctx, win.x, win.y, win.w, win.h, col);
        if (b.balc) {
            rect(ctx, win.x - 1, win.y + win.h, win.w + 2, 1, lt);
            if (win.id % 5 === 0) rect(ctx, win.x + win.w, win.y + win.h - 1, 1, 1, css(lit([88, 150, 96], P)));
        }
        if (on && collect && b.depth > 0) {
            var ry = 2 * w.axis - (win.y + win.h - 1);
            if (ry >= w.yW && ry < w.yP + 6) w.refl.push({ x: win.x, y: ry, w: win.w, col: col, id: win.id });
        }
    }

    if (st === "green") {
        // Balcones con plantas.
        var slab = css(mix(c, [255, 255, 255], 0.25)), slabD = css(mul(c, 0.7));
        T = b.tiers[0];
        for (i = 0; i < b.floors.length; i++) {
            rect(ctx, T.x - 1, b.floors[i], T.w + 2, 1, slab);
            rect(ctx, T.x - 1, b.floors[i] + 1, T.w + 2, 1, slabD);
        }
        var leaf = lit([88, 150, 96], P), leafD = lit([56, 110, 72], P), flower = lit([230, 120, 150], P);
        for (i = 0; i < b.plants.length; i++) {
            var pl = b.plants[i];
            rect(ctx, pl.x, pl.y, 1, 1, css(pl.k ? flower : (i % 2 ? leaf : leafD)));
            if (i % 3 === 0) rect(ctx, pl.x, pl.y - 1, 1, 1, css(leaf));
        }
    }
    if (st === "brace") {
        // Estructura diagonal en X por fuera del vidrio.
        T = b.tiers[0];
        var fr = css(mix(c, [255, 255, 255], 0.3)), mh = T.w;
        ctx.fillStyle = fr;
        for (var my = T.top + 2; my + 2 < base - 8; my += mh) {
            var hh = Math.min(mh, base - 8 - my);
            for (var k2 = 0; k2 < T.w; k2++) {
                var yy2 = my + Math.round(k2 * hh / T.w);
                ctx.fillRect(T.x + k2, yy2, 1, 1);
                ctx.fillRect(T.x + T.w - 1 - k2, yy2, 1, 1);
            }
            ctx.fillRect(T.x, my, T.w, 1);
        }
    }
    if (st === "led" || st === "glass") {
        // Corona iluminada.
        T = b.tiers[b.tiers.length - 1];
        rect(ctx, T.x, T.top, T.w, 1, P.night > 0.4 ? (st === "led" ? css(b.led.col) : "#e8f4ff") : lt);
    }

    if (b.billboard) drawBillboard(ctx, b.billboard, c, P);

    if (b.shop) {
        var night = P.night > 0.4;
        rect(ctx, b.x + 1, base - 7, b.w - 3, 2, css(lit(b.shop.awn, P)));
        ctx.fillStyle = css(mix(lit(b.shop.awn, P), [255, 255, 255], 0.35));
        for (var ax = b.x + 1; ax < b.x + b.w - 2; ax += 3) ctx.fillRect(ax, base - 7, 1, 2);
        rect(ctx, b.x + 2, base - 5, b.w - 5, 4, night ? "#ffe2a0" : css(mix(mul(c, 0.7), P.mid, 0.4)));
        rect(ctx, b.x + b.shop.door, base - 5, 2, 5, css(mul(c, 0.45)));
    }

    if (b.sign) {
        var s = b.sign, on2 = P.night > 0.3;
        var sc = on2 ? s.col : mix(s.col, c, 0.55);
        if (on2) {
            ctx.globalAlpha = 0.3;
            rect(ctx, s.x - 1, s.y - 1, s.w + 2, s.h + 2, css(s.col));
            ctx.globalAlpha = 1;
        }
        rect(ctx, s.x, s.y, s.w, s.h, css(mul(c, 0.4)));
        ctx.fillStyle = css(sc);
        ctx.fillRect(s.x, s.y, s.w, 1);
        ctx.fillRect(s.x, s.y + s.h - 1, s.w, 1);
        ctx.fillRect(s.x, s.y, 1, s.h);
        ctx.fillRect(s.x + s.w - 1, s.y, 1, s.h);
        ctx.fillStyle = css(on2 ? mix(s.col, [255, 255, 255], 0.5) : sc);
        for (var k = 0; k < s.bits.length; k++)
            if (s.bits[k]) ctx.fillRect(s.x + 1 + k % (s.w - 2), s.y + 1 + Math.floor(k / (s.w - 2)), 1, 1);
    }

    T = b.tiers[b.tiers.length - 1];
    for (i = 0; i < b.roof.length; i++) {
        var r = b.roof[i];
        if (r.t === "ant") {
            rect(ctx, r.x, r.y0 - r.h, 1, r.h, dk);
            if (r.h > 8) rect(ctx, r.x - 1, r.y0 - Math.round(r.h * 0.6), 3, 1, dk);
        } else if (r.t === "tank") {
            rect(ctx, r.x, T.top - 3, 1, 3, dk);
            rect(ctx, r.x + 5, T.top - 3, 1, 3, dk);
            rect(ctx, r.x - 1, T.top - 8, 8, 5, css(mix(c, [140, 100, 80], 0.35)));
            rect(ctx, r.x - 1, T.top - 8, 8, 1, lt);
            rect(ctx, r.x, T.top - 9, 6, 1, dk);
            rect(ctx, r.x + 2, T.top - 10, 2, 1, dk);
        } else if (r.t === "spire") {
            var cur = T.w - 2, y = T.top - 2;
            while (cur >= 1) {
                rect(ctx, T.x + Math.floor((T.w - cur) / 2), y, cur, 2, cs);
                rect(ctx, T.x + Math.floor((T.w - cur) / 2) + cur - 1, y, 1, 2, dk);
                y -= 2;
                cur -= 2;
            }
            rect(ctx, T.x + Math.floor(T.w / 2), y - 1, 1, 3, dk);
        } else if (r.t === "dome") {
            var rr = Math.floor(T.w / 2) - 1, cx = T.x + Math.floor(T.w / 2);
            for (var dy = 0; dy <= rr; dy++) {
                var hw = Math.floor(Math.sqrt(rr * rr - dy * dy));
                rect(ctx, cx - hw, T.top - 1 - dy, hw * 2 + 1, 1, dy === rr ? lt : cs);
            }
        } else if (r.t === "box") {
            rect(ctx, r.x, T.top - r.h, r.w, r.h, dk);
            rect(ctx, r.x, T.top - r.h, r.w, 1, lt);
        }
    }
}

function drawBuildings(ctx, w, P, t, hour, collect) {
    for (var d = 0; d < 3; d++)
        for (var i = 0; i < w.layers[d].length; i++) drawBuilding(ctx, w, w.layers[d][i], P, t, hour, collect);
}

// Nieve acumulada sobre los techos planos de una capa de edificios.
function drawRoofSnow(ctx, w, d, P) {
    var sc = P.snowCover, col = css(mix(lit([236, 240, 248], P), P.haze, d === 0 ? 0.45 : 0));
    ctx.globalAlpha = clamp(sc * 1.5, 0, 1);
    for (var i = 0; i < w.layers[d].length; i++) {
        var b = w.layers[d][i];
        if (b.slant) continue;
        var ins = b.style === "round" ? 2 : 0;
        for (var j = 0; j < b.tiers.length; j++) {
            var T = b.tiers[j];
            rect(ctx, T.x + ins, T.top, T.w - 2 * ins, 1, col);
            if (sc > 0.55 && d > 0) rect(ctx, T.x + ins + 1, T.top - 1, T.w - 2 * ins - 2, 1, col);
        }
    }
    ctx.globalAlpha = 1;
}

function drawCity(ctx, w, P, t) {
    var W = w.W, H = w.H, hour = P.hour;
    ctx.clearRect(0, 0, W, H);
    w.refl = [];
    // Capa por capa, para que la neblina cubra más a los edificios lejanos.
    for (var d = 0; d < 3; d++) {
        for (var bi = 0; bi < w.layers[d].length; bi++) drawBuilding(ctx, w, w.layers[d][bi], P, t, hour, true);
        if (P.snowCover > 0.03) drawRoofSnow(ctx, w, d, P);
        if (P.fog > 0.02) {
            var fh = Math.round(w.base * 0.8), fa = [0.48, 0.4, 0.26][d] * P.fog;
            ctx.fillStyle = css(P.fogc);
            for (var fy = 0; fy < fh; fy += 2) {
                var u = 1 - fy / fh;
                ctx.globalAlpha = fa * u * u;
                ctx.fillRect(0, w.base - fy - 2, W, 2);
            }
            ctx.globalAlpha = 1;
        }
    }

    // Malecón del otro lado, con su calle.
    var road = lit([70, 68, 92], P);
    rect(ctx, 0, w.base, W, w.yW - w.base, css(road));
    rect(ctx, 0, w.base, W, 1, css(mix(road, [255, 255, 255], 0.15)));
    ctx.fillStyle = css(mix(road, [255, 255, 255], 0.3));
    for (var lx2 = 0; lx2 < W; lx2 += 8) ctx.fillRect(lx2, w.base + 2, 4, 1);
    rect(ctx, 0, w.yW - 1, W, 1, css(mul(road, 0.7)));

    // Agua con el reflejo de la ciudad.
    var wTop = w.yW, wBot = w.yP + 7;
    for (var y = wTop; y < wBot; y += 3)
        rect(ctx, 0, y, W, 3, css(mix(P.water, P.waterDeep, (y - wTop) / (wBot - wTop))));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, wTop, W, wBot - wTop);
    ctx.clip();
    ctx.globalAlpha = 0.12;
    ctx.translate(0, 2 * w.axis + 1);
    ctx.scale(1, -1);
    drawBuildings(ctx, w, P, t, hour, false);
    ctx.restore();
    // Velo del color del agua para que el reflejo quede tenue.
    ctx.globalAlpha = 0.5 + 0.18 * P.night;
    for (y = wTop; y < wBot; y += 3)
        rect(ctx, 0, y, W, 3, css(mix(P.water, P.waterDeep, (y - wTop) / (wBot - wTop))));
    ctx.globalAlpha = 0.35;
    var wl = css(mix(P.water, [255, 255, 255], 0.25)), wd = css(mul(P.waterDeep, 0.8));
    for (var i = 0; i < w.waterLines.length; i++) {
        var l = w.waterLines[i];
        rect(ctx, l.x, l.y, l.len, 1, l.light ? wl : wd);
    }
    ctx.globalAlpha = 1;
    // Neblina pegada al agua.
    if (P.fog > 0.02) {
        ctx.fillStyle = css(P.fogc);
        for (y = w.base; y < wBot; y += 2) {
            var mu = 1 - (y - w.base) / (wBot - w.base);
            ctx.globalAlpha = 0.5 * P.fog * mu;
            ctx.fillRect(0, y, W, 2);
        }
        ctx.globalAlpha = 1;
    }
    var snowC = css(lit([236, 240, 248], P)), sc = P.snowCover;

    // Barandal.
    var railC = lit([96, 92, 118], P), yP = w.yP;
    var rail = css(railC), railL = css(mix(railC, [255, 255, 255], 0.25)), railD = css(mul(railC, 0.7));
    rect(ctx, 0, yP, W, 1, railL);
    rect(ctx, 0, yP + 1, W, 1, rail);
    rect(ctx, 0, yP + 4, W, 1, railD);
    ctx.fillStyle = railD;
    for (var x = 2; x < W; x += 9) ctx.fillRect(x, yP + 2, 1, 5);
    if (sc > 0.15) rect(ctx, 0, yP - 1, W, sc > 0.5 ? 2 : 1, snowC);

    // Piso del paseo (blanqueado si nevó).
    var pave = mix(lit([150, 144, 166], P), lit([226, 230, 240], P), sc * 0.75);
    rect(ctx, 0, yP + 7, W, 2, css(mul(pave, 0.75)));
    rect(ctx, 0, yP + 7, W, 1, css(mix(pave, [255, 255, 255], 0.1)));
    rect(ctx, 0, w.ground, W, H - w.ground, css(pave));
    ctx.fillStyle = css(mul(pave, 0.9));
    for (var row = 0, yy = w.ground; yy < H; yy += 6, row++) {
        ctx.fillRect(0, yy + 5, W, 1);
        for (x = (row % 2) * 6; x < W; x += 12) ctx.fillRect(x, yy, 1, 5);
    }

    // Charcos de luz de los faroles.
    if (P.night > 0.4) {
        for (i = 0; i < w.lamps.length; i++)
            for (var ring = 0; ring < 2; ring++) {
                ctx.globalAlpha = 0.06 * P.night;
                ell(ctx, w.lamps[i], w.ground + 7, ring ? 8 : 14, ring ? 2 : 3, "#ffe1a0");
            }
        ctx.globalAlpha = 1;
    }

    // Bancas.
    var bench = lit([110, 78, 62], P), metal = css(lit([60, 60, 74], P));
    for (i = 0; i < w.benches.length; i++) {
        var bx = w.benches[i];
        rect(ctx, bx, w.ground, 13, 1, css(bench));
        rect(ctx, bx, w.ground + 1, 13, 1, css(mul(bench, 0.8)));
        rect(ctx, bx, w.ground + 4, 13, 1, css(mix(bench, [255, 255, 255], 0.15)));
        rect(ctx, bx + 1, w.ground + 2, 1, 5, metal);
        rect(ctx, bx + 11, w.ground + 2, 1, 5, metal);
        if (sc > 0.2) rect(ctx, bx, w.ground - 1, 13, 1, snowC);
    }

    // Faroles.
    var pole = css(lit([52, 54, 70], P));
    for (i = 0; i < w.lamps.length; i++) {
        var lx = w.lamps[i], top = w.ground + 4 - 30;
        rect(ctx, lx, top, 1, 30, pole);
        rect(ctx, lx - 1, w.ground + 2, 3, 2, pole);
        rect(ctx, lx - 2, top, 5, 1, pole);
        if (sc > 0.3) rect(ctx, lx - 2, top - 1, 5, 1, snowC);
        if (P.night > 0.35) {
            ctx.globalAlpha = 0.22;
            disc(ctx, lx, top + 2, 7, "#ffe9b0");
            ctx.globalAlpha = 0.35;
            disc(ctx, lx, top + 2, 4, "#fff0c8");
            ctx.globalAlpha = 1;
            rect(ctx, lx - 1, top + 1, 3, 2, "#fff6d8");
        } else {
            rect(ctx, lx - 1, top + 1, 3, 2, css(lit([200, 200, 190], P)));
        }
    }
}

// ---------- capa: primer plano (árboles y seto) ----------

function drawFront(ctx, w, P) {
    ctx.clearRect(0, 0, w.W, w.H);
    var base = lit([62, 86, 84], P), dark = css(mul(base, 0.68)), mid = css(base), light = css(mix(base, [190, 220, 170], 0.25));
    // Con nieve, lo alto de cada copa se pinta blanco.
    if (P.snowCover > 0.15) light = css(mix(mix(base, [190, 220, 170], 0.25), lit([236, 240, 248], P), clamp(P.snowCover * 1.2, 0, 1)));
    var trunk = css(lit([70, 56, 52], P));
    var i, j, p;
    for (i = 0; i < w.trees.length; i++) {
        var t = w.trees[i];
        rect(ctx, t.x - 1, t.cy, 3, w.H - t.cy, trunk);
        for (j = 0; j < t.puffs.length; j++) { p = t.puffs[j]; disc(ctx, t.x + p.dx, t.cy + p.dy + 2, p.r, dark); }
        for (j = 0; j < t.puffs.length; j++) { p = t.puffs[j]; disc(ctx, t.x + p.dx, t.cy + p.dy, p.r - 1, mid); }
        for (j = 0; j < t.puffs.length; j++) {
            p = t.puffs[j];
            disc(ctx, t.x + p.dx - 2, t.cy + p.dy - 3, Math.max(2, p.r * 0.45), light);
            for (var k = 0; k < p.dots.length; k++)
                rect(ctx, t.x + p.dx + p.dots[k].x, t.cy + p.dy + p.dots[k].y, 1, 1, p.dots[k].light ? light : dark);
        }
    }
    for (i = 0; i < w.hedge.length; i++) disc(ctx, w.hedge[i].x, w.H + 2, w.hedge[i].r, dark);
    for (i = 0; i < w.hedge.length; i++) disc(ctx, w.hedge[i].x - 1, w.H + 3, w.hedge[i].r - 2, mid);
}

// ---------- vida: simulación ----------

var SKINS = ["#f1c7a5", "#e0ac84", "#c68a62", "#9a6646", "#6e4630"];
var HAIRS = ["#2b1d16", "#4a3020", "#8a5a2c", "#d8b060", "#1a1a22", "#b0b0b8", "#7a2c2c", "#3a2a3a"];
var TOPS = ["#d95763", "#5b8dd9", "#f2c14e", "#6abe8a", "#e8e8f0", "#a06cc8", "#3b3b52", "#e88a4a", "#4fb3bf", "#c0c4d0"];
var BOTTOMS = ["#2d3047", "#3d5a80", "#4a4a4a", "#6b4e3d", "#2a2a2a", "#8a8fa0", "#5a4a6a"];
var UMBRELLAS = ["#e04a5a", "#3a7ad0", "#f0c040", "#2a2a36", "#50b080", "#c060c0"];
var DOGS = ["#c89a60", "#3a3030", "#f0e8dc", "#8a6a4a"];
var CARS = ["#d04848", "#4870d0", "#e8e8e8", "#303038", "#e0b040", "#60a070", "#9090a0"];

function lanes(w) {
    var out = [];
    for (var y = w.ground + 8; y < w.H - 3; y += 6) out.push(y);
    return out;
}

function spawnPerson(w, onScreen) {
    var R = Math.random;
    var dir = R() < 0.5 ? 1 : -1;
    var L = lanes(w);
    var y = L[Math.floor(R() * L.length)];
    var x = onScreen ? R() * w.W : (dir > 0 ? -10 : w.W + 10);
    // Al amanecer salen más corredores.
    var r = R(), dawn = w.hour >= 5.3 && w.hour < 8.5 && w.rain < 0.3;
    var kind = r < (dawn ? 0.3 : 0.08) ? "jog" : (r < (dawn ? 0.42 : 0.18) ? "dog" : (r < (dawn ? 0.46 : 0.26) ? "family" : "walk"));
    var p = newPerson(w, x, y, dir, kind === "jog" ? 20 + R() * 5 : 7 + R() * 5, false);
    p.jog = kind === "jog";
    if (kind === "dog") p.dog = { col: rgb(DOGS[Math.floor(R() * DOGS.length)]) };
    w.people.push(p);
    if (kind === "family") {
        var kid = newPerson(w, x - dir * 7, y + 1, dir, p.speed, true);
        w.people.push(kid);
    }
}

function newPerson(w, x, y, dir, speed, kid) {
    var R = Math.random;
    function c(a) { return rgb(a[Math.floor(R() * a.length)]); }
    return {
        x: x, y: y, dir: dir, speed: speed, dist: R() * 12, kid: kid,
        skin: c(SKINS), hair: c(HAIRS), top: c(TOPS), bottom: c(BOTTOMS),
        style: Math.floor(R() * 3), skirt: !kid && R() < 0.2, bag: !kid && R() < 0.25,
        umbrella: w.rain > 0.3 && R() < 0.85 ? c(UMBRELLAS) : null
    };
}

function newPigeon(w, onRail, x) {
    var R = Math.random;
    var L = lanes(w);
    return {
        x: x, y: onRail ? w.yP - 1 : L[Math.floor(R() * L.length)] - 2, rail: onRail,
        dir: R() < 0.5 ? 1 : -1, state: "idle", tm: R() * 3, vx: 0, vy: 0, tx: 0, ty: 0, flap: 0
    };
}

function step(w, dt, hour, P) {
    if (dt > 0.5) dt = 0.5;
    if (dt <= 0) return;
    var R = Math.random, T = w.timers, W = w.W, i, j;

    w.hour = hour;

    // Clima: de vez en cuando llueve (o nieva, en invierno) un rato; a veces con tormenta.
    T.weather -= dt;
    if (T.weather <= 0 && !w.lock) {
        w.rainTarget = R() < w.rainChance ? 0.5 + R() * 0.5 : 0;
        if (w.rain < 0.05) {
            var m = w.month;
            w.snow = w.rainTarget > 0 && R() < (m === 11 || m <= 1 ? 0.55 : (m === 2 || m === 10 ? 0.15 : 0));
        }
        w.storm = w.rainTarget > 0.75 && !w.snow && R() < 0.6;
        T.weather = (w.rainTarget > 0 ? 300 : 900) + R() * 1200;
    }
    var dr = w.rainTarget - w.rain;
    w.rain += clamp(dr, -dt / 40, dt / 40);

    // La nieve se acumula mientras cae y se derrite despacio cuando para.
    if (w.snow && w.rain > 0.2) w.snowCover = Math.min(1, w.snowCover + dt * w.rain / 500);
    else if (!w.lock) w.snowCover = Math.max(0, w.snowCover - dt / 1500);

    // Neblina matinal: aparece algunas madrugadas y se disipa a media mañana.
    if (!w.lock) {
        if (hour >= 9.3 || hour < 3.5) w.fogTarget = 0;
        T.fog -= dt;
        if (T.fog <= 0) {
            T.fog = 600 + R() * 600;
            if (hour >= 3.5 && hour < 8 && w.fogTarget === 0 && R() < 0.4) w.fogTarget = 0.55 + R() * 0.45;
        }
    }
    // Cambia despacio: la ciudad y el cielo solo se repintan cada 30 s.
    w.fog += clamp(w.fogTarget - w.fog, -dt / 300, dt / 300);

    // Arcoíris: cuando la lluvia amaina con el sol todavía alto.
    if (!w.lock) {
        if (w.rain > 0.4 && !w.snow) w.wet = 1;
        else w.wet = Math.max(0, w.wet - dt / 420);
        var bow = w.wet > 0.1 && w.rainTarget === 0 && w.rain < 0.35 && hour >= 7 && hour < 17.5 ? 1 : 0;
        w.rainbow += clamp(bow - w.rainbow, -dt / 120, dt / 120);
    }

    // Tormenta eléctrica: relámpagos detrás de los edificios y un destello en toda la escena.
    w.flash = Math.max(0, w.flash - dt * 3.5);
    if (w.bolt) { w.bolt.life -= dt; if (w.bolt.life <= 0) w.bolt = null; }
    if (w.storm && w.rain > 0.6) {
        T.bolt -= dt;
        if (T.bolt <= 0) {
            T.bolt = 5 + R() * 16;
            w.flash = 0.7 + R() * 0.3;
            if (R() < 0.75) w.bolt = makeBolt(w, R);
        }
    }

    // Fuegos artificiales: algunas noches despejadas, más probables en fin de semana y Año Nuevo.
    T.show -= dt;
    if (T.show <= 0 && !w.lock) {
        T.show = 600 + R() * 900;
        var dt0 = new Date(), dow = dt0.getDay();
        var nye = (dt0.getMonth() === 11 && dt0.getDate() === 31 && hour >= 23.5) || (dt0.getMonth() === 0 && dt0.getDate() === 1 && hour < 1);
        var late = hour >= 20.5 || hour < 0.5;
        var chance = nye ? 1 : (dow === 5 || dow === 6 ? 0.3 : 0.08);
        if (late && P.night > 0.85 && w.rainTarget === 0 && w.rain < 0.1 && R() < chance) w.show = nye ? 1800 : 80 + R() * 100;
    }
    if (w.show > 0) {
        if (!w.lock) w.show -= dt;
        T.rocket -= dt;
        if (T.rocket <= 0) {
            T.rocket = 0.5 + R() * 1.8;
            var rx = W * (0.1 + R() * 0.8);
            w.rockets.push({ x: rx, y: w.base, vx: (R() - 0.5) * 6, vy: -(85 + R() * 30), ty: 14 + R() * w.base * 0.3,
                col: rgb(FIREWORKS[Math.floor(R() * FIREWORKS.length)]), col2: rgb(FIREWORKS[Math.floor(R() * FIREWORKS.length)]),
                kind: Math.floor(R() * 3) });
        }
    }
    for (i = w.rockets.length - 1; i >= 0; i--) {
        var rk = w.rockets[i];
        rk.x += rk.vx * dt;
        rk.y += rk.vy * dt;
        if (rk.y <= rk.ty) {
            // Estalla: anillo, palmera (caen más) o crisantemo de dos colores.
            var n = rk.kind === 1 ? 30 : 44;
            for (j = 0; j < n; j++) {
                var ang = j / n * Math.PI * 2 + R() * 0.15, sp = (rk.kind === 0 ? 30 : 10 + R() * 28);
                var life = rk.kind === 1 ? 2 + R() * 0.8 : 1.2 + R() * 0.6;
                w.sparks.push({ x: rk.x, y: rk.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.85, life: life, max: life,
                    col: rk.kind === 2 && j % 2 ? rk.col2 : rk.col, heavy: rk.kind === 1 });
            }
            w.rockets.splice(i, 1);
        }
    }
    for (i = w.sparks.length - 1; i >= 0; i--) {
        var spk = w.sparks[i], drag = Math.pow(0.25, dt);
        spk.vx *= drag; spk.vy *= drag;
        spk.vy += (spk.heavy ? 22 : 12) * dt;
        spk.x += spk.vx * dt;
        spk.y += spk.vy * dt;
        spk.life -= dt;
        if (spk.life <= 0) w.sparks.splice(i, 1);
    }

    var bz = busy(hour);

    // Personas.
    T.person -= dt;
    if (T.person <= 0) {
        // Más ancho (más líneas de definición) = más gente para que el paseo no se vea vacío.
        if (w.people.length < Math.round(16 * Math.max(1, W / 480))) spawnPerson(w, false);
        T.person = (2.5 + R() * 4) / Math.max(bz, 0.05);
    }
    for (i = w.people.length - 1; i >= 0; i--) {
        var p = w.people[i];
        p.x += p.dir * p.speed * dt;
        p.dist += p.speed * dt;
        if (p.x < -20 || p.x > W + 20) w.people.splice(i, 1);
    }

    // Palomas: se espantan cuando alguien pasa cerca.
    var awake = P.night < 0.6;
    for (i = w.pigeons.length - 1; i >= 0; i--) {
        var g = w.pigeons[i];
        if (g.state === "idle" || g.state === "peck") {
            g.tm -= dt;
            if (g.tm <= 0) {
                var r = R();
                if (!awake) { g.state = "idle"; }
                else if (r < 0.35) g.dir = -g.dir;
                else if (r < 0.7 && !g.rail) g.state = g.state === "peck" ? "idle" : "peck";
                else if (!g.rail) g.x += g.dir * 2;
                g.tm = 0.6 + R() * 2.5;
            }
            for (j = 0; j < w.people.length; j++) {
                var q = w.people[j];
                var near = Math.abs(q.x - g.x) < (q.jog ? 14 : 9);
                if (near && (g.rail ? R() < 0.02 : Math.abs(q.y - g.y) < 7)) {
                    g.state = "fly";
                    g.vx = (q.x < g.x ? 1 : -1) * (22 + R() * 14);
                    g.vy = -(18 + R() * 14);
                    g.dir = g.vx > 0 ? 1 : -1;
                    break;
                }
            }
        } else if (g.state === "fly") {
            g.x += g.vx * dt;
            g.y += g.vy * dt;
            g.vy -= 10 * dt;
            g.flap += dt * 14;
            if (g.y < -6 || g.x < -10 || g.x > W + 10) w.pigeons.splice(i, 1);
        } else if (g.state === "land") {
            var dx = g.tx - g.x, dy = g.ty - g.y, d = Math.sqrt(dx * dx + dy * dy);
            g.flap += dt * 12;
            if (d < 1.5) { g.x = g.tx; g.y = g.ty; g.state = "idle"; g.tm = 1 + R() * 2; }
            else { g.x += dx / d * 30 * dt; g.y += dy / d * 30 * dt; g.dir = dx > 0 ? 1 : -1; }
        }
    }
    T.pigeon -= dt;
    if (T.pigeon <= 0) {
        T.pigeon = 8 + R() * 20;
        if (awake && w.pigeons.length < 7 && P.rain < 0.5) {
            var onRail = R() < 0.55;
            var ng = newPigeon(w, onRail, 0);
            ng.tx = 20 + R() * (W - 40);
            ng.ty = ng.y;
            ng.x = ng.tx + (R() < 0.5 ? -1 : 1) * (60 + R() * 60);
            ng.y = -5;
            ng.state = "land";
            w.pigeons.push(ng);
        }
    }

    // Bandadas lejanas.
    T.flock -= dt;
    if (T.flock <= 0) {
        T.flock = 20 + R() * 45;
        if (P.amb > 0.45 && P.rain < 0.5) {
            var fd = R() < 0.5 ? 1 : -1, n = 3 + Math.floor(R() * 5);
            var f = { x: fd > 0 ? -20 : W + 20, y: 15 + R() * (w.base * 0.5), dir: fd, speed: 14 + R() * 8, birds: [] };
            for (j = 0; j < n; j++) f.birds.push({ dx: -fd * (j * 5 + R() * 3), dy: Math.abs(j - n / 2) * 2.5 + R() * 2, ph: R() * 6 });
            w.flocks.push(f);
        }
    }
    for (i = w.flocks.length - 1; i >= 0; i--) {
        var fl = w.flocks[i];
        fl.x += fl.dir * fl.speed * dt;
        if (fl.x < -60 || fl.x > W + 60) w.flocks.splice(i, 1);
    }

    // Gaviotas sobre el agua.
    T.gull -= dt;
    if (T.gull <= 0) {
        T.gull = 30 + R() * 60;
        if (P.amb > 0.4) {
            var gd = R() < 0.5 ? 1 : -1;
            w.gulls.push({ x: gd > 0 ? -10 : W + 10, y: w.yW - 30 + R() * 50, dir: gd, speed: 16 + R() * 10, ph: R() * 6 });
        }
    }
    for (i = w.gulls.length - 1; i >= 0; i--) {
        var gu = w.gulls[i];
        gu.x += gu.dir * gu.speed * dt;
        gu.ph += dt;
        if (gu.x < -20 || gu.x > W + 20) w.gulls.splice(i, 1);
    }

    // Autos en la calle de enfrente.
    T.car -= dt;
    if (T.car <= 0) {
        T.car = (1.5 + R() * 4) / Math.max(bz, 0.1);
        var cd = R() < 0.5 ? 1 : -1;
        var bus = R() < 0.12, taxi = !bus && R() < 0.15;
        w.cars.push({ x: cd > 0 ? -12 : W + 12, y: cd > 0 ? w.base + 2 : w.base + 4, dir: cd, speed: bus ? 14 + R() * 6 : 18 + R() * 14, bus: bus, taxi: taxi,
            col: taxi ? [230, 190, 50] : rgb(bus ? pick(Math.random, ["#d04848", "#3a8ad0", "#e8e8e8"]) : CARS[Math.floor(R() * CARS.length)]) });
    }
    for (i = w.cars.length - 1; i >= 0; i--) {
        var car = w.cars[i];
        car.x += car.dir * car.speed * dt;
        if (car.x < -20 || car.x > W + 20) w.cars.splice(i, 1);
    }

    // Barcos.
    T.boat -= dt;
    if (T.boat <= 0) {
        T.boat = 18 + R() * 35;
        if (w.boats.length < 2) {
            var bd = R() < 0.5 ? 1 : -1, br = R();
            var lane = w.boats.length && w.boats[0].far ? false : R() < 0.5;
            w.boats.push({
                x: bd > 0 ? -40 : W + 40, far: lane, y: lane ? w.yW + 10 : w.yW + 26 + Math.floor(R() * 6),
                dir: bd, speed: br < 0.4 ? 6 + R() * 3 : (br < 0.7 ? 4 + R() * 2 : 14 + R() * 6),
                kind: br < 0.4 ? "ferry" : (br < 0.7 ? "sail" : "motor")
            });
        }
    }
    for (i = w.boats.length - 1; i >= 0; i--) {
        var bo = w.boats[i];
        bo.x += bo.dir * bo.speed * dt;
        if (bo.x < -45 || bo.x > W + 45) w.boats.splice(i, 1);
    }

    // Aviones.
    T.plane -= dt;
    if (T.plane <= 0) {
        T.plane = 60 + R() * 120;
        var pd = R() < 0.5 ? 1 : -1;
        w.planes.push({ x: pd > 0 ? -6 : W + 6, y: 6 + R() * 30, dir: pd, speed: 9 + R() * 5 });
    }
    for (i = w.planes.length - 1; i >= 0; i--) {
        var pl = w.planes[i];
        pl.x += pl.dir * pl.speed * dt;
        if (pl.x < -10 || pl.x > W + 10) w.planes.splice(i, 1);
    }

    // Dirigible con reloj: cruza despacio y vuelve a salir al rato.
    if (w.blimp) {
        w.blimp.x += w.blimp.dir * w.blimp.speed * dt;
        if (w.blimp.x < -24 || w.blimp.x > W + 24) { w.blimp = null; T.blimp = 8 + R() * 12; }
    } else {
        T.blimp -= dt;
        if (T.blimp <= 0) {
            var zd = R() < 0.5 ? 1 : -1;
            w.blimp = { x: zd > 0 ? -22 : W + 22, y: 16 + R() * 20, dir: zd, speed: 4.5 + R() * 1.5 };
        }
    }

    // Estrellas fugaces.
    T.meteor -= dt;
    if (T.meteor <= 0) {
        T.meteor = 200 + R() * 300;
        if (P.night > 0.8 && P.rain < 0.1) w.meteors.push({ x: R() * W, y: 5 + R() * 40, vx: (R() < 0.5 ? -1 : 1) * 70, vy: 30, life: 0.8 });
    }
    for (i = w.meteors.length - 1; i >= 0; i--) {
        var m = w.meteors[i];
        m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt;
        if (m.life <= 0) w.meteors.splice(i, 1);
    }

    // Lluvia o nieve: los copos caen despacio y se mecen de lado.
    var want = Math.round((w.snow ? 220 : 170) * w.rain * Math.max(1, W * w.H / (480 * 270)));
    while (w.drops.length < want) w.drops.push({ x: R() * (W + 40), y: R() * w.H - w.H, v: 0, snow: w.snow, ph: R() * 6, big: R() < 0.3 });
    if (w.drops.length > want) w.drops.length = want;
    for (i = 0; i < w.drops.length; i++) {
        var dp = w.drops[i];
        if (!dp.v) dp.v = dp.snow ? 12 + R() * 12 : 110 + R() * 60;
        dp.y += dp.v * dt;
        if (dp.snow) { dp.ph += dt; dp.x += (Math.sin(dp.ph * 1.7) * 7 - 3) * dt; }
        else dp.x -= dp.v * 0.15 * dt;
        var floor = dp.floor || (dp.floor = R() < 0.5 ? w.yW + R() * (w.yP - w.yW) : w.ground + R() * (w.H - w.ground));
        if (dp.y > floor) {
            if (!dp.snow && w.splashes.length < 60) w.splashes.push({ x: dp.x, y: floor, life: 0.25 });
            dp.y = -5 - R() * 30;
            dp.x = R() * (W + 40);
            dp.floor = 0;
            dp.snow = w.snow;
            dp.v = 0;
        }
    }
    for (i = w.splashes.length - 1; i >= 0; i--) {
        w.splashes[i].life -= dt;
        if (w.splashes[i].life <= 0) w.splashes.splice(i, 1);
    }
}

var FIREWORKS = ["#ff5f6d", "#ffd35f", "#5ff2ff", "#9dff6a", "#c08cff", "#ffffff", "#ff9a3c", "#ff7ad9"];

// Relámpago en zigzag desde las nubes, con alguna rama.
function makeBolt(w, R) {
    var x = Math.round(w.W * (0.1 + R() * 0.8)), pts = [], branch = [];
    for (var y = 6; y < w.base; y++) {
        if (R() < 0.45) x += R() < 0.5 ? -1 : 1;
        if (R() < 0.06) x += R() < 0.5 ? -2 : 2;
        pts.push([x, y]);
        if (!branch.length && y > 30 && R() < 0.04) {
            var bx = x, dir = R() < 0.5 ? -1 : 1;
            for (var by = y; by < y + 18 + R() * 20; by++) {
                if (R() < 0.6) bx += dir;
                branch.push([bx, by]);
            }
        }
    }
    return { pts: pts, branch: branch, life: 0.45 };
}

// Fija un escenario de clima (para los arneses de prueba y capturas). kind: "clear", "rain",
// "storm", "snow", "fog", "rainbow", "fireworks". Después de llamarla el clima ya no cambia solo.
function setWeather(w, kind) {
    w.lock = true;
    w.timers.weather = 1e9;
    w.rain = w.rainTarget = 0;
    w.snow = w.storm = false;
    w.fog = w.fogTarget = 0;
    w.rainbow = w.wet = 0;
    w.snowCover = 0;
    w.show = 0;
    if (kind === "rain") w.rain = w.rainTarget = 0.8;
    else if (kind === "storm") { w.rain = w.rainTarget = 1; w.storm = true; w.timers.bolt = 0.5; }
    else if (kind === "snow") { w.rain = w.rainTarget = 0.75; w.snow = true; w.snowCover = 1; }
    else if (kind === "fog") w.fog = w.fogTarget = 0.9;
    else if (kind === "rainbow") { w.rain = 0.15; w.wet = 1; w.rainbow = 1; }
    else if (kind === "fireworks") { w.show = 1e9; w.timers.rocket = 0; }
}

// Simula un rato para que la escena no arranque vacía.
function warmup(w, hour, P) {
    for (var i = 0; i < 6; i++) spawnPerson(w, true);
    for (i = 0; i < 120; i++) step(w, 0.5, hour, P);
}

// ---------- vida: dibujo (cada fotograma) ----------

// Dibuja un rectángulo de un sprite de 5 columnas, espejado si mira a la izquierda.
function spr(ctx, x0, y0, dir, c, r, cw, ch, col) {
    var sx = dir > 0 ? x0 + c : x0 + (4 - (c + cw - 1));
    ctx.fillStyle = col;
    ctx.fillRect(sx, y0 + r, cw, ch);
}

function drawPerson(ctx, p, P) {
    var X = Math.round(p.x) - 2, d = p.dir;
    var hgt = p.kid ? 9 : 13, Y = Math.round(p.y) - hgt + 1;
    var f = Math.floor(p.dist / (p.jog ? 4 : 3)) % 4;
    // Los colores solo cambian cuando cambia la paleta (cada ~30 s).
    if (p.cP !== P) {
        p.cP = P;
        p.cc = [css(lit(p.skin, P)), css(lit(p.hair, P)), css(lit(p.top, P)), css(lit(p.bottom, P)), css(lit([40, 36, 44], P))];
    }
    var skin = p.cc[0], hair = p.cc[1], top = p.cc[2], bot = p.cc[3], shoe = p.cc[4];

    if (p.kid) {
        spr(ctx, X, Y, d, 1, 0, 3, 1, hair);
        spr(ctx, X, Y, d, 1, 1, 1, 1, hair);
        spr(ctx, X, Y, d, 2, 1, 2, 1, skin);
        spr(ctx, X, Y, d, 1, 2, 3, 3, top);
        if (f === 0) spr(ctx, X, Y, d, 4, 3, 1, 2, top);
        if (f === 2) spr(ctx, X, Y, d, 0, 3, 1, 2, top);
        spr(ctx, X, Y, d, 1, 5, 3, 1, bot);
        if (f % 2 === 0) { spr(ctx, X, Y, d, 1, 6, 1, 2, bot); spr(ctx, X, Y, d, 3, 6, 1, 2, bot); spr(ctx, X, Y, d, 1, 8, 1, 1, shoe); spr(ctx, X, Y, d, 3, 8, 1, 1, shoe); }
        else { spr(ctx, X, Y, d, 2, 6, 1, 2, bot); spr(ctx, X, Y, d, 2, 8, 2, 1, shoe); }
        return;
    }

    // Cabeza.
    if (p.style === 2) {
        spr(ctx, X, Y, d, 1, 0, 3, 1, top);
        spr(ctx, X, Y, d, 4, 0, 1, 1, top);
    } else {
        spr(ctx, X, Y, d, 1, 0, 3, 1, hair);
    }
    spr(ctx, X, Y, d, 1, 1, 1, 2, hair);
    spr(ctx, X, Y, d, 2, 1, 2, 2, skin);
    // Torso y brazos.
    spr(ctx, X, Y, d, 1, 3, 3, 5, top);
    if (p.style === 1) spr(ctx, X, Y, d, 1, 3, 1, 2, hair);
    var swing = p.umbrella ? 1 : [1, 0, -1, 0][f];
    if (swing === 1) { spr(ctx, X, Y, d, 4, 4, 1, 2, top); spr(ctx, X, Y, d, 4, 6, 1, 1, skin); }
    else if (swing === -1) { spr(ctx, X, Y, d, 0, 4, 1, 2, top); spr(ctx, X, Y, d, 0, 6, 1, 1, skin); }
    else spr(ctx, X, Y, d, 3, 7, 1, 1, skin);
    if (p.bag) spr(ctx, X, Y, d, 0, 6, 1, 2, css(lit([120, 80, 60], P)));
    // Piernas.
    var leg = p.skirt ? skin : bot;
    if (p.skirt) spr(ctx, X, Y, d, 0, 8, 5, 2, bot);
    else spr(ctx, X, Y, d, 1, 8, 3, 1, bot);
    if (f === 0) {
        spr(ctx, X, Y, d, 1, 9, 1, 1, leg); spr(ctx, X, Y, d, 3, 9, 1, 1, leg);
        spr(ctx, X, Y, d, 0, 10, 1, 2, leg); spr(ctx, X, Y, d, 4, 10, 1, 2, leg);
        spr(ctx, X, Y, d, 0, 12, 1, 1, shoe); spr(ctx, X, Y, d, 4, 12, 1, 1, shoe);
    } else if (f === 2) {
        spr(ctx, X, Y, d, 1, 9, 1, 2, leg); spr(ctx, X, Y, d, 3, 9, 1, 1, leg);
        spr(ctx, X, Y, d, 4, 10, 1, 2, leg); spr(ctx, X, Y, d, 0, 11, 1, 1, leg);
        spr(ctx, X, Y, d, 0, 12, 1, 1, shoe); spr(ctx, X, Y, d, 4, 12, 1, 1, shoe);
    } else {
        spr(ctx, X, Y, d, 2, 9, 2, 3, leg);
        spr(ctx, X, Y, d, 2, 12, 2, 1, shoe);
    }
    if (p.umbrella) {
        var uc = lit(p.umbrella, P);
        spr(ctx, X, Y, d, 2, -2, 1, 2, css(lit([50, 50, 60], P)));
        spr(ctx, X, Y, d, 0, -4, 5, 1, css(uc));
        spr(ctx, X, Y, d, 1, -5, 3, 1, css(mix(uc, [255, 255, 255], 0.2)));
        var ux = d > 0 ? X - 1 : X - 1;
        rect(ctx, ux, Y - 3, 7, 1, css(mul(uc, 0.8)));
    }
    if (p.dog) {
        var dc = css(lit(p.dog.col, P)), dx = X - d * 8, dy = Math.round(p.y) - 3;
        var df = Math.floor(p.dist / 2) % 2;
        spr(ctx, dx, dy, d, 0, 1, 4, 1, dc);
        spr(ctx, dx, dy, d, 3, 0, 2, 1, dc);
        spr(ctx, dx, dy, d, 0, 0, 1, 1, dc);
        spr(ctx, dx, dy, d, df ? 0 : 1, 2, 1, 1, dc);
        spr(ctx, dx, dy, d, df ? 3 : 2, 2, 1, 1, dc);
        ctx.globalAlpha = 0.6;
        rect(ctx, d > 0 ? dx + 5 : dx - 3, dy - 1, 3, 1, css(lit([60, 60, 70], P)));
        ctx.globalAlpha = 1;
    }
}

function drawPigeon(ctx, g, P, t) {
    var X = Math.round(g.x) - 2, Y = Math.round(g.y) - 2, d = g.dir;
    var body = css(lit([138, 138, 156], P)), head = css(lit([100, 106, 132], P)), wing = css(lit([112, 112, 130], P));
    if (g.state === "fly" || g.state === "land") {
        var up = Math.floor(g.flap) % 2 === 0;
        spr(ctx, X, Y, d, 1, 1, 3, 1, body);
        spr(ctx, X, Y, d, 4, 1, 1, 1, head);
        if (up) { spr(ctx, X, Y, d, 0, 0, 1, 1, wing); spr(ctx, X, Y, d, 3, 0, 1, 1, wing); }
        else { spr(ctx, X, Y, d, 0, 2, 1, 1, wing); spr(ctx, X, Y, d, 3, 2, 1, 1, wing); }
        return;
    }
    var peck = g.state === "peck" && Math.floor(t * 3 + g.x) % 2 === 0;
    spr(ctx, X, Y, d, 0, 1, 1, 1, wing);
    spr(ctx, X, Y, d, 1, 1, 3, 1, body);
    if (peck) spr(ctx, X, Y, d, 4, 2, 1, 1, head);
    else spr(ctx, X, Y, d, 3, 0, 1, 1, head);
    spr(ctx, X, Y, d, 2, 2, 1, 1, css(lit([200, 100, 100], P)));
}

// Capa ambiental: cambia unas 4 veces por segundo (luces, pantallas, gato, dirigible, agua),
// así que se repinta aparte y a menor ritmo que la gente y las aves.
function drawAmbient(ctx, w, P, t) {
    var W = w.W, i, j;
    ctx.clearRect(0, 0, W, w.H);
    var tick = Math.floor(t * 4);

    for (i = 0; i < w.catAds.length; i++) drawCatAd(ctx, w.catAds[i], P, t);

    // Luces de antenas.
    var day = P.night < 0.3;
    for (i = 0; i < w.antennas.length; i++) {
        var a = w.antennas[i];
        if (((t + a.ph) % 2) < 0.7) {
            if (!day) {
                ctx.globalAlpha = 0.3;
                rect(ctx, a.x - 1, a.y - 1, 3, 3, "#ff4848");
                ctx.globalAlpha = 1;
            }
            rect(ctx, a.x, a.y, 1, 1, day ? "#d05050" : "#ff5050");
        }
    }

    // Televisores encendidos y letreros que parpadean.
    if (P.night > 0.5) {
        for (i = 0; i < w.tvs.length; i++) {
            var tv = w.tvs[i];
            if (hash2(tv.id, Math.floor(t / 300)) > 0.5) continue;
            var k = hash2(tv.id, Math.floor(t * 2));
            rect(ctx, tv.x, tv.y, tv.w, tv.h, k < 0.33 ? "#7fa8ff" : (k < 0.66 ? "#a8c8ff" : "#6a80e0"));
        }
        for (i = 0; i < w.signs.length; i++) {
            var s = w.signs[i];
            if (hash2(s.id, Math.floor(t * 8)) < 0.025) {
                ctx.globalAlpha = 0.75;
                rect(ctx, s.x, s.y, s.w, s.h, "#1a1a2a");
                ctx.globalAlpha = 1;
            }
        }
    }

    // Contornos LED que cambian de color y pantallas animadas.
    if (P.night > 0.3) {
        for (i = 0; i < w.leds.length; i++) {
            var lb = w.leds[i], lc = css(hue(lb.led.col, t * 0.03 + lb.led.ph));
            ctx.fillStyle = lc;
            for (j = 1; j < lb.tiers.length; j++) {
                var LT = lb.tiers[j];
                ctx.fillRect(LT.x, LT.top, LT.w, 1);
                ctx.fillRect(LT.x, LT.top, 1, lb.tiers[j - 1].top - LT.top);
                ctx.fillRect(LT.x + LT.w - 1, LT.top, 1, lb.tiers[j - 1].top - LT.top);
            }
            var L0 = lb.tiers[0];
            ctx.fillRect(L0.x, L0.top, L0.w, 1);
            // Pulso que sube por las esquinas.
            var py = Math.round(w.base - ((t * 12 + lb.led.ph * 30) % (w.base - L0.top)));
            ctx.fillRect(L0.x, py, 1, 3);
            ctx.fillRect(L0.x + L0.w - 1, py, 1, 3);
        }
    }
    for (i = 0; i < w.screens.length; i++) {
        var sc = w.screens[i];
        var dim = P.night <= 0.3, mode = Math.floor(t / 6 + sc.id) % 3;
        rect(ctx, sc.x - 1, sc.y - 1, sc.w + 2, sc.h + 2, "#2a2c3a");
        for (var sy = 0; sy < sc.h; sy++)
            for (var sx = 0; sx < sc.w; sx += 2) {
                var v = mode === 0 ? (sx + sy + Math.floor(t * 6)) % 8 / 8
                    : mode === 1 ? hash2(sc.id + sx * 31 + sy, Math.floor(t * 3))
                        : (Math.sin(sx * 0.5 + t * 2) + Math.sin(sy * 0.7 - t * 3) + 2) / 4;
                var scol = hue([255, 80, 160], v * 0.6 + t * 0.02);
                rect(ctx, sc.x + sx, sc.y + sy, 2, 1, css(dim ? mix(scol, [150, 160, 180], 0.45) : scol));
            }
    }

    // El dirigible va delante de los edificios, sus luces LED y antenas.
    if (w.blimp) drawBlimp(ctx, w.blimp, P, t);

    // Jirones de neblina que se arrastran despacio entre los edificios y sobre el agua.
    if (P.fog > 0.05) {
        ctx.fillStyle = css(mix(P.fogc, [255, 255, 255], 0.12));
        for (i = 0; i < 12; i++) {
            var fl = 40 + Math.round(hash2(i, 21) * 90), fy = Math.round(w.base - 40 + hash2(i, 22) * 70);
            var fx = (hash2(i, 23) * (W + fl) + t * (1.5 + hash2(i, 24) * 2.5)) % (W + fl) - fl;
            for (j = 0; j < 3; j++) {
                ctx.globalAlpha = P.fog * (j === 1 ? 0.16 : 0.08);
                ctx.fillRect(Math.round(fx) + (j === 1 ? 0 : 8), fy + j, fl - (j === 1 ? 0 : 16), 1);
            }
        }
        ctx.globalAlpha = 1;
    }

    // Ondas que se desplazan sobre el agua.
    var wTop = w.yW, wBot = w.yP + 6, wh = wBot - wTop;
    ctx.fillStyle = css(mix(P.water, [255, 255, 255], 0.35));
    for (i = 0; i < 46; i++) {
        var ry0 = wTop + 2 + (i * 7) % (wh - 3);
        var spd = 2 + hash2(i, 3) * 4;
        var rx0 = (hash2(i, 1) * w.W + t * spd * (i % 2 ? 1 : -1)) % w.W;
        if (rx0 < 0) rx0 += w.W;
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 1.5 + i);
        ctx.fillRect(Math.round(rx0), ry0, 3 + Math.round(hash2(i, 2) * 6), 1);
    }
    ctx.globalAlpha = 1;

    // Brillo del agua: reflejos de ventanas, sol y luna.
    for (i = 0; i < w.refl.length; i++) {
        var r = w.refl[i];
        if (hash2(i, tick) > 0.18) continue;
        ctx.globalAlpha = 0.4;
        rect(ctx, r.x + Math.floor(hash2(i + 999, tick) * 3) - 1, r.y, r.w + 1, 1, r.col);
    }
    ctx.globalAlpha = 1;
    var sun = sunPos(w, P.hour), moon = moonPos(w, P.hour);
    var src = sun || moon;
    if (src && P.rain < 0.6) {
        var gc = sun ? css(mix([255, 246, 214], [255, 170, 110], sun.low)) : "#f4f1dc";
        for (var y = wTop + 1; y < wBot; y += 2) {
            var fade = 1 - (y - wTop) / (wBot - wTop + 10);
            var ww = Math.round((sun ? 2 : 1) + hash2(y, tick) * (sun ? 7 : 4) * fade);
            ctx.globalAlpha = (sun ? 0.6 : 0.45) * fade * (1 - P.rain);
            rect(ctx, src.x - Math.floor(ww / 2) + Math.round(hash2(y + 77, tick) * 4 - 2), y, ww, 1, gc);
        }
        ctx.globalAlpha = 1;
    }
}

function drawLife(ctx, w, P, t) {
    var W = w.W, i, j;
    ctx.clearRect(0, 0, W, w.H);
    var dark = css(mix(P.cs, [20, 20, 40], 0.6));

    // Estrellas fugaces.
    for (i = 0; i < w.meteors.length; i++) {
        var m = w.meteors[i], sx = m.vx > 0 ? -1 : 1;
        for (j = 0; j < 6; j++) {
            ctx.globalAlpha = (1 - j / 6) * clamp(m.life * 2, 0, 1);
            rect(ctx, m.x + sx * j * 2, m.y - j, 2, 1, "#fff8e0");
        }
    }
    ctx.globalAlpha = 1;

    // Fuegos artificiales y relámpagos: solo donde se ve cielo (detrás de los edificios).
    for (i = 0; i < w.rockets.length; i++) {
        var rk = w.rockets[i];
        for (j = 0; j < 4; j++) {
            ctx.globalAlpha = 1 - j / 4;
            skyDot(ctx, w, rk.x - rk.vx * j * 0.03, rk.y + j * 2, j ? "#ffd9a0" : "#fff6e0");
        }
    }
    for (i = 0; i < w.sparks.length; i++) {
        var spk = w.sparks[i], fade = spk.life / spk.max;
        if (fade < 0.3 && hash2(i, Math.floor(t * 12)) < 0.4) continue;   // chispean al apagarse
        ctx.globalAlpha = clamp(fade * 1.4, 0, 1);
        skyDot(ctx, w, spk.x, spk.y, css(fade > 0.85 ? mix(spk.col, [255, 255, 255], 0.6) : spk.col));
        ctx.globalAlpha *= 0.35;
        skyDot(ctx, w, spk.x - spk.vx * 0.06, spk.y - spk.vy * 0.06, css(spk.col));
    }
    ctx.globalAlpha = 1;
    if (w.bolt && Math.floor(w.bolt.life * 20) % 3 !== 1) {
        var bpts = w.bolt.pts.concat(w.bolt.branch);
        ctx.globalAlpha = 0.3;
        for (i = 0; i < bpts.length; i++) skyDot(ctx, w, bpts[i][0] - 1, bpts[i][1], "#b8c8ff", 3);
        ctx.globalAlpha = 1;
        for (i = 0; i < bpts.length; i++) skyDot(ctx, w, bpts[i][0], bpts[i][1], "#f4f6ff");
    }

    // Aviones.
    for (i = 0; i < w.planes.length; i++) {
        var pl = w.planes[i];
        if (P.night > 0.4) {
            if (Math.floor(t * 1.5) % 2 === 0) rect(ctx, pl.x, pl.y, 1, 1, "#ff6060");
            if (Math.floor(t * 1.5 + 0.5) % 3 === 0) rect(ctx, pl.x + 2, pl.y, 1, 1, "#ffffff");
        } else {
            rect(ctx, pl.x - 2, pl.y, 5, 1, css(mix(P.cl, [90, 90, 110], 0.5)));
            rect(ctx, pl.x, pl.y - 1, 1, 1, css(mix(P.cl, [90, 90, 110], 0.5)));
        }
    }

    // Bandadas.
    for (i = 0; i < w.flocks.length; i++) {
        var fl = w.flocks[i];
        for (j = 0; j < fl.birds.length; j++) {
            var bd = fl.birds[j], bx = Math.round(fl.x + bd.dx), by = Math.round(fl.y + bd.dy + Math.sin(t * 2 + bd.ph) * 1.5);
            var up = Math.floor(t * 5 + bd.ph) % 2 === 0;
            ctx.fillStyle = dark;
            if (up) { ctx.fillRect(bx, by, 1, 1); ctx.fillRect(bx + 1, by + 1, 1, 1); ctx.fillRect(bx + 2, by, 1, 1); }
            else { ctx.fillRect(bx, by + 1, 1, 1); ctx.fillRect(bx + 1, by, 1, 1); ctx.fillRect(bx + 2, by + 1, 1, 1); }
        }
    }

    // Barcos.
    for (i = 0; i < w.boats.length; i++) drawBoat(ctx, w.boats[i], P, t);

    // Autos.
    for (i = 0; i < w.cars.length; i++) drawCar(ctx, w.cars[i], P);

    // Gaviotas.
    var gw = css(lit([244, 244, 248], P)), gg = css(lit([150, 150, 170], P));
    for (i = 0; i < w.gulls.length; i++) {
        var gu = w.gulls[i], gx = Math.round(gu.x) - 3, gy = Math.round(gu.y + Math.sin(gu.ph * 1.3) * 3);
        var flapping = Math.sin(gu.ph * 0.7) > 0.3;
        var gup = flapping && Math.floor(gu.ph * 6) % 2 === 0;
        if (!flapping) {
            rect(ctx, gx, gy + 1, 7, 1, gw);
            rect(ctx, gx, gy + 1, 1, 1, gg);
            rect(ctx, gx + 6, gy + 1, 1, 1, gg);
            rect(ctx, gx + 3, gy, 1, 1, gw);
        } else if (gup) {
            rect(ctx, gx, gy, 2, 1, gg); rect(ctx, gx + 5, gy, 2, 1, gg);
            rect(ctx, gx + 2, gy + 1, 3, 1, gw);
        } else {
            rect(ctx, gx + 2, gy, 3, 1, gw);
            rect(ctx, gx, gy + 1, 2, 1, gg); rect(ctx, gx + 5, gy + 1, 2, 1, gg);
        }
    }

    // Palomas del barandal, luego personas y palomas del piso ordenadas por profundidad.
    var ground = [];
    for (i = 0; i < w.pigeons.length; i++) {
        var g = w.pigeons[i];
        if (g.rail && g.state !== "fly") drawPigeon(ctx, g, P, t);
        else ground.push({ y: g.state === "idle" || g.state === "peck" ? g.y + 2 : 999, g: g });
    }
    for (i = 0; i < w.people.length; i++) ground.push({ y: w.people[i].y, p: w.people[i] });
    ground.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < ground.length; i++) {
        if (ground[i].p) drawPerson(ctx, ground[i].p, P);
        else drawPigeon(ctx, ground[i].g, P, t);
    }

    // Lluvia y nieve.
    if (w.drops.length) {
        ctx.globalAlpha = 0.65;
        var rainC = css(mix(P.cl, [210, 225, 255], 0.6)), flakeC = css(mix([240, 244, 252], P.cl, 0.2));
        for (i = 0; i < w.drops.length; i++) {
            var dp = w.drops[i];
            if (dp.snow) {
                ctx.fillStyle = flakeC;
                ctx.fillRect(Math.round(dp.x), Math.round(dp.y), dp.big ? 2 : 1, dp.big ? 2 : 1);
            } else {
                ctx.fillStyle = rainC;
                ctx.fillRect(Math.round(dp.x), Math.round(dp.y), 1, 3);
            }
        }
        ctx.fillStyle = rainC;
        ctx.globalAlpha = 0.6;
        for (i = 0; i < w.splashes.length; i++) {
            var sp = w.splashes[i];
            ctx.fillRect(Math.round(sp.x) - 1, Math.round(sp.y), 1, 1);
            ctx.fillRect(Math.round(sp.x) + 1, Math.round(sp.y), 1, 1);
        }
        ctx.globalAlpha = 1;
    }

    // Destello del relámpago sobre toda la escena.
    if (w.flash > 0.02) {
        ctx.globalAlpha = w.flash * 0.28;
        rect(ctx, 0, 0, W, w.H, "#dce4ff");
        ctx.globalAlpha = 1;
    }
}

// Pixel (o cuadro de s×s) que solo se dibuja si en ese punto se ve el cielo.
function skyDot(ctx, w, x, y, col, s) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= w.W || y < 0 || y >= w.sky[x]) return;
    rect(ctx, x, y, s || 1, 1, col);
}

// Rota el tono de un color (f en vueltas completas).
function hue(c, f) {
    var a = (f % 1) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
    var m = [
        0.299 + 0.701 * cs + 0.168 * sn, 0.587 - 0.587 * cs + 0.330 * sn, 0.114 - 0.114 * cs - 0.497 * sn,
        0.299 - 0.299 * cs - 0.328 * sn, 0.587 + 0.413 * cs + 0.035 * sn, 0.114 - 0.114 * cs + 0.292 * sn,
        0.299 - 0.300 * cs + 1.250 * sn, 0.587 - 0.588 * cs - 1.050 * sn, 0.114 + 0.886 * cs - 0.203 * sn
    ];
    return [c[0] * m[0] + c[1] * m[1] + c[2] * m[2], c[0] * m[3] + c[1] * m[4] + c[2] * m[5], c[0] * m[6] + c[1] * m[7] + c[2] * m[8]];
}

// Anuncios de azotea: sprite con su paleta, fondo y franja de acento.
var ADS = [
    {
        cat: true, bg: "#ffe4ec", acc: "#ff6f91",
        pal: { o: "#6a3a1e", c: "#f29a3a", d: "#d0701c", l: "#ffe2bc", p: "#ff7f9e", e: "#2a2030", w: "#ffffff" },
        rows: [".c.......c.", ".cc.....cc.", ".ccccccccc.", ".ccecccecc.", "cccccnccccc", ".cccwwwccc.", "..ccccccc.."]
    },
    {
        bg: "#3a5a8c", acc: "#ffd35f", pal: { s: "#c8d4e8", w: "#ffffff", b: "#8a5a3a" },
        rows: ["..s..s...", ".s..s....", "wbbbbbw..", "wwwwwwwww", "wwwwwww.w", "wwwwwwwww", ".wwwww..."]
    },
    {
        bg: "#fff0f6", acc: "#c08cff", pal: { h: "#ff4f7a", l: "#ffa0b8" },
        rows: [".hh...hh.", "hlhh.hhhh", "hhhhhhhhh", ".hhhhhhh.", "..hhhhh..", "...hhh...", "....h...."]
    },
    {
        bg: "#bff4ff", acc: "#3a7ad0", pal: { f: "#ff8a5f", e: "#2a2030", d: "#e86a40" },
        rows: ["...ffff....", ".ffffffff.f", "fefffffffff", "ffddffffff.", ".ffffffff.f", "...ffff...."]
    }
];

function drawBillboard(ctx, bb, c, P) {
    var night = P.night > 0.4, ad = bb.ad;
    function col(h) { return night ? h : css(lit(rgb(h), P)); }
    var frame = css(mul(c, 0.55));
    rect(ctx, bb.lx0, bb.y + bb.h, 1, 3, frame);
    rect(ctx, bb.lx1, bb.y + bb.h, 1, 3, frame);
    if (night) {
        ctx.globalAlpha = 0.25;
        rect(ctx, bb.x - 1, bb.y - 1, bb.w + 2, bb.h + 2, ad.bg);
        ctx.globalAlpha = 1;
    }
    rect(ctx, bb.x, bb.y, bb.w, bb.h, frame);
    rect(ctx, bb.x + 1, bb.y + 1, bb.w - 2, bb.h - 2, col(ad.bg));
    rect(ctx, bb.x + 1, bb.y + bb.h - 2, bb.w - 2, 1, col(ad.acc));
    // El gato se anima en la capa de vida (drawCatAd).
    var sw = ad.rows[0].length, sx = bb.x + Math.floor((bb.w - sw) / 2), sy = bb.y + 1;
    for (var r = 0; r < (ad.cat ? 0 : ad.rows.length); r++)
        for (var k = 0; k < sw; k++) {
            var ch = ad.rows[r][k];
            if (ch !== ".") rect(ctx, sx + k, sy + r, 1, 1, col(ad.pal[ch]));
        }
    // Reflectores encima del marco.
    rect(ctx, bb.x + 3, bb.y - 1, 1, 1, frame);
    rect(ctx, bb.x + bb.w - 4, bb.y - 1, 1, 1, frame);
}

// Gato de perfil (mirando a la derecha) para el anuncio animado.
// o contorno y cola, c pelaje, d rayas, l panza, p nariz y orejas, e ojos, w patas.
var CAT_TOP = ["o........o....o", "co.......op..po", "co.......occcco", ".co......ceccec", ".co.....clcppcl",
               "..occcccccllll.", "..cdcdcdccccc..", "..ccccccccccc..", "..cllllllllcc.."];
var CAT_SIT = [".........o....o", ".........op..po", ".........occcco", null, "........clcppcl",
               null, null, "....ccccccccc..", "...cccllllcc...", "oo.cccllllcc...", "ooooccwwccww..."];
var CAT = {
    walk1: CAT_TOP.concat(["..cc.cc..cc.cc.", "..ww.ww..ww.ww."]),
    walk2: CAT_TOP.concat(["...cc..cc.cc...", "...ww..ww.ww..."]),
    jump: CAT_TOP.concat([".cc.......cc...", "ww.........ww.."]),
    // Lamiéndose la pata (ojos cerrados) y con la pata abajo.
    groom1: CAT_SIT.map(function (r, i) { return r || [null, null, null, ".........coccoc", null, "......cccllllw.", ".....cdcdcccw.."][i]; }),
    groom2: CAT_SIT.map(function (r, i) { return r || [null, null, null, ".........ceccec", null, "......cccllll..", ".....cdcdccc..."][i]; })
};

// Ciclo de 16 s: camina a la derecha, se sienta a acicalarse, salta y regresa caminando.
function drawCatAd(ctx, bb, P, t) {
    var night = P.night > 0.4, ad = bb.ad;
    function col(h) { return night ? h : css(lit(rgb(h), P)); }
    var SW = 15, ix = bb.x + 1, iw = bb.w - 2, floor = bb.y + bb.h - 3, span = iw - SW;
    var c = (t + bb.ph) % 16, x, dir = 1, frame, lift = 0;
    var steps = Math.floor(t * 5) % 2 ? "walk1" : "walk2";
    if (c < 6) { x = span * c / 6; frame = steps; }
    else if (c < 9.5) { x = span; frame = Math.floor(t * 3) % 2 ? "groom1" : "groom2"; }
    else if (c < 10.5) { x = span; frame = "jump"; lift = Math.round(Math.sin((c - 9.5) * Math.PI) * 4); }
    else { x = span * (1 - (c - 10.5) / 5.5); frame = steps; dir = -1; }
    var rows = CAT[frame], x0 = ix + Math.round(x), y0 = floor - (rows.length - 1) - lift;
    for (var r = 0; r < rows.length; r++)
        for (var k = 0; k < SW; k++) {
            var ch = rows[r][dir > 0 ? k : SW - 1 - k];
            if (ch !== ".") rect(ctx, x0 + k, y0 + r, 1, 1, col(ad.pal[ch]));
        }
    // Corazón que flota mientras se acicala.
    if (c >= 7 && c < 9.5) {
        var hy = y0 - 1 - Math.floor((c - 7) * 1.2);
        if (hy > bb.y) {
            ctx.fillStyle = col(ad.acc);
            var hx = x0 + 8;
            ctx.fillRect(hx, hy, 1, 1);
            ctx.fillRect(hx + 2, hy, 1, 1);
            ctx.fillRect(hx, hy + 1, 3, 1);
            ctx.fillRect(hx + 1, hy + 2, 1, 1);
        }
    }
}

// Dígitos de 3×5 para el reloj del dirigible.
var DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
              "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

function drawBlimp(ctx, b, P, t) {
    var d = b.dir, x = Math.round(b.x), y = Math.round(b.y + Math.sin(t * 0.4) * 1.5);
    var night = P.night > 0.4;
    var body = lit([214, 218, 232], P), shade = mul(body, 0.78), hi = mix(body, [255, 255, 255], 0.45);
    var fin = css(lit([200, 70, 80], P));
    function bx(o, len) { return d > 0 ? x + o : x - o - len + 1; }
    // Aletas de cola.
    for (var r = 0; r < 5; r++) {
        rect(ctx, bx(-21 + r, 4 - Math.floor(r / 2)), y - 10 + r, 4 - Math.floor(r / 2), 1, fin);
        rect(ctx, bx(-21 + r, 4 - Math.floor(r / 2)), y + 9 - r, 4 - Math.floor(r / 2), 1, fin);
    }
    ell(ctx, x, y, 20, 6.5, css(shade));
    ell(ctx, x, y - 1, 19, 5.5, css(body));
    rect(ctx, bx(-8, 18), y - 5, 18, 1, css(hi));
    // Góndola.
    rect(ctx, bx(-5, 10), y + 7, 10, 3, css(lit([70, 72, 92], P)));
    ctx.fillStyle = night ? "#ffe2a0" : css(lit([160, 200, 230], P));
    for (var g = -3; g < 4; g += 3) ctx.fillRect(bx(g, 2), y + 8, 2, 1);
    // Pantalla con la hora.
    rect(ctx, x - 11, y - 4, 23, 8, "#2a2c3a");
    rect(ctx, x - 10, y - 3, 21, 6, "#12141c");
    var now = new Date(t * 1000);
    var hh = now.getHours(), mm = now.getMinutes();
    var digits = [Math.floor(hh / 10), hh % 10, -1, Math.floor(mm / 10), mm % 10];
    var lc = "#7dffa0", cx = x - 8;
    if (night) {
        ctx.globalAlpha = 0.25;
        rect(ctx, x - 10, y - 3, 21, 6, lc);
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = lc;
    for (var i = 0; i < digits.length; i++) {
        if (digits[i] < 0) {
            if (Math.floor(t) % 2 === 0) { ctx.fillRect(cx, y - 2 + 1, 1, 1); ctx.fillRect(cx, y - 2 + 3, 1, 1); }
            cx += 2;
            continue;
        }
        var bits = DIGITS[digits[i]];
        for (var k = 0; k < 15; k++) if (bits[k] === "1") ctx.fillRect(cx + k % 3, y - 2 + Math.floor(k / 3), 1, 1);
        cx += 4;
    }
    if (night) {
        if (Math.floor(t * 1.3) % 2 === 0) rect(ctx, bx(-22, 1), y, 1, 1, "#ff5050");
        rect(ctx, bx(20, 1), y, 1, 1, "#ffffff");
    }
}

// Auto de 10×4 o autobús de 16×5, apoyado en la fila car.y.
function drawCar(ctx, car, P) {
    var d = car.dir, L = car.bus ? 16 : 10, x0 = Math.round(car.x) - Math.floor(L / 2), yb = car.y;
    var c = lit(car.col, P), body = css(c), hi = css(mix(c, [255, 255, 255], 0.3)), dark = css(mul(c, 0.7));
    var night = P.night > 0.4;
    var glass = night ? "#2a2e48" : css(mix([150, 190, 230], P.hor, 0.3));
    function px(o, r, len, col) { rect(ctx, d > 0 ? x0 + o : x0 + L - o - len, yb - r, len, 1, col); }
    var wheel = "#1c1c24";
    if (car.bus) {
        px(0, 4, L, hi);
        px(0, 3, L, body);
        px(0, 2, L, body);
        for (var k = 1; k < L - 3; k += 3) px(k, 3, 2, night ? "#ffe2a0" : glass);
        px(L - 2, 3, 2, glass);
        px(0, 1, L, body);
        px(0, 0, L, dark);
        px(2, 0, 2, wheel); px(L - 5, 0, 2, wheel);
    } else {
        px(3, 3, 4, hi);
        px(2, 2, 6, glass);
        px(5, 2, 1, body);
        px(0, 1, L, body);
        px(0, 0, L, dark);
        px(1, 0, 2, wheel); px(7, 0, 2, wheel);
        if (car.taxi) px(4, 4, 2, "#fff4a0");
    }
    if (night) {
        px(L - 1, 1, 1, "#fff4c0");
        px(0, 1, 1, "#ff4040");
        ctx.globalAlpha = 0.25;
        px(L, 1, 5, "#fff4c0");
        ctx.globalAlpha = 1;
    } else {
        px(L - 1, 1, 1, css(mix(c, [255, 255, 220], 0.6)));
    }
}

function drawBoat(ctx, b, P, t) {
    var x = Math.round(b.x), y = b.y, d = b.dir;
    var hull = lit([54, 60, 92], P), white = lit([240, 240, 244], P), red = lit([200, 70, 70], P);
    var night = P.night > 0.4;
    var winc = night ? "#ffe2a0" : css(mix(white, [70, 100, 150], 0.55));
    // Coordenada x relativa a la proa: positiva hacia adelante.
    function bx(o, len) { return d > 0 ? x + o : x - o - len + 1; }
    var half = b.kind === "ferry" ? 18 : (b.kind === "sail" ? 10 : 8);

    // Estela que se mueve.
    ctx.globalAlpha = 0.45;
    var wk = Math.floor(t * 4) % 2;
    for (var k = 0; k < 6; k++) rect(ctx, bx(-half - 3 - k * 5 - wk, 4), y + 8 + (k % 2), 4 - (k > 3 ? 1 : 0), 1, "#e8f0ff");
    rect(ctx, bx(half - 1, 3), y + 8, 3, 1, "#e8f0ff");
    ctx.globalAlpha = 1;

    if (b.kind === "sail") {
        rect(ctx, bx(-10, 21), y + 6, 21, 2, css(hull));
        rect(ctx, bx(-8, 17), y + 8, 17, 1, css(mul(hull, 0.75)));
        rect(ctx, bx(-10, 21), y + 6, 21, 1, css(mix(hull, [255, 255, 255], 0.2)));
        rect(ctx, bx(0, 1), y - 14, 1, 20, css(lit([90, 80, 70], P)));
        for (var r = 0; r < 17; r++) {
            var sw = Math.floor(r * 0.55) + 1;
            rect(ctx, bx(-sw, sw), y - 13 + r, sw, 1, css(r % 5 === 4 ? mul(white, 0.9) : white));
            if (r > 4) rect(ctx, bx(1, Math.floor((r - 4) * 0.4) + 1), y - 13 + r, Math.floor((r - 4) * 0.4) + 1, 1, css(mul(white, 0.92)));
        }
        rect(ctx, bx(-1, 3), y - 15, 3, 1, css(red));
        if (night) rect(ctx, bx(0, 1), y - 15, 1, 1, "#ffffff");
        return;
    }
    if (b.kind === "motor") {
        rect(ctx, bx(-8, 17), y + 5, 17, 2, css(white));
        rect(ctx, bx(-7, 15), y + 7, 15, 1, css(red));
        rect(ctx, bx(-3, 7), y + 2, 7, 3, css(mul(white, 0.9)));
        rect(ctx, bx(1, 2), y + 3, 2, 1, winc);
        rect(ctx, bx(-2, 2), y + 3, 2, 1, winc);
        rect(ctx, bx(-8, 2), y + 3, 2, 2, css(lit([60, 60, 70], P)));
        if (night) rect(ctx, bx(8, 1), y + 5, 1, 1, "#fff4c0");
        return;
    }
    // Ferry de dos pisos.
    rect(ctx, bx(-18, 37), y + 6, 37, 2, css(hull));
    rect(ctx, bx(-16, 33), y + 8, 33, 1, css(mul(hull, 0.75)));
    rect(ctx, bx(-18, 37), y + 6, 37, 1, css(mix(hull, [255, 255, 255], 0.25)));
    rect(ctx, bx(-14, 28), y + 1, 28, 5, css(white));
    rect(ctx, bx(-10, 19), y - 3, 19, 4, css(mul(white, 0.94)));
    rect(ctx, bx(-14, 28), y + 1, 28, 1, css(mul(white, 0.85)));
    ctx.fillStyle = winc;
    for (var i = -12; i < 13; i += 3) ctx.fillRect(bx(i, 2), y + 3, 2, 2);
    for (i = -8; i < 8; i += 3) ctx.fillRect(bx(i, 2), y - 2, 2, 1);
    rect(ctx, bx(-4, 3), y - 7, 3, 4, css(red));
    rect(ctx, bx(-4, 3), y - 7, 3, 1, css(lit([40, 40, 50], P)));
    rect(ctx, bx(9, 1), y - 6, 1, 3, css(hull));
    if (night) {
        if (Math.floor(t * 1.2) % 2 === 0) rect(ctx, bx(9, 1), y - 7, 1, 1, "#7dff7d");
        ctx.globalAlpha = 0.25;
        rect(ctx, bx(-14, 28), y + 9, 28, 2, "#ffe2a0");
        ctx.globalAlpha = 1;
    }
}
