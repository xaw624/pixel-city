// Pixel City: motor de la escena. Lo usan el fondo de Plasma (main.qml) y el arnés de pruebas (preview.html).
// Todo se dibuja con fillRect en coordenadas enteras sobre un lienzo de baja resolución que luego se
// escala sin suavizado, así cada "pixel" del arte ocupa varios pixeles reales de la pantalla.
//
// Escenas: create(W, H, seed, { scene }) arma la ciudad ("city", por omisión) o una de SCENES
// (playa, montaña, ...; la tabla está al final). Lo común (paleta, cielo, nubes, clima, gente,
// aves, dirigible) se comparte; cada escena pone su paisaje y sus extras con las funciones de su
// entrada en SCENES. Todo vive en este archivo porque los JS importados en QML no comparten
// variables globales y el navegador no entiende `.import`.

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
    var S = w && SCENES[w.scene];
    if (S && S.tint) S.tint(P, w);
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
    if (opts && SCENES[opts.scene]) return SCENES[opts.scene].create(W, H, seed, opts);
    var R = rng(seed || 7), i, j;
    var w = { W: W, H: H, opts: opts || {}, scene: "city" };
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
    w.ads = [];
    w.bigAds = [];
    w.refl = [];
    var id = { n: 1 };
    w.layers = [genLayer(w, R, 0, id), genLayer(w, R, 1, id), genLayer(w, R, 2, id)];

    ensureBigAd(w);

    // Las luces de antena que tapa un edificio más cercano no se dibujan.
    w.antennas = w.antennas.filter(function (a) { return !occluded(w, a.x, a.y, a.depth); });

    genSky(w, R);

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

    initLife(w, R);

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

// Estrellas y nubes; comparten todas las escenas (usan w.base como horizonte).
function genSky(w, R) {
    var W = w.W, H = w.H, i, j;
    w.stars = [];
    for (i = 0; i < Math.round(W * H / 900); i++)
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
        for (j = 0; j < k; j++) {
            var u = j / (k - 1) * 2 - 1;
            var r = Math.max(2, Math.round((storm ? 9 : 6) * (1 - u * u * 0.7) * (0.6 + R() * 0.6)));
            c.puffs.push({ dx: Math.round(u * span / 2 + (R() - 0.5) * 6), dy: -Math.round(r * c.flat) + ri(R, 0, 1), r: r });
        }
        w.clouds.push(c);
    }
}

// Listas de la simulación, temporizadores y estado del clima (comunes a todas las escenas).
function initLife(w, R) {
    var W = w.W;
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
    // Reloj volador (ver FLYERS): empieza el dirigible, a media pantalla.
    w.flyer = { kind: "blimp", x: Math.round(W * (0.2 + R() * 0.3)), y: ri(R, 16, 34), dir: 1, speed: 5, m: 24 };
    w.flyerIdx = 0;
    w.jets = null;             // jets de la hora en punto (ver stepJets)
    w.jetHour = -1;
    w.timers = { flyer: 60, person: 0, flock: 6, gull: 12, car: 0, boat: 15, plane: 25, meteor: 150, pigeon: 5, weather: 900 + R() * 1200,
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
        if (ad.big && TT.w < 26) ad = ADS[1 + Math.floor(R() * 3)];
        var bbh = ad.big ? 18 : 10;
        var bbw = ad.big ? Math.min(TT.w + 4, ri(R, 30, 34)) : Math.min(TT.w - 2, ri(R, 15, 19));
        var bbx = TT.x + Math.floor((TT.w - bbw) / 2);
        b.billboard = {
            x: bbx, y: TT.top - 3 - bbh, w: bbw, h: bbh, big: !!ad.big, ph: R() * 16,
            lx0: Math.max(bbx + 2, TT.x + 1), lx1: Math.min(bbx + bbw - 3, TT.x + TT.w - 2)
        };
        // Cada cartel empieza en un anuncio distinto y luego rota.
        b.billboard.start = ad.big ? Math.floor(b.billboard.ph) % BIG_ADS.length : ad.small;
        w.ads.push(b.billboard);
        if (ad.big) w.bigAds.push(b.billboard);
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

// Garantiza al menos un cartel animado visible: usa el edificio clásico más ancho que lo permita.
function ensureBigAd(w) {
    function onScreen(q) { return q.x > 0 && q.x + q.w < w.W; }
    if (w.bigAds.some(onScreen)) return;
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
        x: bbx, y: TT.top - 21, w: bbw, h: 18, big: true, ph: 0, start: 0,
        lx0: Math.max(bbx + 2, TT.x + 1), lx1: Math.min(bbx + bbw - 3, TT.x + TT.w - 2)
    };
    w.ads.push(best.billboard);
    w.bigAds.push(best.billboard);
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
    // w.span (playa) acorta el recorrido para que el sol no se esconda detrás del cabo.
    var fx = w.span ? w.span[0] + (w.span[1] - w.span[0]) * f : 0.08 + 0.84 * f;
    return { x: Math.round(w.W * fx), y: Math.round(w.base - s * (w.base - 16)), low: 1 - s };
}

function moonPos(w, hour) {
    var hh = hour < 12 ? hour + 24 : hour;
    if (hh < 19.2 || hh > 30.2) return null;
    var f = (hh - 19.2) / 11, s = Math.sin(Math.PI * f);
    var fx = w.span ? w.span[1] - (w.span[1] - w.span[0]) * f : 0.88 - 0.76 * f;
    return { x: Math.round(w.W * fx), y: Math.round(w.base - s * (w.base - 18)) };
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

    if (P.night > 0.15 && !w.noStars) {
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

    if (b.billboard) drawBillboard(ctx, b.billboard, c, P, t);

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

// Capa de la escena (ciudad o playa): todo lo fijo que se repinta cada ~30 s.
function drawCity(ctx, w, P, t) {
    if (SCENES[w.scene]) return SCENES[w.scene].draw(ctx, w, P, t);
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
    if (SCENES[w.scene]) return SCENES[w.scene].front(ctx, w, P);
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
var PACKS = ["#d0603a", "#3a6a9a", "#5a8a4a", "#c8a040", "#8a4a7a"];
var SCARVES = ["#d03a3a", "#3a6ad0", "#f0c040", "#40a070", "#e8e8f0", "#c060a0"];
var CARS = ["#d04848", "#4870d0", "#e8e8e8", "#303038", "#e0b040", "#60a070", "#9090a0"];

function lanes(w) {
    if (w.lanes) return w.lanes;
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
    var sc = w.scene;
    return {
        x: x, y: y, dir: dir, speed: speed, dist: R() * 12, kid: kid,
        skin: c(SKINS), hair: c(HAIRS), top: c(TOPS), bottom: c(BOTTOMS),
        style: Math.floor(R() * 3), skirt: !kid && R() < 0.2, bag: !kid && R() < 0.25,
        umbrella: w.rain > 0.3 && sc !== "village" && R() < 0.85 ? c(sc === "cyber" ? NEON : UMBRELLAS) : null,
        // Ropa según la escena: mochila de excursión, bufanda y gorro, sombrero de paja, paraguas de neón.
        pack: sc === "mountain" && !kid && R() < 0.6 ? c(PACKS) : null,
        scarf: sc === "village" ? c(SCARVES) : null,
        hat: sc === "farm" && !kid && R() < 0.45,
        neon: sc === "cyber"
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
            w.snow = w.rainTarget > 0 && (w.alwaysSnow || (!w.noSnow && R() < (m === 11 || m <= 1 ? 0.55 : (m === 2 || m === 10 ? 0.15 : 0))));
        }
        w.storm = w.rainTarget > 0.75 && !w.snow && R() < 0.6;
        T.weather = (w.rainTarget > 0 ? 300 : 900) + R() * 1200;
    }
    var dr = w.rainTarget - w.rain;
    w.rain += clamp(dr, -dt / 40, dt / 40);

    // La nieve se acumula mientras cae y se derrite despacio cuando para.
    if (w.snow && w.rain > 0.2) w.snowCover = Math.min(1, w.snowCover + dt * w.rain / 500);
    else if (!w.lock) w.snowCover = Math.max(w.minSnow || 0, w.snowCover - dt / 1500);

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
        if (w.people.length < Math.round((w.crowd || 16) * Math.max(1, W / 480))) spawnPerson(w, false);
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
        if (awake && w.scene === "city" && w.pigeons.length < 7 && P.rain < 0.5) {
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
        if (P.amb > 0.4 && !w.noGulls) {
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
    if (T.car <= 0 && w.scene === "city") {
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
        if (w.boats.length < 2 && !w.noBoats) {
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

    // Relojes voladores: cruzan de uno en uno y se turnan en el orden de FLYER_ORDER.
    var fy = w.flyer;
    if (fy) {
        var FD = FLYERS[fy.kind], done;
        if (FD.step) done = FD.step(fy, w, dt, R);
        else {
            fy.x += fy.dir * fy.speed * dt;
            done = fy.dir > 0 ? fy.x > W + fy.m : fy.x < -fy.m;
        }
        if (done) { w.flyer = null; T.flyer = 8 + R() * 12; }
    } else {
        T.flyer -= dt;
        if (T.flyer <= 0) nextFlyer(w, hour, R);
    }
    stepJets(w, dt, hour, R);

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

    var S = SCENES[w.scene];
    if (S && S.step) S.step(w, dt, hour, P);
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
    w.snowCover = w.minSnow || 0;
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
        if (p.scarf) {
            var kc = css(lit(p.scarf, P));
            spr(ctx, X, Y, d, 1, -1, 3, 1, kc);
            spr(ctx, X, Y, d, 1, 2, 3, 1, kc);
        }
        spr(ctx, X, Y, d, 1, 0, 3, 1, hair);
        spr(ctx, X, Y, d, 1, 1, 1, 1, hair);
        spr(ctx, X, Y, d, 2, 1, 2, 1, skin);
        spr(ctx, X, Y, d, 1, 2, 3, 3, top);
        if (f === 0) spr(ctx, X, Y, d, 4, 3, 1, 2, top);
        if (f === 2) spr(ctx, X, Y, d, 0, 3, 1, 2, top);
        if (p.scarf) spr(ctx, X, Y, d, 1, 2, 3, 1, css(lit(p.scarf, P)));
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
    if (p.pack) {
        var pk = lit(p.pack, P);
        spr(ctx, X, Y, d, -1, 3, 2, 5, css(pk));
        spr(ctx, X, Y, d, -1, 3, 2, 1, css(mix(pk, [255, 255, 255], 0.25)));
        spr(ctx, X, Y, d, -1, 2, 1, 1, css(lit([220, 210, 180], P)));      // colchoneta enrollada
    }
    if (p.scarf) {
        var scf = css(lit(p.scarf, P));
        spr(ctx, X, Y, d, 1, 3, 3, 1, scf);
        spr(ctx, X, Y, d, 0, 3 + (f % 2), 1, 2, scf);                       // punta que ondea
        spr(ctx, X, Y, d, 1, 0, 3, 1, scf);                                 // gorro con pompón
        spr(ctx, X, Y, d, 2, -1, 1, 1, css(lit([240, 240, 244], P)));
    }
    if (p.hat) {
        var straw = lit([216, 184, 108], P);
        spr(ctx, X, Y, d, 0, 0, 5, 1, css(straw));
        spr(ctx, X, Y, d, 1, -1, 3, 1, css(mix(straw, [255, 240, 200], 0.2)));
        spr(ctx, X, Y, d, 1, 0, 3, 1, css(mul(straw, 0.8)));
    }
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
        // El de neón brilla con su propia luz.
        var uc = p.neon ? mix(p.umbrella, lit(p.umbrella, P), 0.5) : lit(p.umbrella, P);
        spr(ctx, X, Y, d, 2, -2, 1, 2, css(lit([50, 50, 60], P)));
        spr(ctx, X, Y, d, 0, -4, 5, 1, css(uc));
        spr(ctx, X, Y, d, 1, -5, 3, 1, css(mix(uc, [255, 255, 255], 0.2)));
        rect(ctx, X - 1, Y - 3, 7, 1, css(p.neon ? mix(p.umbrella, [255, 255, 255], 0.4) : mul(uc, 0.8)));
        if (p.neon && P.night > 0.3) {
            ctx.globalAlpha = 0.18 * P.night;
            rect(ctx, X - 2, Y - 2, 9, 4, css(p.umbrella));
            ctx.globalAlpha = 1;
        }
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

    for (i = 0; i < w.ads.length; i++) drawAdFace(ctx, w.ads[i], P, t);

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
    if (w.flyer && FLYERS[w.flyer.kind].slow) FLYERS[w.flyer.kind].draw(ctx, w.flyer, P, t, w);

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

    var S = SCENES[w.scene];
    if (S && S.ambient) S.ambient(ctx, w, P, t);
    if (w.noWater) return;

    // Ondas que se desplazan sobre el agua.
    var wTop = w.yW, wBot = w.wBot || w.yP + 6, wh = wBot - wTop;
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
    // Fuera de la ciudad, el brillo solo aparece si el sol o la luna se ven (no tras un cerro).
    if (src && w.scene !== "city" && src.y >= w.sky[clamp(src.x, 0, W - 1)]) src = null;
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

    // Los relojes voladores rápidos van aquí y no en el ambiente: a 4 fps darían saltos.
    if (w.flyer && !FLYERS[w.flyer.kind].slow) FLYERS[w.flyer.kind].draw(ctx, w.flyer, P, t, w);
    if (w.jets) drawJets(ctx, w, P);

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
    var S = SCENES[w.scene];
    if (S && S.life) S.life(ctx, w, P, t);

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
    if (w.critters) for (i = 0; i < w.critters.length; i++) ground.push({ y: w.critters[i].y, c: w.critters[i] });
    ground.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < ground.length; i++) {
        if (ground[i].p) drawPerson(ctx, ground[i].p, P);
        else if (ground[i].c) CRITTERS[ground[i].c.kind](ctx, ground[i].c, P, t);
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

// ---------- anuncios de azotea ----------
// Los anuncios grandes (18 de alto) muestran un animal animado y los chicos (10 de alto) un ícono.
// Cada cartel rota entre sus anuncios con una transición de persiana. Las caras se dibujan en la
// capa de ambiente (drawAdFace); la ciudad solo pinta el marco y el fondo.
// ADS decide al generar la ciudad qué tipo de cartel lleva cada azotea.
var ADS = [{ big: true }, { small: 0 }, { small: 1 }, { small: 2 }];
var AD_TURN = 1.5;   // segundos que dura la transición

// Dibuja un sprite de filas de texto ("." es transparente), espejado si flip.
function sprite(ctx, rows, x, y, flip, pal, col) {
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r], n = row.length;
        for (var k = 0; k < n; k++) {
            var ch = row[flip ? n - 1 - k : k];
            if (ch !== ".") rect(ctx, x + k, y + r, 1, 1, col(pal[ch]));
        }
    }
}

// Gato atigrado gris de perfil (mira a la derecha), con la cara de frente: orejas cortas,
// bigotes y cola delgada que se curva en la punta, para que no parezca zorro.
// o punta de la cola, c pelaje, d rayas, l pecho y hocico, p nariz y orejas, e ojos, w patas, k bigotes.
var CAT_TOP = ["..oo.....c...c.", ".c.......cp.pc.", ".c.......ccccc.", ".c.......cecec.", "..c.....kclplck",
               "..cdcdcdcclllc.", "..ccccccccllc..", "..cccllllllcc.."];
var CAT_SIT = [".........c...c.", ".........cp.pc.", ".........ccccc.", ".........cecec.", "........kclplck",
               "........cclllc.", ".......ccclllc.", "......cdcclllc.", ".....cdcdclllc.", "oo...ccccclllc.",
               ".oocccccwwcww.."];
var CAT = {
    walk1: CAT_TOP.concat(["..cc.cc..cc.cc.", "..ww.ww..ww.ww."]),
    walk2: CAT_TOP.concat(["...cc..cc.cc...", "...ww..ww.ww..."]),
    jump: CAT_TOP.concat([".cc.......cc...", "ww.........ww.."]),
    // Lamiéndose la pata (ojos cerrados) y sentado con la pata abajo.
    groom1: CAT_SIT.map(function (r, i) {
        return [null, null, null, ".........cdcdc.", null, "........ccllwc.", ".......cccllwc.", null, null, null, ".oocccccwwc...."][i] || r;
    }),
    groom2: CAT_SIT
};

// Perro tipo beagle: oreja caída oscura, hocico claro y cola que se menea.
// o oreja y patas, b pelaje, l blanco, n nariz, e ojo, t lengua.
var DOG_BODY = ["..........bbb..", ".........obbbb.", ".l.......obbeb.", ".b.......obbbln", "..b......oblll.",
                "..bbbbbbbbbll..", "..bbbbbbbbbll..", "..bbllllllbbl.."];
var DOG_WAG = { 2: "l........obbeb.", 3: "b........obbbln", 4: ".b.......oblll." };
var DOG_SIT = ["..........bbb..", ".........obbbb.", ".........obbeb.", ".........obbbln", ".........obllt.",
               "........bbbll..", ".......bbbbll..", "......bbbbbll..", ".....bbbbbbll..", "lbbbbbbbbbbll..",
               ".....oooo..oo.."];
var DOG_SIT_WAG = { 8: "l....bbbbbbll..", 9: ".bbbbbbbbbbll.." };
function wag(rows, alt) {
    return rows.map(function (r, i) { return alt[i] || r; });
}
var DOG = {
    walk1: DOG_BODY.concat(["..ll.ll..ll.ll.", "..oo.oo..oo.oo."]),
    walk2: wag(DOG_BODY, DOG_WAG).concat(["...ll..ll.ll...", "...oo..oo.oo..."]),
    sit1: DOG_SIT,
    sit2: wag(DOG_SIT, DOG_SIT_WAG)
};

// Pingüino: cuerpo ovalado negro, barriga blanca, pico y patas naranjas.
var PENG_TOP = ["...kkkk...", "..kkkkkk..", "..kkkkkwk.", "..kkkkkkyy"];
var PENG = {
    step1: PENG_TOP.concat(["..kkkwwwk.", ".kkkwwwwwk", "kkkkwwwwwk", "kkkkwwwwwk", ".kkkwwwwwk", "..kkwwwwk.", "..yy..yy.."]),
    step2: PENG_TOP.concat(["..kkkwwwk.", ".kkkwwwwwk", "kkkkwwwwwk", "kkkkwwwwwk", ".kkkwwwwwk", "..kkwwwwk.", "...yy.yy.."]),
    flap: PENG_TOP.concat(["k.kkkwwwk.", ".kkkwwwwwk", ".kkkwwwwwk", ".kkkwwwwwk", ".kkkwwwwwk", "..kkwwwwk.", "..yy..yy.."]),
    // Deslizándose panza abajo, con la cabeza a la izquierda.
    slide: ["..kkkkkkkk..", "yykwkkkkkkk.", ".kwwwwwwwwky", "..wwwwwwww.."]
};

// Pajarito azul redondo con pecho amarillo.
var BIRD = {
    stand: ["....bbb..", "...bbbeby", "b.bwwbll.", "bbbwwwll.", ".bbbbll..", "...f.f..."],
    peck: [".........", "....bbb..", "b.bwwbbeb", "bbbwwwlly", ".bbbbll..", "...f.f..."],
    up: ["..w.bbb..", "..wwbbeby", "b..bbbll.", "bbbbbll..", ".........", "........."],
    down: ["....bbb..", "...bbbeby", "b.bbbbll.", "bbwwwll..", "..ww.....", "........."]
};

// Área útil de un cartel grande: piso justo encima de la franja de acento.
function adBox(bb, sw) {
    return { ix: bb.x + 1, iw: bb.w - 2, floor: bb.y + bb.h - 3, span: bb.w - 2 - sw };
}

// Gato, ciclo de 16 s: camina a la derecha, se sienta a acicalarse, salta y regresa.
function drawCatAnim(ctx, bb, ad, t, col) {
    var B = adBox(bb, 15), c = (t + bb.ph) % 16, x, dir = 1, frame, lift = 0;
    var steps = Math.floor(t * 5) % 2 ? "walk1" : "walk2";
    if (c < 6) { x = B.span * c / 6; frame = steps; }
    else if (c < 9.5) { x = B.span; frame = Math.floor(t * 3) % 2 ? "groom1" : "groom2"; }
    else if (c < 10.5) { x = B.span; frame = "jump"; lift = Math.round(Math.sin((c - 9.5) * Math.PI) * 4); }
    else { x = B.span * (1 - (c - 10.5) / 5.5); frame = steps; dir = -1; }
    var rows = CAT[frame], x0 = B.ix + Math.round(x), y0 = B.floor - (rows.length - 1) - lift;
    sprite(ctx, rows, x0, y0, dir < 0, ad.pal, col);
    // Corazón que flota mientras se acicala.
    if (c >= 7 && c < 9.5) {
        var hy = y0 - 1 - Math.floor((c - 7) * 1.2), hx = x0 + 9;
        if (hy > bb.y) sprite(ctx, ["h.h", "hhh", ".h."], hx, hy, false, { h: ad.acc }, col);
    }
}

// Perro, ciclo de 16 s: camina, se sienta moviendo la cola y ladra, y regresa.
function drawDogAnim(ctx, bb, ad, t, col) {
    var B = adBox(bb, 15), c = (t + bb.ph) % 16, x, dir = 1, frame, stop = Math.max(0, B.span - 3);
    var steps = Math.floor(t * 5) % 2 ? "walk1" : "walk2";
    if (c < 6) { x = stop * c / 6; frame = steps; }
    else if (c < 10.5) { x = stop; frame = Math.floor(t * 6) % 2 ? "sit1" : "sit2"; }
    else { x = stop * (1 - (c - 10.5) / 5.5); frame = steps; dir = -1; }
    var rows = DOG[frame], x0 = B.ix + Math.round(x), y0 = B.floor - (rows.length - 1);
    sprite(ctx, rows, x0, y0, dir < 0, ad.pal, col);
    // ¡Guau!: ondas que salen del hocico.
    if (c >= 7.5 && c < 9.5 && Math.floor(t * 4) % 2 === 0)
        sprite(ctx, ["a.", ".a", ".a", "a."], x0 + 16, y0 + 2, false, { a: ad.acc }, col);
}

// Pingüino, ciclo de 16 s: camina bamboleándose, aletea y se desliza de panza de regreso.
function drawPenguinAnim(ctx, bb, ad, t, col) {
    var B = adBox(bb, 10), c = (t + bb.ph) % 16, x, rows, lift = 0, flip = false;
    var step = Math.floor(t * 4) % 2;
    if (c < 8) { x = B.span * c / 8; rows = step ? PENG.step1 : PENG.step2; lift = step; }
    else if (c < 9.2) { x = B.span; rows = Math.floor(t * 6) % 2 ? PENG.flap : PENG.step1; }
    else if (c < 11) {
        x = B.span * (1 - (c - 9.2) / 1.8);
        var x1 = B.ix + Math.round(x), y1 = B.floor - 3;
        sprite(ctx, PENG.slide, x1, y1, false, ad.pal, col);
        // Rayas de velocidad detrás.
        ctx.globalAlpha = 0.6;
        rect(ctx, x1 + 13, y1 + 1, 3, 1, col(ad.acc));
        rect(ctx, x1 + 14, y1 + 3, 3, 1, col(ad.acc));
        ctx.globalAlpha = 1;
        return;
    } else { x = 0; rows = c > 13 && c < 13.8 && Math.floor(t * 6) % 2 ? PENG.flap : PENG.step1; }
    sprite(ctx, rows, B.ix + Math.round(x), B.floor - (rows.length - 1) - lift, flip, ad.pal, col);
}

// Pajarito, ciclo de 12 s: avanza a saltitos, picotea semillas y vuela de regreso.
function drawBirdAnim(ctx, bb, ad, t, col) {
    var B = adBox(bb, 9), c = (t + bb.ph) % 12, stop = Math.max(0, B.span - 2), x, rows = BIRD.stand, lift = 0, dir = 1;
    if (c < 5) {
        x = stop * Math.floor(c * 2) / 10;
        lift = Math.round(Math.sin((c * 2 % 1) * Math.PI) * 2);
    } else if (c < 7.5) {
        x = stop;
        rows = Math.floor(t * 4) % 2 ? BIRD.peck : BIRD.stand;
        rect(ctx, B.ix + stop + 9, B.floor, 1, 1, col(ad.pal.s));
        rect(ctx, B.ix + stop + 11, B.floor, 1, 1, col(ad.pal.s));
    } else if (c < 9.5) {
        var u = (c - 7.5) / 2;
        x = stop * (1 - u);
        lift = Math.round(Math.sin(u * Math.PI) * 7);
        rows = Math.floor(t * 8) % 2 ? BIRD.up : BIRD.down;
        dir = -1;
    } else {
        x = 0;
        rows = c > 10.5 && c < 11.5 && Math.floor(t * 4) % 2 ? BIRD.peck : BIRD.stand;
    }
    sprite(ctx, rows, B.ix + Math.round(x), B.floor - 5 - lift, dir < 0, ad.pal, col);
}

var BIG_ADS = [
    { bg: "#ffe4ec", acc: "#ff6f91", draw: drawCatAnim,
      pal: { o: "#4a4e5c", c: "#a3a8b6", d: "#6e7384", l: "#f4f4f8", p: "#ff8fa8", e: "#2a2030", w: "#ffffff", k: "#6a6272" } },
    { bg: "#fff1cc", acc: "#e0903a", draw: drawDogAnim,
      pal: { o: "#6a4428", b: "#c08850", l: "#f6eedc", n: "#2a2030", e: "#2a2030", t: "#ff7f9e" } },
    { bg: "#cdeeff", acc: "#3a7ad0", draw: drawPenguinAnim,
      pal: { k: "#22243a", w: "#ffffff", y: "#ffa82e" } },
    { bg: "#e2f7d4", acc: "#50b080", draw: drawBirdAnim,
      pal: { b: "#4a90e0", w: "#2a62b0", l: "#ffd86a", e: "#202028", y: "#ff9a3c", f: "#ff9a3c", s: "#8a6a3a" } }
];

var SMALL_ADS = [
    { bg: "#3a5a8c", acc: "#ffd35f", pal: { s: "#c8d4e8", w: "#ffffff", b: "#8a5a3a" },
      rows: ["..s..s...", ".s..s....", "wbbbbbw..", "wwwwwwwww", "wwwwwww.w", "wwwwwwwww", ".wwwww..."] },
    { bg: "#fff0f6", acc: "#c08cff", pal: { h: "#ff4f7a", l: "#ffa0b8" },
      rows: [".hh...hh.", "hlhh.hhhh", "hhhhhhhhh", ".hhhhhhh.", "..hhhhh..", "...hhh...", "....h...."] },
    { bg: "#bff4ff", acc: "#3a7ad0", pal: { f: "#ff8a5f", e: "#2a2030", d: "#e86a40" },
      rows: ["...ffff....", ".ffffffff.f", "fefffffffff", "ffddffffff.", ".ffffffff.f", "...ffff...."] },
    { bg: "#9ad4ff", acc: "#ffffff", pal: { k: "#22243a", w: "#ffffff", e: "#22243a", y: "#ffa82e", b: "#ff9ab0" },
      rows: ["..kkkkk..", ".kkwwwkk.", ".kwewewk.", ".kwwywwk.", ".kbwwwbk.", "..kwwwk..", "..yy.yy.."] },
    { bg: "#ffe0a0", acc: "#b07a48", pal: { o: "#6a4428", b: "#c08850", l: "#f6eedc", e: "#2a2030", n: "#2a2030", t: "#ff7f9e" },
      rows: [".bbbbbbb.", "obbbbbbbo", "obebbbebo", "obblnlbbo", "o.lltll.o", "...lll..."] },
    { bg: "#d4f4c4", acc: "#50b080", pal: { b: "#4a90e0", w: "#2a62b0", l: "#ffd86a", e: "#202028", y: "#ff9a3c", f: "#ff9a3c" },
      rows: BIRD.stand }
];

// Qué anuncio muestra un cartel en el instante t, el anterior y hace cuánto cambió.
function adState(bb, t) {
    var list = bb.big ? BIG_ADS : SMALL_ADS, n = list.length, per = bb.big ? 40 : 30;
    var u = (t + bb.ph * 7) / per, k = Math.floor(u), i = ((bb.start + k) % n + n) % n;
    return { ad: list[i], prev: list[(i + n - 1) % n], since: (u - k) * per };
}

function adContent(ctx, bb, ad, t, col) {
    rect(ctx, bb.x + 1, bb.y + 1, bb.w - 2, bb.h - 2, col(ad.bg));
    rect(ctx, bb.x + 1, bb.y + bb.h - 2, bb.w - 2, 1, col(ad.acc));
    if (ad.draw) ad.draw(ctx, bb, ad, t, col);
    else sprite(ctx, ad.rows, bb.x + Math.floor((bb.w - ad.rows[0].length) / 2), bb.y + 1, false, ad.pal, col);
}

// Cara del cartel (capa de ambiente). Al cambiar, el anuncio nuevo baja como persiana.
function drawAdFace(ctx, bb, P, t) {
    var night = P.night > 0.4;
    function col(h) { return night ? h : css(lit(rgb(h), P)); }
    var s = adState(bb, t), ix = bb.x + 1, iy = bb.y + 1, iw = bb.w - 2, ih = bb.h - 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    if (s.since < AD_TURN) {
        adContent(ctx, bb, s.prev, t, col);
        var rows = Math.round(ih * s.since / AD_TURN);
        ctx.save();
        ctx.beginPath();
        ctx.rect(ix, iy, iw, rows);
        ctx.clip();
        adContent(ctx, bb, s.ad, t, col);
        ctx.restore();
        ctx.globalAlpha = 0.8;
        rect(ctx, ix, iy + rows, iw, 1, "#ffffff");
        ctx.globalAlpha = 1;
    } else {
        adContent(ctx, bb, s.ad, t, col);
    }
    ctx.restore();
}

// Marco, patas y fondo del cartel (capa de ciudad; el fondo también sale en el reflejo).
function drawBillboard(ctx, bb, c, P, t) {
    var night = P.night > 0.4, ad = adState(bb, t).ad;
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
    // Reflectores encima del marco.
    rect(ctx, bb.x + 3, bb.y - 1, 1, 1, frame);
    rect(ctx, bb.x + bb.w - 4, bb.y - 1, 1, 1, frame);
}

// Dígitos de 3×5 para el reloj del dirigible.
var DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
              "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

// ---------- relojes voladores ----------
// Uno a la vez cruza el cielo con la hora y se turnan en el orden de FLYER_ORDER, saltando los que no
// pueden salir ahora. Cada tipo tiene ok(w, hora) (si puede salir), make(w, dir, R) (el objeto),
// draw(ctx, f, P, t, w) y opcionales step(f, w, dt, R) (lo mueve; true al terminar; sin él cruza en
// línea recta y termina a f.m pixeles fuera de la pantalla) y slow (va en la capa ambiental, 4 fps).
var FLYER_ORDER = ["blimp", "banner", "duster", "skywrite", "balloon", "heli", "holo", "swarm", "sleigh"];
var FLYERS = {
    blimp: {
        slow: true,
        ok: function () { return true; },
        make: function (w, d, R) { return { x: d > 0 ? -22 : w.W + 22, y: 16 + R() * 20, dir: d, speed: 4.5 + R() * 1.5, m: 24 }; },
        draw: drawBlimp
    },
    banner: {
        ok: function (w, h) { return h > 7.5 && h < 18 && w.scene !== "farm"; },
        make: function (w, d, R) {
            return { x: d > 0 ? -8 : w.W + 8, y: 8 + R() * 22, dir: d, speed: 9 + R() * 3, m: 6 + BANNER_ROPE + BANNER_W + 2 };
        },
        draw: drawBannerPlane
    },
    duster: {
        ok: function (w, h) { return w.scene === "farm" && h > 7.5 && h < 18 && w.rain < 0.05; },
        make: function (w, d, R) {
            return { x: d > 0 ? -8 : w.W + 8, y: w.yW - 8 + R() * 8, dir: d, speed: 10 + R() * 2, spray: [], st: 0,
                     m: 6 + BANNER_ROPE + BANNER_W + 2 };
        },
        step: stepDuster,
        draw: drawDuster
    },
    skywrite: {
        ok: function (w, h) { return h > 8 && h < 17.5 && w.rain < 0.05 && w.fog < 0.2; },
        make: makeSkywrite,
        step: stepSkywrite,
        draw: drawSkywrite
    },
    balloon: {
        slow: true,
        ok: function (w, h) { return h > 6.5 && h < 18.5 && w.rain < 0.05; },
        make: makeBalloon,
        step: stepBalloon,
        draw: drawBalloon
    },
    heli: {
        ok: function (w) { return (w.scene === "city" || w.scene === "beach" || w.scene === "cyber") && !w.storm; },
        make: function (w, d, R) { return { x: d > 0 ? -10 : w.W + 10, y: 12 + R() * 16, dir: d, speed: 11 + R() * 3, m: 16 }; },
        draw: drawHeli
    },
    holo: {
        ok: function (w) { return w.scene === "cyber"; },
        make: function (w, d, R) { return { x: d > 0 ? -12 : w.W + 12, y: 14 + R() * 20, dir: d, speed: 6 + R() * 2, m: 14, id: R() * 1000 }; },
        draw: drawHolo
    },
    swarm: {
        ok: function (w, h) { return (h >= 20.5 || h < 4.5) && w.rain < 0.05 && w.fog < 0.3; },
        make: makeSwarm,
        step: stepSwarm,
        draw: drawSwarm
    },
    sleigh: {
        // Pueblo, del 1 de diciembre al Día de Reyes.
        ok: function (w) {
            var now = new Date();
            return w.scene === "village" && (now.getMonth() === 11 || (now.getMonth() === 0 && now.getDate() <= 6));
        },
        make: function (w, d, R) {
            return { x: d > 0 ? -2 : w.W + 2, y: 10 + R() * 16, dir: d, speed: 12 + R() * 2, m: 31 + BANNER_ROPE + BANNER_W + 2 };
        },
        draw: drawSleigh
    }
};

// Saca el siguiente reloj volador que pueda salir (el dirigible siempre puede).
function nextFlyer(w, hour, R) {
    var d = R() < 0.5 ? 1 : -1, n = FLYER_ORDER.length;
    for (var i = 1; i <= n; i++) {
        var k = (w.flyerIdx + i) % n, kind = FLYER_ORDER[k];
        if (!FLYERS[kind].ok(w, hour)) continue;
        w.flyerIdx = k;
        w.flyer = FLYERS[kind].make(w, d, R);
        w.flyer.kind = kind;
        return;
    }
}

// Jets de la hora en punto: de día y con cielo despejado, cuatro jets en rombo cruzan rápido
// dejando estelas roja, blanca y verde. Van aparte de los turnos de FLYERS.
var JET = ["t......", "tbbbbbb", ".ww...."];
var JET_PAL = { t: [40, 80, 180], b: [222, 226, 236], w: [170, 176, 194] };
var JET_FORM = [[0, 0, [255, 255, 255]], [-8, -4, [224, 64, 64]], [-8, 4, [56, 168, 96]], [-16, 0, [255, 255, 255]]];
var JET_LIFE = 8;
function spawnJets(w, R) {
    var d = R() < 0.5 ? 1 : -1;
    w.jets = { dir: d, x: d > 0 ? -4 : w.W + 4, y: Math.round(12 + R() * 14), trail: [] };
}
function stepJets(w, dt, hour, R) {
    var now = new Date();
    if (now.getMinutes() === 0 && w.jetHour !== now.getHours()) {
        w.jetHour = now.getHours();
        if (!w.jets && hour > 8 && hour < 19 && w.rain < 0.05 && w.fog < 0.3) spawnJets(w, R);
    }
    var J = w.jets;
    if (!J) return;
    J.x += J.dir * 45 * dt;
    var flying = J.dir > 0 ? J.x < w.W + 30 : J.x > -30;
    // Un tramo de estela por paso, tan largo como lo que avanzó el jet, para que no quede punteada.
    if (flying) {
        var len = Math.ceil(45 * dt) + 1;
        for (var i = 0; i < JET_FORM.length; i++)
            J.trail.push({ x: J.x + J.dir * (JET_FORM[i][0] - 1), y: J.y + JET_FORM[i][1] + 1, c: JET_FORM[i][2], age: 0, len: len });
    }
    for (i = J.trail.length - 1; i >= 0; i--) {
        var p = J.trail[i];
        p.age += dt;
        p.y += 0.3 * dt;
        if (p.age > JET_LIFE) J.trail.splice(i, 1);
    }
    if (!flying && !J.trail.length) w.jets = null;
}
function drawJets(ctx, w, P) {
    var J = w.jets, i;
    // Cada tramo engorda y se desvanece con la edad.
    for (i = 0; i < J.trail.length; i++) {
        var p = J.trail[i], h = p.age < 1 ? 1 : p.age < 4 ? 2 : 3;
        ctx.globalAlpha = 0.85 * (1 - p.age / JET_LIFE);
        var c = css(mix(lit(p.c, P), P.cl, 0.15)), x = Math.round(p.x) - (J.dir > 0 ? p.len - 1 : 0);
        for (var r = 0; r < h; r++) skyDot(ctx, w, x, Math.round(p.y) - (h > 2 ? 1 : 0) + r, c, p.len);
    }
    ctx.globalAlpha = 1;
    var col = function (c) { return css(lit(c, P)); };
    for (i = 0; i < JET_FORM.length; i++) {
        var jx = Math.round(J.x + J.dir * JET_FORM[i][0]), jy = J.y + JET_FORM[i][1];
        sprite(ctx, JET, J.dir > 0 ? jx - 6 : jx, jy, J.dir < 0, JET_PAL, col);
    }
}

// Pixeles [x, y] de la hora "HH:MM" con dígitos de 3×5 (17×5 en total); los dos puntos parpadean.
function clockDots(t, solid) {
    var now = new Date(t * 1000), hh = now.getHours(), mm = now.getMinutes();
    var digits = [Math.floor(hh / 10), hh % 10, -1, Math.floor(mm / 10), mm % 10], out = [], cx = 0;
    for (var i = 0; i < digits.length; i++) {
        if (digits[i] < 0) {
            if (solid || Math.floor(t) % 2 === 0) out.push([cx, 1], [cx, 3]);
            cx += 2;
            continue;
        }
        var bits = DIGITS[digits[i]];
        for (var k = 0; k < 15; k++) if (bits[k] === "1") out.push([cx + k % 3, Math.floor(k / 3)]);
        cx += 4;
    }
    return out;
}

// Avioneta de ala alta de 12×5 (mira a la derecha); la hélice se dibuja aparte.
// t cola, w ala, b fuselaje, s panza, g ventanas, k ruedas.
var BANNER_PLANE = ["tt..........", "ttt...wwww..", "tbbbbbbbggb.", ".ssbbbbbbbbb", "......k..k.."];
var BANNER_PLANE_PAL = { t: [200, 56, 60], w: [200, 56, 60], b: [236, 236, 240], s: [176, 178, 190], g: [96, 136, 180], k: [40, 40, 48] };
var BANNER_W = 25, BANNER_H = 9, BANNER_ROPE = 6;

// Avioneta que remolca un cartel de tela con la hora; el cartel ondea más hacia su extremo libre.
function drawBannerPlane(ctx, b, P, t, w) {
    var d = b.dir, y = Math.round(b.y + Math.sin(t * 0.9) * 1.2), x = Math.round(b.x) - 6;
    var col = function (c) { return css(lit(c, P)); };
    sprite(ctx, BANNER_PLANE, x, y, d < 0, BANNER_PLANE_PAL, col);
    // Hélice: el cubo siempre y las puntas alternadas para que parezca que gira.
    var px = d > 0 ? x + 12 : x - 1, f = Math.floor(t * 12) % 2;
    ctx.globalAlpha = 0.7;
    rect(ctx, px, y + 2, 1, 2, col([120, 120, 132]));
    rect(ctx, px, f ? y + 1 : y + 4, 1, 1, col([90, 90, 100]));
    ctx.globalAlpha = 1;
    if (P.night > 0.4) {
        rect(ctx, d > 0 ? x + 8 : x + 3, y + 1, 1, 1, Math.floor(t * 1.5) % 2 === 0 ? "#ff6060" : "#60ff80");
        if (Math.floor(t * 1.2) % 3 === 0) rect(ctx, d > 0 ? x : x + 11, y, 1, 1, "#ffffff");
    }
    drawTowedBanner(ctx, w, d > 0 ? x - 1 : x + 12, y + 2, d, P, t);
}

// Avioneta fumigadora del campo: biplano amarillo de 12×6 que vuela bajo, rocía las parcelas y
// remolca el cartel con la hora. w alas, b fuselaje, t cola, g piloto, k montantes y ruedas.
var DUSTER = ["....wwwwww..", "t.....k..k..", "tbbbbbgbbbb.", ".bbbbbbbbbbb", "....wwwwww..", "......k..k.."];
var DUSTER_PAL = { w: [232, 184, 40], b: [246, 208, 64], t: [200, 60, 50], g: [60, 60, 72], k: [80, 66, 54] };
function stepDuster(f, w, dt, R) {
    f.x += f.dir * f.speed * dt;
    f.st -= dt;
    if (f.st <= 0 && f.x > -6 && f.x < w.W + 6) {
        f.st = 0.12;
        f.spray.push({ x: Math.round(f.x) - 6 + (f.dir > 0 ? 3 : 2) + Math.floor(R() * 7), y: f.y + 6, age: 0 });
    }
    for (var i = f.spray.length - 1; i >= 0; i--) {
        var p = f.spray[i];
        p.age += dt;
        p.y += 2.5 * dt;
        p.x += 0.4 * dt;
        if (p.age > 3) f.spray.splice(i, 1);
    }
    return !f.spray.length && (f.dir > 0 ? f.x > w.W + f.m : f.x < -f.m);
}
function drawDuster(ctx, f, P, t, w) {
    var d = f.dir, y = Math.round(f.y + Math.sin(t * 0.9)), x = Math.round(f.x) - 6;
    var col = function (c) { return css(lit(c, P)); }, mist = col([228, 236, 216]);
    for (var i = 0; i < f.spray.length; i++) {
        var p = f.spray[i], g = p.age > 1.2 ? 2 : 1;
        ctx.globalAlpha = 0.4 * (1 - p.age / 3);
        rect(ctx, p.x, p.y, g + 1, g, mist);
    }
    ctx.globalAlpha = 1;
    sprite(ctx, DUSTER, x, y, d < 0, DUSTER_PAL, col);
    var px = d > 0 ? x + 12 : x - 1, fr = Math.floor(t * 12) % 2;
    ctx.globalAlpha = 0.7;
    rect(ctx, px, y + 2, 1, 2, col([120, 120, 132]));
    rect(ctx, px, fr ? y + 1 : y + 4, 1, 1, col([90, 90, 100]));
    ctx.globalAlpha = 1;
    drawTowedBanner(ctx, w, d > 0 ? x - 1 : x + 12, y + 2, d, P, t);
}

// Trineo con dos renos (8×6, miran a la derecha) que remolca el cartel con la hora.
// a astas, h cabeza, n nariz, b cuerpo, t cola, l patas; trineo: c gorro y abrigo, f cara, w barba,
// g costal, r trineo, y patines.
var REINDEER = [".....a.a", "......hh", "t....bhn", ".bbbbbb.", ".bbbbb.."];
var REINDEER_LEGS = [".l...l..", "l..l.l.l"];
var REINDEER_PAL = { a: [150, 110, 70], h: [150, 100, 64], n: [70, 40, 40], b: [140, 94, 60], t: [232, 222, 204], l: [100, 70, 50] };
var SLEIGH = ["......cc..", "......ff..", "gg....cw..", "rrrrrrrrr.", ".rrrrrrrry", "yyyyyyyyy."];
var SLEIGH_PAL = { c: [200, 40, 44], f: [240, 200, 170], w: [244, 244, 248], g: [60, 130, 70], r: [180, 30, 40], y: [230, 190, 70] };
function drawSleigh(ctx, f, P, t, w) {
    var d = f.dir, base = Math.round(f.x), y = Math.round(f.y + Math.sin(t * 1.4) * 1.5);
    var col = function (c) { return css(lit(c, P)); };
    // Pieza de largo len a off pixeles del frente de la caravana.
    function at(off, len) { return d > 0 ? base - off - len : base + off + 1; }
    var harness = col([90, 60, 40]);
    rect(ctx, at(17, 2), y + 3, 2, 1, harness);
    rect(ctx, at(8, 1), y + 3, 1, 1, harness);
    sprite(ctx, SLEIGH, at(19, 10), y, d < 0, SLEIGH_PAL, col);
    for (var k = 0; k < 2; k++) {
        var off = k ? 0 : 9, rx = at(off, 8), ry = y + (Math.floor(t * 6 + k) % 2 ? 0 : -1);
        sprite(ctx, REINDEER, rx, ry, d < 0, REINDEER_PAL, col);
        sprite(ctx, [REINDEER_LEGS[Math.floor(t * 6 + k) % 2]], rx, ry + 5, d < 0, REINDEER_PAL, col);
        // De noche el reno de adelante lleva la nariz roja encendida.
        if (k && P.night > 0.4) {
            var nx = d > 0 ? rx + 7 : rx;
            ctx.globalAlpha = 0.3;
            rect(ctx, nx - 1, ry + 1, 3, 3, "#ff3030");
            ctx.globalAlpha = 1;
            rect(ctx, nx, ry + 2, 1, 1, Math.floor(t * 2) % 2 ? "#ff4040" : "#ff8080");
        }
    }
    drawTowedBanner(ctx, w, at(29, 1), y + 3, d, P, t);
}

// En la playa el cartel alterna la hora con un anuncio de helados (cono, paleta y cono).
var ICE_CREAM = [".ppp...ooo...mmm.", "ppppp..ooo..mmmmm", "ccccc..ooo..ccccc", ".ccc....s....ccc.", "..c.....s.....c.."];
var ICE_CREAM_PAL = { p: [240, 120, 160], o: [240, 140, 50], m: [110, 206, 166], c: [214, 160, 80], s: [196, 164, 116] };

// Cuerda (desde tail, a la altura y) y cartel que se arrastran en sentido contrario a d.
function drawTowedBanner(ctx, w, tail, y, d, P, t) {
    var col = function (c) { return css(lit(c, P)); }, rope = col([110, 100, 90]);
    for (var r = 0; r < BANNER_ROPE; r++) rect(ctx, tail - d * r, y + (r > 1 && r < BANNER_ROPE - 1 ? 1 : 0), 1, 1, rope);
    // Cartel: columna c contada desde el palo; la ondulación crece hacia el extremo libre.
    var pole = tail - d * BANNER_ROPE, top = y - 4;
    var cloth = lit([246, 240, 224], P), fold = lit([212, 202, 182], P), ink = col([204, 40, 50]);
    // Ondas de un solo pixel para que la hora se siga leyendo; la punta libre aletea más.
    var wave = function (c) {
        var o = c > 5 && Math.sin(t * 4 - c * 0.3) > 0.2 ? 1 : 0;
        return c > BANNER_W - 3 ? o + Math.round(Math.sin(t * 9 + c * 1.7)) : o;
    };
    // grid["columna,fila"] = color de lo que va escrito en la tela.
    var grid = {}, i;
    if (w.scene === "beach" && Math.floor(t / 6) % 2 === 1) {
        for (i = 0; i < 5; i++)
            for (var j = 0; j < 17; j++) {
                var ch = ICE_CREAM[i][j];
                if (ch !== ".") grid[(j + 4) + "," + (i + 2)] = col(ICE_CREAM_PAL[ch]);
            }
    } else {
        var dots = clockDots(t);
        for (i = 0; i < dots.length; i++) grid[(dots[i][0] + 4) + "," + (dots[i][1] + 2)] = ink;
    }
    rect(ctx, pole, top - 1, 1, BANNER_H + 2, col([96, 80, 64]));
    for (var c = 1; c <= BANNER_W; c++) {
        var sx = pole - d * c, o = wave(c), k = d > 0 ? BANNER_W - c : c - 1;
        var h = c === BANNER_W ? BANNER_H - 2 : BANNER_H, y0 = top + o + (c === BANNER_W ? 1 : 0);
        rect(ctx, sx, y0, 1, h, css(o < wave(c - 1) ? fold : cloth));
        rect(ctx, sx, y0, 1, 1, ink);
        rect(ctx, sx, y0 + h - 1, 1, 1, ink);
        for (var rr = 2; rr < 7; rr++) {
            var gc = grid[k + "," + rr];
            if (gc) rect(ctx, sx, y0 + rr, 1, 1, gc);
        }
    }
}

// Escritura con humo ("skytyping"): cinco avionetas en fila vertical sueltan bocanadas al pasar,
// como una impresora de puntos; cada fila de la hora es una avioneta. El humo dura un minuto.
var SKY_PLANE = ["t....", "tbbbb", ".ww.."];
var SKY_PLANE_PAL = { t: [52, 92, 196], b: [240, 240, 244], w: [52, 92, 196] };
var SKY_GAP = 4, SKY_LIFE = 60;
function makeSkywrite(w, d, R) {
    var tw = 17 * SKY_GAP;
    return { x: d > 0 ? -8 : w.W + 8, y: Math.round(6 + R() * 10), dir: d, speed: 16,
             x0: Math.round(w.W * 0.1 + R() * Math.max(1, w.W * 0.8 - tw)),
             dots: clockDots(Date.now() / 1000, true), col: 0, puffs: [] };
}
function stepSkywrite(f, w, dt) {
    f.x += f.dir * f.speed * dt;
    // Imprime cada columna de la hora cuando la cola de la formación la cruza.
    while (f.col < 17) {
        var c = f.dir > 0 ? f.col : 16 - f.col, cx = f.x0 + c * SKY_GAP;
        if (f.dir > 0 ? f.x - 3 < cx : f.x + 3 > cx) break;
        for (var i = 0; i < f.dots.length; i++)
            if (f.dots[i][0] === c) f.puffs.push({ x: cx, y: f.y + f.dots[i][1] * SKY_GAP, age: 0 });
        f.col++;
    }
    var alive = false;
    for (i = 0; i < f.puffs.length; i++) {
        var p = f.puffs[i];
        p.age += dt;
        // El viento se lleva el humo despacio; las filas a velocidades un poco distintas lo deshilachan.
        p.x += (0.25 + (p.y % 3) * 0.08) * dt;
        if (p.age < SKY_LIFE) alive = true;
    }
    return !alive && (f.dir > 0 ? f.x > w.W + 10 : f.x < -10);
}
function drawSkywrite(ctx, f, P, t, w) {
    var smoke = css(mix(lit([252, 252, 255], P), P.cl, 0.15));
    ctx.fillStyle = smoke;
    for (var i = 0; i < f.puffs.length; i++) {
        var p = f.puffs[i], a = p.age;
        if (a >= SKY_LIFE) continue;
        // Crece al salir, se mantiene legible medio minuto y luego se infla y se desvanece.
        var s = a < 0.4 ? 1 : a < 1 ? 2 : a < 30 ? 3 : 3 + Math.floor((a - 30) / 10);
        ctx.globalAlpha = a < 30 ? 0.92 : 0.92 * (1 - (a - 30) / (SKY_LIFE - 30));
        var x0 = Math.round(p.x) - Math.floor(s / 2), y0 = p.y - Math.floor(s / 2);
        for (var r = 0; r < s; r++) {
            var ins = s >= 4 && (r === 0 || r === s - 1) ? 1 : 0;
            skyDot(ctx, w, x0 + ins, y0 + r, smoke, s - ins * 2);
        }
    }
    ctx.globalAlpha = 1;
    if (f.dir > 0 ? f.x > w.W + 10 : f.x < -10) return;
    var col = function (c) { return css(lit(c, P)); };
    for (var k = 0; k < 5; k++) sprite(ctx, SKY_PLANE, Math.round(f.x) - 2, f.y + k * SKY_GAP - 1, f.dir < 0, SKY_PLANE_PAL, col);
}

// Pixel recortado con la silueta: no se pinta delante de edificios, cerros ni del horizonte.
function skyPx(ctx, w, x, y) {
    if (x >= 0 && x < w.W && y >= 0 && y < w.sky[x]) ctx.fillRect(x, y, 1, 1);
}

// Globo aerostático: aparece sobre la pantalla subiendo desde detrás del horizonte, llega a su
// altura y se deja llevar por el viento. La hora va pintada en una franja de la tela.
var BALLOON_COLS = [[[226, 72, 64], [248, 196, 64]], [[60, 116, 206], [240, 240, 246]], [[86, 168, 100], [248, 214, 90]],
                    [[164, 78, 168], [250, 150, 90]], [[232, 110, 150], [120, 200, 220]]];
function makeBalloon(w, d, R) {
    return { x: w.W * (0.15 + R() * 0.7), y: w.H * 0.66, ty: 18 + R() * 14, dir: d, speed: 2.4 + R() * 0.8,
             cols: pick(R, BALLOON_COLS), burn: 0, bt: 1 };
}
function stepBalloon(f, w, dt, R) {
    f.x += f.dir * f.speed * dt;
    var rising = f.y > f.ty;
    if (rising) f.y = Math.max(f.ty, f.y - 2.2 * dt);
    // El quemador se enciende a ratos, más seguido mientras sube.
    f.burn -= dt;
    f.bt -= dt;
    if (f.bt <= 0) { f.burn = 1 + R() * 0.6; f.bt = rising ? 2.5 + R() * 2 : 7 + R() * 6; }
    return f.dir > 0 ? f.x > w.W + 12 : f.x < -12;
}
function drawBalloon(ctx, f, P, t, w) {
    var cx = Math.round(f.x), cy = Math.round(f.y + (f.y <= f.ty ? Math.sin(t * 0.5) : 0));
    var c1 = lit(f.cols[0], P), c2 = lit(f.cols[1], P), band = css(lit([246, 240, 224], P)), trim = css(mul(c1, 0.8));
    var g = [css(c1), css(c2)], gs = [css(mul(c1, 0.78)), css(mul(c2, 0.78))], hi = css(mix(c2, [255, 255, 255], 0.4));
    // Tela: cinco gajos que siguen el contorno; abajo se cierra en punta hacia la canasta.
    for (var dy = -11; dy <= 11; dy++) {
        var hw = dy <= 3 ? Math.floor(10.5 * Math.sqrt(1 - dy * dy / 132)) : Math.round(10 - (dy - 3) * 0.85);
        for (var dx = -hw; dx <= hw; dx++) {
            var k = Math.min(4, Math.floor((dx / (hw + 0.5)) * 2.5 + 2.5)) % 2;
            if (dy === -3 || dy === 3) ctx.fillStyle = trim;
            else if (dy > -3 && dy < 3) ctx.fillStyle = band;
            else if (dx === -hw + 2 && dy >= -8 && dy <= -5) ctx.fillStyle = hi;
            else ctx.fillStyle = dx >= hw - 1 || dx === -hw ? gs[k] : g[k];
            skyPx(ctx, w, cx + dx, cy + dy);
        }
    }
    ctx.fillStyle = css(lit([70, 44, 40], P));
    var dots = clockDots(t);
    for (var i = 0; i < dots.length; i++) skyPx(ctx, w, cx - 8 + dots[i][0], cy - 2 + dots[i][1]);
    // Cuerdas, flama del quemador y canasta.
    ctx.fillStyle = css(lit([96, 80, 64], P));
    skyPx(ctx, w, cx - 3, cy + 12); skyPx(ctx, w, cx - 2, cy + 13);
    skyPx(ctx, w, cx + 3, cy + 12); skyPx(ctx, w, cx + 2, cy + 13);
    if (f.burn > 0) {
        var fl = Math.floor(t * 10) % 2;
        ctx.fillStyle = "#ffe070"; skyPx(ctx, w, cx, cy + 12 - fl);
        ctx.fillStyle = "#ff9a3c"; skyPx(ctx, w, cx - 1 + fl * 2, cy + 13); skyPx(ctx, w, cx, cy + 13);
    }
    var wood = lit([140, 92, 52], P);
    for (var by = 14; by <= 16; by++) {
        ctx.fillStyle = css(by === 14 ? mix(wood, [255, 255, 255], 0.2) : mul(wood, by === 16 ? 0.75 : 1));
        for (var bx = -2; bx <= 2; bx++) skyPx(ctx, w, cx + bx, cy + by);
    }
}

// Helicóptero de 16×7 (mira a la derecha) que lleva colgando una pantalla con la hora.
// m mástil, b fuselaje, s franja, g cabina, t cola, k patines. El rotor se dibuja aparte.
var HELI = ["........m.......", "......bbbbbb....", "t....bbbbbbggg..", "tbbbbssssssgggg.", "t....bbbbbbbbbb.",
            ".......k...k....", "....kkkkkkkkkk.."];
var HELI_PAL = { m: [80, 80, 92], b: [236, 236, 240], s: [232, 118, 40], g: [110, 160, 210], t: [232, 118, 40], k: [64, 64, 76] };
function drawHeli(ctx, f, P, t, w) {
    var d = f.dir, cx = Math.round(f.x), y = Math.round(f.y + Math.sin(t * 1.1) * 1.2), x = cx - 8;
    var night = P.night > 0.4, col = function (c) { return css(lit(c, P)); };
    // Reflector: un cono tenue que sale de la nariz hacia abajo y adelante.
    if (night) {
        ctx.globalAlpha = 0.09;
        for (var r = 0; r < 70; r++) {
            var hw = 1 + Math.floor(r * 0.22), sx = cx + d * (7 + Math.floor(r * 0.45));
            rect(ctx, sx - hw, y + 5 + r, hw * 2 + 1, 1, "#fff2c0");
        }
        ctx.globalAlpha = 1;
    }
    // Cable y pantalla, que se mece un poco.
    var sw = Math.round(Math.sin(t * 1.3)), sy = y + 11;
    rect(ctx, cx, y + 7, 1, 2, col([60, 60, 70]));
    rect(ctx, cx + sw, y + 9, 1, 2, col([60, 60, 70]));
    rect(ctx, cx + sw - 11, sy, 23, 9, "#2a2c3a");
    rect(ctx, cx + sw - 10, sy + 1, 21, 7, "#12141c");
    var lc = "#ffb040";
    if (night) {
        ctx.globalAlpha = 0.22;
        rect(ctx, cx + sw - 10, sy + 1, 21, 7, lc);
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = lc;
    var dots = clockDots(t);
    for (var i = 0; i < dots.length; i++) ctx.fillRect(cx + sw - 8 + dots[i][0], sy + 2 + dots[i][1], 1, 1);
    // Fuselaje, rotor principal (largo y corto alternados) y rotor de cola.
    sprite(ctx, HELI, x, y, d < 0, HELI_PAL, col);
    var spin = Math.floor(t * 16) % 2, rc = col([60, 60, 72]);
    if (spin) rect(ctx, x + 1, y - 1, 14, 1, rc);
    else rect(ctx, x + 5, y - 1, 6, 1, rc);
    rect(ctx, d > 0 ? x - 1 : x + 16, spin ? y + 2 : y + 4, 1, 1, rc);
    if (night) {
        rect(ctx, d > 0 ? x : x + 15, y + 2, 1, 1, Math.floor(t * 1.5) % 2 === 0 ? "#ff5050" : "#5a2020");
        rect(ctx, d > 0 ? x + 9 : x + 6, y + 6, 1, 1, Math.floor(t * 2 + 0.3) % 3 === 0 ? "#ffffff" : "#80808a");
    }
}

// Dron de 9×3 que proyecta la hora en un holograma cian que tiembla y falla de vez en cuando.
// p hélices, a brazos, b cuerpo, k lente.
var DRONE = ["pp.....pp", ".aabbbaa.", "...bkb..."];
var DRONE_PAL = { p: [150, 150, 170], a: [60, 62, 80], b: [40, 42, 58], k: [90, 240, 255] };
function drawHolo(ctx, f, P, t, w) {
    var cx = Math.round(f.x), y = Math.round(f.y + Math.sin(t * 2) * 1.5), x = cx - 4;
    var cyan = "#5ff2ff", tick = Math.floor(t * 8);
    sprite(ctx, DRONE, x, y, false, DRONE_PAL, function (c) { return css(c); });
    if (tick % 2) { rect(ctx, x, y, 1, 1, "#1c1c28"); rect(ctx, x + 8, y, 1, 1, "#1c1c28"); }
    rect(ctx, cx, y + 2, 1, 1, tick % 6 < 3 ? "#bffcff" : cyan);
    // A ratos el holograma se apaga un instante o se le corre una fila.
    var g = hash2(Math.floor(f.id), tick);
    if (g < 0.04) return;
    var glitchRow = g < 0.16 ? Math.floor(g * 100) % 9 : -1, gx = glitchRow >= 0 ? (g < 0.1 ? 2 : -2) : 0;
    var hx = cx - 11, hy = y + 7;
    // Haz desde la lente que se abre hacia el holograma.
    ctx.globalAlpha = 0.12;
    for (var r = 0; r < 4; r++) rect(ctx, cx - r * 3, y + 3 + r, r * 6 + 1, 1, cyan);
    for (r = 0; r < 9; r++) {
        var ox = r === glitchRow ? gx : 0, edge = r === 0 || r === 8;
        ctx.globalAlpha = edge ? 0.45 : (r % 2 ? 0.1 : 0.2);
        rect(ctx, hx + ox, hy + r, 23, 1, cyan);
        if (!edge) {
            ctx.globalAlpha = 0.45;
            rect(ctx, hx + ox, hy + r, 1, 1, cyan);
            rect(ctx, hx + ox + 22, hy + r, 1, 1, cyan);
        }
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#c8fcff";
    var dots = clockDots(t);
    for (var i = 0; i < dots.length; i++) {
        var dy = dots[i][1] + 2;
        ctx.fillRect(hx + 3 + dots[i][0] + (dy === glitchRow ? gx : 0), hy + dy, 1, 1);
    }
    ctx.globalAlpha = 1;
}

// Espectáculo de drones de noche: llegan en nube, forman la hora (cada punto es un dron), la
// sostienen cambiando de color y se van por el otro lado. Si cambia el minuto, se reacomodan.
var SWARM_GAP = 3, SWARM_IN = 8, SWARM_OUT = 40;
function newDrone(w, f, R) {
    return { x: f.dir > 0 ? -4 - R() * 40 : w.W + 4 + R() * 40, y: f.y0 + R() * 24, ox: (R() - 0.5) * 60, oy: (R() - 0.5) * 18, ph: R(), dot: null };
}
function makeSwarm(w, d, R) {
    var f = { dir: d, age: 0, drones: [], x0: Math.round(w.W / 2 - 25 + (R() - 0.5) * w.W * 0.4), y0: Math.round(10 + R() * 10), mm: -1 };
    for (var i = 0; i < 44; i++) f.drones.push(newDrone(w, f, R));
    return f;
}
function stepSwarm(f, w, dt, R) {
    f.age += dt;
    var i, dr, now = new Date(), mm = now.getHours() * 60 + now.getMinutes();
    if (f.age >= SWARM_IN && f.age < SWARM_OUT && mm !== f.mm) {
        f.mm = mm;
        var dots = clockDots(now.getTime() / 1000, true);
        while (f.drones.length < dots.length) f.drones.push(newDrone(w, f, R));
        for (i = 0; i < f.drones.length; i++) f.drones[i].dot = i < dots.length ? dots[i] : null;
    }
    var gone = true, cx = f.x0 + 25, cy = f.y0 + 6;
    for (i = 0; i < f.drones.length; i++) {
        dr = f.drones[i];
        var tx, ty;
        if (f.age < SWARM_IN) { tx = cx + dr.ox; ty = cy + dr.oy; }
        else if (f.age < SWARM_OUT && dr.dot) { tx = f.x0 + dr.dot[0] * SWARM_GAP; ty = f.y0 + dr.dot[1] * SWARM_GAP; }
        else { tx = f.dir > 0 ? w.W + 10 + dr.ph * 30 : -10 - dr.ph * 30; ty = f.y0 - 8 + dr.oy * 0.6; }
        var dx = tx - dr.x, dy = ty - dr.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.01) {
            var mv = Math.min(dist, Math.min(dist * 1.6, 45) * dt);
            dr.x += dx / dist * mv;
            dr.y += dy / dist * mv;
        }
        if (dr.x > -4 && dr.x < w.W + 4) gone = false;
    }
    return f.age > SWARM_OUT && gone;
}
function drawSwarm(ctx, f, P, t, w) {
    for (var i = 0; i < f.drones.length; i++) {
        var dr = f.drones[i], x = Math.round(dr.x), y = Math.round(dr.y);
        var lit = f.age >= SWARM_IN && f.age < SWARM_OUT + 2 && dr.dot;
        var c = lit ? css(mix(hue([255, 90, 120], t * 0.08 + dr.dot[0] * 0.025), [255, 255, 255], 0.3)) : "#dce8ff";
        ctx.globalAlpha = 0.22;
        skyDot(ctx, w, x - 1, y, c, 3);
        skyDot(ctx, w, x, y - 1, c);
        skyDot(ctx, w, x, y + 1, c);
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3 + dr.ph * 6);
        skyDot(ctx, w, x, y, c);
    }
    ctx.globalAlpha = 1;
}

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
    var lc = "#7dffa0";
    if (night) {
        ctx.globalAlpha = 0.25;
        rect(ctx, x - 10, y - 3, 21, 6, lc);
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = lc;
    var dots = clockDots(t);
    for (var i = 0; i < dots.length; i++) ctx.fillRect(x - 8 + dots[i][0], y - 2 + dots[i][1], 1, 1);
    if (night) {
        if (Math.floor(t * 1.3) % 2 === 0) rect(ctx, bx(-22, 1), y, 1, 1, "#ff5050");
        rect(ctx, bx(20, 1), y, 1, 1, "#ffffff");
    }
}

// Auto de 10×4 o autobús de 16×5, apoyado en la fila car.y.
function drawCar(ctx, car, P) {
    if (car.kind) return VEHICLES[car.kind](ctx, car, P);
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
    if (b.kind === "canoe") return drawCanoe(ctx, b, P, t);
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

// ---------- escena: playa ----------
// Comparte con la ciudad el cielo, las nubes, el clima, la gente, los barcos y las aves; cambia el
// paisaje (mar abierto, cabo con faro, arena con sombrillas, palmeras) y agrega bañistas,
// cangrejos, una fogata de noche y el haz del faro. Aquí no nieva (la nieve se vuelve lluvia).

var BEACH_UMBRELLAS = [["#e8504a", "#f4f0e8"], ["#3a7ad0", "#f4f0e8"], ["#f2c14e", "#e8504a"], ["#4fb3a0", "#f4f0e8"],
    ["#e87ab0", "#f6e6a0"], ["#7a5fc0", "#f2c14e"]];
var TOWELS = ["#e8504a", "#3a7ad0", "#f2c14e", "#4fb3a0", "#e87ab0", "#f4f0e8"];
var RINGS = ["#e8504a", "#f2c14e", "#4fb3a0", "#e87ab0"];

// Columna de pantalla de la columna x del cabo (x = 0 en el borde de la pantalla).
function capeX(w, x) { return w.cape.side < 0 ? x : w.W - 1 - x; }

function createBeach(W, H, seed, opts) {
    var R = rng(seed || 7), i, x;
    var w = { W: W, H: H, opts: opts || {}, scene: "beach", noSnow: true };
    w.yW = Math.round(H * 0.5);        // horizonte del mar
    w.base = w.yW;                     // el sol sale y se pone en el mar
    w.axis = w.yW - 1;
    w.yP = Math.round(H * 0.72);       // orilla
    w.wBot = w.yP;                     // fondo del agua para ondas y brillos
    w.ground = w.yP + 4;
    w.windows = []; w.antennas = []; w.signs = []; w.tvs = []; w.leds = []; w.screens = [];
    w.ads = []; w.bigAds = []; w.refl = []; w.layers = [[], [], []];
    w.lamps = []; w.benches = []; w.trees = []; w.hedge = [];

    // Cabo rocoso con faro en un lado: alto junto al borde y con acantilado en la punta.
    var side = R() < 0.5 ? -1 : 1, cw = Math.round(W * (0.18 + R() * 0.07)), ch = Math.round(H * (0.1 + R() * 0.04));
    var p1 = R() * 6, p2 = R() * 6;
    w.cape = { side: side, w: cw, top: [] };
    w.span = side < 0 ? [0.3, 0.92] : [0.08, 0.7];
    for (x = 0; x < cw; x++) {
        var u = x / cw;
        var hgt = ch * (1 - Math.pow(u, 3)) + 2 * Math.sin(x * 0.09 + p1) + Math.sin(x * 0.23 + p2);
        w.cape.top.push(Math.round(w.yW - Math.max(1, hgt)));
    }
    var li = Math.round(cw * 0.6);
    for (i = -4; i <= 4; i++) w.cape.top[li + i] = w.cape.top[li];
    var lx = capeX(w, li), ly = w.cape.top[li];
    w.lighthouse = { x: lx, y: ly, lampX: lx, lampY: ly - 19 };

    // Islas lejanas del otro lado.
    w.islands = [];
    var ix = side < 0 ? W * (0.7 + R() * 0.15) : W * (0.15 + R() * 0.15);
    w.islands.push({ x: Math.round(ix), w: Math.round(W * (0.05 + R() * 0.04)), h: ri(R, 4, 8) });
    w.islands.push({ x: Math.round(ix + (side < 0 ? -1 : 1) * W * (0.08 + R() * 0.05)), w: Math.round(W * 0.025), h: ri(R, 2, 4) });

    // Silueta contra el cielo: horizonte, cabo, faro e islas.
    w.sky = [];
    for (x = 0; x < W; x++) w.sky.push(w.yW);
    for (x = 0; x < cw; x++) w.sky[capeX(w, x)] = w.cape.top[x];
    for (i = -2; i <= 2; i++) if (lx + i >= 0 && lx + i < W) w.sky[lx + i] = ly - 22;
    for (i = 0; i < w.islands.length; i++) {
        var is = w.islands[i];
        for (x = -is.w; x <= is.w; x++) {
            var sx = is.x + x;
            if (sx >= 0 && sx < W) w.sky[sx] = Math.min(w.sky[sx], w.yW - Math.round(is.h * Math.sqrt(1 - (x / is.w) * (x / is.w))));
        }
    }

    genSky(w, R);

    // Ondas fijas del mar: más largas cerca de la orilla, por la perspectiva.
    w.waterLines = [];
    for (var y = w.yW + 1; y < w.yP - 1; y += 2) {
        var near = (y - w.yW) / (w.yP - w.yW);
        for (i = 0; i < Math.round(W / 26); i++)
            w.waterLines.push({ x: ri(R, 0, W - 1), y: y, len: Math.round((2 + R() * 6) * (0.5 + 1.5 * near)), light: R() < 0.5 });
    }

    // Arena: granos y conchitas.
    w.sand = [];
    for (i = 0; i < Math.round(W * (H - w.ground) / 50); i++)
        w.sand.push({ x: ri(R, 0, W - 1), y: ri(R, w.ground + 1, H - 1), light: R() < 0.5 });
    w.shells = [];
    for (i = 0; i < Math.round(W / 50); i++)
        w.shells.push({ x: ri(R, 0, W - 1), y: ri(R, w.yP + 3, H - 2), col: rgb(pick(R, ["#f4ece0", "#f0c8c0", "#e6d8f2"])) });

    // Fila de sombrillas; una es la torre del salvavidas y otra la fogata.
    w.rowY = w.yP + 34;
    w.spots = [];
    for (x = ri(R, 20, 50); x < W - 20; x += ri(R, 46, 78)) {
        var cols = pick(R, BEACH_UMBRELLAS);
        w.spots.push({ kind: "umbrella", x: x, y: w.rowY + ri(R, -2, 2), col: [rgb(cols[0]), rgb(cols[1])], towel: rgb(pick(R, TOWELS)),
            chair: R() < 0.4, bather: R() < 0.55, skin: rgb(pick(R, SKINS)), suit: rgb(pick(R, TOPS)) });
    }
    if (w.spots.length >= 3) {
        var tw = ri(R, 0, w.spots.length - 1), fi = (tw + 1 + ri(R, 0, w.spots.length - 2)) % w.spots.length;
        w.spots[tw].kind = "tower";
        w.spots[fi].kind = "fire";
    }
    w.castle = { x: ri(R, 30, W - 30), y: w.yP + 22 };
    // Cosas planas en la arena de enfrente (la gente puede pasar encima).
    w.props = [];
    var kinds = ["towel", "towel", "ball", "board", "bucket", "steps", "steps"];
    for (i = 0; i < Math.round(W / 55); i++) {
        var py = ri(R, w.rowY + 6, H - 8);
        if (py >= H - 6) continue;
        w.props.push({ kind: pick(R, kinds), x: ri(R, 10, W - 20), y: py, col: rgb(pick(R, TOWELS)), skin: rgb(pick(R, SKINS)),
            suit: rgb(pick(R, TOPS)), bather: R() < 0.6, dir: R() < 0.5 ? 1 : -1 });
    }

    // Carriles: tres a la orilla del agua y el resto delante de las sombrillas.
    w.lanes = [w.yP + 5, w.yP + 10, w.yP + 15];
    for (y = w.rowY + 8; y < H - 3; y += 6) w.lanes.push(y);

    // Palmeras: una grande del lado de las islas y una baja del lado del cabo (no tapa el faro).
    var far = side < 0 ? 1 : -1;
    w.palms = [
        makePalm(R, far > 0 ? W - ri(R, 6, 22) : ri(R, 6, 22), -far, Math.round(H * (0.3 + R() * 0.06))),
        makePalm(R, far > 0 ? ri(R, 2, 14) : W - ri(R, 2, 14), far, Math.round(H * (0.56 + R() * 0.05)))
    ];
    w.tufts = [];
    for (x = ri(R, 0, 20); x < W; x += ri(R, 30, 90)) w.tufts.push({ x: x, n: ri(R, 4, 8), seed: ri(R, 0, 999) });

    initLife(w, R);
    w.swimmers = [];
    w.critters = [];
    w.timers.swim = 0;
    w.timers.crab = 8;
    return w;
}

function makePalm(R, x, lean, top) {
    var p = { x: x, lean: lean, top: top, bend: ri(R, 14, 24), fronds: [] };
    var A = [-Math.PI + 0.1, -Math.PI + 0.5, -Math.PI + 0.95, -Math.PI / 2 - 0.25, -Math.PI / 2 + 0.3, -0.95, -0.5, -0.1,
        Math.PI - 0.45, 0.45];
    for (var i = 0; i < A.length; i++)
        p.fronds.push({ a: A[i] + (R() - 0.5) * 0.2, len: ri(R, 24, 34), droop: 0.3 + R() * 0.45 });
    return p;
}

// Capa de la playa: mar, cabo, faro, arena, sombrillas y castillo (se repinta cada ~30 s).
function drawBeach(ctx, w, P, t) {
    var W = w.W, H = w.H, yW = w.yW, yP = w.yP, hour = P.hour, i, x, y;
    ctx.clearRect(0, 0, W, H);

    // Mar: más oscuro en el horizonte y turquesa cerca de la orilla cuando hay sol.
    var deep = P.waterDeep, shore = mix(P.water, [64, 186, 190], 0.45 * P.amb * (1 - P.rain * 0.7));
    for (y = yW; y < yP + 2; y += 2)
        rect(ctx, 0, y, W, 2, css(mix(deep, shore, Math.pow((y - yW) / (yP - yW), 0.8))));
    rect(ctx, 0, yW, W, 1, css(mix(P.hor, deep, 0.4)));
    ctx.globalAlpha = 0.35;
    var wl = css(mix(P.water, [255, 255, 255], 0.25)), wd = css(mul(P.waterDeep, 0.8));
    for (i = 0; i < w.waterLines.length; i++) {
        var l = w.waterLines[i];
        rect(ctx, l.x, l.y, l.len, 1, l.light ? wl : wd);
    }
    ctx.globalAlpha = 1;

    // Islas lejanas, casi del color del horizonte.
    var isl = css(mix(lit([86, 112, 104], P), P.haze, 0.6));
    for (i = 0; i < w.islands.length; i++) {
        var is = w.islands[i];
        for (x = -is.w; x <= is.w; x++) {
            var hh = Math.round(is.h * Math.sqrt(1 - (x / is.w) * (x / is.w)));
            if (hh > 0) rect(ctx, is.x + x, yW - hh, 1, hh, isl);
        }
    }

    // Cabo: roca con pasto arriba; la cara del acantilado (la punta) más oscura.
    var rock = mix(lit([138, 120, 108], P), P.haze, 0.25), grass = mix(lit([98, 140, 84], P), P.haze, 0.25);
    var cape = w.cape, rockC = css(rock), rockD = css(mul(rock, 0.84)), rockF = css(mul(rock, 0.72)), rockL = css(mix(rock, [255, 240, 220], 0.15));
    var grassC = css(grass), grassD = css(mul(grass, 0.78));
    for (x = 0; x < cape.w; x++) {
        var sx = capeX(w, x), top = cape.top[x], u = x / cape.w, face = u > 0.78;
        rect(ctx, sx, top, 1, yW + 2 - top, face ? rockF : rockC);
        // Estratos: líneas oscuras cada pocos pixeles, cortadas en tramos.
        for (y = top + 4 + Math.floor(hash2(Math.floor(x / 9), 4) * 3); y < yW; y += 5)
            if (hash2(Math.floor(x / 6), y) < 0.7) rect(ctx, sx, y, 1, 1, face ? css(mul(rock, 0.6)) : rockD);
        if (!face && hash2(Math.floor(x / 5), 9) < 0.3) rect(ctx, sx, top + 3, 1, 2, rockL);
        if (yW - top > 3) {
            var gh = face ? 1 : 2 + Math.floor(hash2(Math.floor(x / 4), 11) * 2);
            rect(ctx, sx, top, 1, gh, grassC);
            rect(ctx, sx, top + gh, 1, 1, grassD);
        }
    }
    // Espuma al pie del cabo.
    ctx.globalAlpha = 0.6;
    for (x = 0; x < cape.w; x += 3) rect(ctx, capeX(w, x), yW + 2, 2, 1, css(lit([236, 244, 248], P)));
    ctx.globalAlpha = 1;
    drawLighthouse(ctx, w, P);

    // Neblina sobre el mar y el cabo.
    if (P.fog > 0.02) {
        ctx.fillStyle = css(P.fogc);
        for (y = yW - 40; y < yP; y += 2) {
            var mu = 1 - Math.abs(y - yW) / 42;
            ctx.globalAlpha = 0.55 * P.fog * clamp(mu, 0.15, 1);
            ctx.fillRect(0, y, W, 2);
        }
        ctx.globalAlpha = 1;
    }

    // Arena: mojada junto al agua y seca más arriba; con lluvia toda se oscurece.
    var wet = lit([184, 158, 120], P), dry = mix(lit([228, 206, 160], P), wet, P.rain * 0.55);
    rect(ctx, 0, yP, W, H - yP, css(dry));
    rect(ctx, 0, yP, W, 4, css(wet));
    rect(ctx, 0, yP + 4, W, 2, css(mix(wet, dry, 0.5)));
    var sl = css(mix(dry, [255, 255, 255], 0.25)), sd = css(mul(dry, 0.86));
    for (i = 0; i < w.sand.length; i++) rect(ctx, w.sand[i].x, w.sand[i].y, 1, 1, w.sand[i].light ? sl : sd);
    for (i = 0; i < w.shells.length; i++) rect(ctx, w.shells[i].x, w.shells[i].y, 2, 1, css(lit(w.shells[i].col, P)));

    drawCastle(ctx, w.castle, dry, P);
    var open = hour >= 8.5 && hour < 19 && P.rain < 0.35;
    for (i = 0; i < w.props.length; i++) drawProp(ctx, w.props[i], P, open, dry);

    // Sombrillas abiertas de día y sin lluvia; de noche se cierran y se van las toallas.
    var spots = w.spots.slice().sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < spots.length; i++) {
        var s = spots[i];
        if (s.kind === "tower") drawTower(ctx, s, P);
        else if (s.kind === "fire") drawFirePit(ctx, s, P);
        else drawUmbrella(ctx, s, P, open, dry);
    }
}

function drawLighthouse(ctx, w, P) {
    var L = w.lighthouse, x = L.x, y = L.y;
    var white = lit([238, 236, 230], P), red = lit([206, 70, 64], P), dark = css(lit([52, 52, 64], P));
    white = mix(white, P.haze, 0.2); red = mix(red, P.haze, 0.2);
    // Torre de 5 a 3 de ancho con franjas rojas.
    for (var r = 0; r < 16; r++) {
        var wd = r < 6 ? 5 : (r < 12 ? 4 : 3), x0 = x - Math.floor(wd / 2);
        var col = Math.floor(r / 4) % 2 ? red : white;
        rect(ctx, x0, y - 1 - r, wd, 1, css(col));
        rect(ctx, x0 + wd - 1, y - 1 - r, 1, 1, css(mul(col, 0.82)));
    }
    rect(ctx, x - 2, y - 17, 5, 1, dark);                     // balcón
    rect(ctx, x - 1, y - 20, 3, 3, P.night > 0.35 ? "#fff1b8" : css(mix([150, 190, 210], P.hor, 0.4)));
    rect(ctx, x - 1, y - 21, 3, 1, css(red));                 // techo
    rect(ctx, x, y - 22, 1, 1, dark);
    rect(ctx, x - 3, y - 2, 2, 2, css(mul(white, 0.9)));      // casita al pie
    rect(ctx, x - 3, y - 3, 2, 1, css(red));
}

function drawCastle(ctx, c, sand, P) {
    var x = c.x, y = c.y, s = css(mix(sand, [150, 120, 80], 0.25)), d = css(mix(sand, [110, 86, 60], 0.4));
    rect(ctx, x - 6, y - 3, 13, 3, s);
    rect(ctx, x - 6, y - 6, 3, 3, s); rect(ctx, x + 4, y - 6, 3, 3, s);
    rect(ctx, x - 1, y - 7, 3, 4, s);
    rect(ctx, x - 6, y - 7, 1, 1, s); rect(ctx, x - 4, y - 7, 1, 1, s);
    rect(ctx, x + 4, y - 7, 1, 1, s); rect(ctx, x + 6, y - 7, 1, 1, s);
    rect(ctx, x, y - 2, 1, 2, d);                              // puerta
    rect(ctx, x + 6, y - 6, 1, 6, d); rect(ctx, x - 6, y, 13, 1, d);
    rect(ctx, x, y - 10, 1, 3, css(lit([90, 80, 70], P)));     // banderita
    rect(ctx, x + 1, y - 10, 2, 1, css(lit([220, 70, 70], P)));
}

function drawUmbrella(ctx, s, P, open, sand) {
    var x = s.x, y = s.y, pole = css(lit([90, 80, 76], P));
    var c0 = lit(s.col[0], P), c1 = lit(s.col[1], P);
    if (open) {
        // Sombra, toalla, bañista y camastro.
        ctx.globalAlpha = 0.25 * P.amb;
        ell(ctx, x + 2, y + 1, 9, 1.5, css(mul(sand, 0.5)));
        ctx.globalAlpha = 1;
        var tw = lit(s.towel, P);
        rect(ctx, x - 12, y - 1, 10, 3, css(tw));
        rect(ctx, x - 12, y, 10, 1, css(mix(tw, [255, 255, 255], 0.4)));
        if (s.bather && P.amb > 0.7) {
            var sk = css(lit(s.skin, P));
            rect(ctx, x - 11, y - 1, 2, 2, sk);
            rect(ctx, x - 9, y - 1, 3, 2, css(lit(s.suit, P)));
            rect(ctx, x - 6, y - 1, 4, 1, sk);
        }
        if (s.chair) {
            var ch = css(lit([240, 240, 236], P)), fr = css(lit([120, 110, 100], P));
            rect(ctx, x + 3, y - 3, 7, 1, ch);
            rect(ctx, x + 9, y - 6, 1, 3, ch); rect(ctx, x + 10, y - 7, 1, 1, ch);
            rect(ctx, x + 3, y - 2, 1, 2, fr); rect(ctx, x + 9, y - 2, 1, 2, fr);
        }
        rect(ctx, x, y - 15, 1, 15, pole);
        // Toldo a gajos de dos colores.
        var rows = [[2, -18], [4, -17], [6, -16], [7, -15]];
        for (var r = 0; r < rows.length; r++)
            for (var k = -rows[r][0]; k <= rows[r][0]; k++) {
                var col = Math.floor((k + 7) / 3) % 2 ? c1 : c0;
                rect(ctx, x + k, y + rows[r][1], 1, 1, css(r === 3 ? mul(col, 0.85) : col));
            }
        ctx.fillStyle = css(mul(c0, 0.8));
        for (k = -7; k <= 7; k += 2) ctx.fillRect(x + k, y - 14, 1, 1);
        rect(ctx, x, y - 19, 1, 1, pole);
        return;
    }
    // Cerrada: el toldo enrollado en el palo.
    rect(ctx, x, y - 15, 1, 15, pole);
    rect(ctx, x, y - 18, 1, 1, css(c0));
    rect(ctx, x - 1, y - 17, 3, 6, css(c0));
    rect(ctx, x, y - 16, 1, 4, css(c1));
    rect(ctx, x, y - 11, 1, 1, css(c0));
}

// Torre del salvavidas; la bandera dice cómo está el mar.
function drawTower(ctx, s, P) {
    var x = s.x, y = s.y, wood = css(lit([150, 116, 84], P)), woodD = css(lit([110, 84, 62], P));
    rect(ctx, x - 5, y - 13, 1, 13, wood); rect(ctx, x + 5, y - 13, 1, 13, wood);
    for (var k = 0; k < 4; k++) rect(ctx, x - 4 + k * 2, y - 4 - k * 2, 2, 1, woodD);
    for (k = 0; k < 4; k++) rect(ctx, x + 6, y - 2 - k * 3, 2, 1, woodD);   // escalera
    rect(ctx, x - 6, y - 13, 13, 1, woodD);
    rect(ctx, x - 5, y - 20, 11, 7, css(lit([236, 236, 232], P)));
    rect(ctx, x - 3, y - 18, 7, 3, P.night > 0.5 ? "#3a3c50" : css(mix([140, 180, 210], P.hor, 0.3)));
    rect(ctx, x - 6, y - 22, 13, 2, css(lit([210, 64, 60], P)));
    rect(ctx, x + 7, y - 30, 1, 17, css(lit([80, 80, 90], P)));
    var flag = P.rain > 0.5 ? [214, 60, 56] : (P.rain > 0.1 || P.fog > 0.3 ? [240, 200, 60] : [70, 170, 80]);
    rect(ctx, x + 8, y - 30, 4, 3, css(lit(flag, P)));
}

function drawFirePit(ctx, s, P) {
    var x = s.x, y = s.y;
    var stone = css(lit([120, 116, 120], P)), log = css(lit([96, 66, 46], P)), logD = css(lit([70, 48, 36], P));
    for (var k = -5; k <= 5; k += 2) rect(ctx, x + k, y + (Math.abs(k) > 3 ? -1 : 0), 1, 1, stone);
    rect(ctx, x - 3, y - 1, 7, 1, log);
    rect(ctx, x - 2, y - 2, 2, 1, logD); rect(ctx, x + 1, y - 2, 2, 1, logD);
}

// Palmeras y matas de pasto de duna delante de todo.
function drawPalms(ctx, w, P) {
    var H = w.H, i, k;
    var trunk = lit([140, 106, 74], P), trunkD = css(mul(trunk, 0.75)), trunkL = css(mix(trunk, [255, 240, 210], 0.2));
    var leaf = lit([62, 132, 72], P), leafD = css(mul(leaf, 0.7)), leafL = css(mix(leaf, [200, 230, 150], 0.3));
    var nut = css(lit([96, 70, 44], P));
    for (i = 0; i < w.palms.length; i++) {
        var p = w.palms[i], n = H + 4 - p.top;
        for (var r = 0; r <= n; r++) {
            var u = r / n, py = H + 4 - r, px = Math.round(p.x + p.lean * p.bend * u * u);
            var wd = u < 0.4 ? 4 : 3;
            rect(ctx, px - 1, py, wd, 1, r % 4 === 0 ? trunkD : css(trunk));
            rect(ctx, px - 1, py, 1, 1, r % 4 === 0 ? trunkD : trunkL);
        }
        var cx = Math.round(p.x + p.lean * p.bend), cy = p.top;
        // Primero las hojas de atrás (oscuras), luego las de enfrente.
        for (var pass = 0; pass < 2; pass++)
            for (k = 0; k < p.fronds.length; k++) {
                var f = p.fronds[k];
                if ((k % 2) !== pass) continue;
                var lc = pass ? css(leaf) : leafD;
                for (var st = 0; st <= f.len; st++) {
                    var v = st / f.len;
                    var fx = Math.round(cx + Math.cos(f.a) * st), fy = Math.round(cy + Math.sin(f.a) * st * 0.8 + f.droop * v * v * f.len * 0.9);
                    rect(ctx, fx, fy, 2, 2, lc);
                    if (pass) rect(ctx, fx, fy, 1, 1, leafL);
                    // Hojuelas que cuelgan, más largas a media hoja; algunas apuntan hacia arriba.
                    if (st > 1) {
                        var lh = Math.round(1 + 4 * Math.sin(v * Math.PI)) + (st % 2);
                        rect(ctx, fx + (st % 2), fy + 2, 1, lh, st % 3 === 0 ? leafD : lc);
                        if (st % 3 === 1 && v < 0.8) rect(ctx, fx, fy - 1 - (st % 2), 1, 1 + (st % 2), lc);
                    }
                }
            }
        disc(ctx, cx - 2, cy + 2, 1.5, nut);
        disc(ctx, cx + 2, cy + 3, 1.5, nut);
        rect(ctx, cx - 1, cy - 1, 3, 2, leafD);
    }
    var grass = css(lit([96, 128, 70], P)), grassD = css(lit([70, 98, 56], P));
    for (i = 0; i < w.tufts.length; i++) {
        var tf = w.tufts[i];
        for (k = 0; k < tf.n; k++) {
            var hh = 3 + Math.floor(hash2(tf.seed, k) * 6), lean = k < tf.n / 2 ? -1 : 1;
            rect(ctx, tf.x + k * 2, H - hh, 1, hh, k % 2 ? grass : grassD);
            rect(ctx, tf.x + k * 2 + lean, H - hh - 1, 1, 1, grass);
        }
    }
}

// Capa ambiental de la playa (4 fps): olas, espuma en la orilla, haz del faro y fogata.
function drawBeachAmbient(ctx, w, P, t) {
    var W = w.W, yP = w.yP, i, x, k;
    var foam = css(lit([246, 248, 250], P));

    // Olas que llegan: líneas de espuma que avanzan hacia la orilla y se desvanecen.
    ctx.fillStyle = foam;
    for (k = 0; k < 3; k++) {
        var ph = (t / 6 + k / 3) % 1, cyc = Math.floor(t / 6 + k / 3), wy = Math.round(yP - 16 + ph * 15);
        ctx.globalAlpha = 0.45 * Math.sin(ph * Math.PI);
        for (x = 0; x < W; x += 6) {
            if (hash2(x + k * 977, cyc) < 0.35) continue;
            ctx.fillRect(x, wy + (hash2(x, cyc + 5) < 0.3 ? 1 : 0), 6, 1);
        }
    }

    // La orilla: el agua sube por la arena y se retira.
    var s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 7);
    var sheet = css(mix(P.water, [110, 200, 200], 0.3 * P.amb));
    for (x = 0; x < W; x++) {
        var reach = Math.round(s * (3 + 2 * Math.sin(x * 0.07 + 1.3) + Math.sin(x * 0.19)));
        if (reach <= 0) continue;
        ctx.globalAlpha = 0.7;
        rect(ctx, x, yP, 1, reach, sheet);
        ctx.globalAlpha = 0.85;
        rect(ctx, x, yP + reach, 1, 1, foam);
    }
    ctx.globalAlpha = 1;

    // Faro: haz que gira, con destello cuando apunta hacia nosotros.
    if (P.night > 0.35) {
        var L = w.lighthouse, ang = t * 0.7, c = Math.cos(ang), dir = c > 0 ? 1 : -1, len = Math.round(110 * Math.abs(c));
        var k2 = P.night * (1 - P.rain * 0.4);
        ctx.fillStyle = "#fff4c8";
        for (var dx = 2; dx < len; dx++) {
            var hh = 1 + Math.floor(dx * 0.07);
            ctx.globalAlpha = 0.24 * k2 * (1 - dx / len);
            ctx.fillRect(L.lampX + dir * dx, L.lampY - hh, 1, hh * 2 + 1);
        }
        var glow = Math.pow(Math.max(0, Math.sin(ang)), 6);
        ctx.globalAlpha = (0.2 + 0.5 * glow) * k2;
        disc(ctx, L.lampX, L.lampY, 2 + glow * 4, "#fff4c8");
        ctx.globalAlpha = 1;
    }

    // Fogata de noche (si no llueve).
    var hour = P.hour;
    if (P.night > 0.5 && P.rain < 0.2 && (hour >= 19 || hour < 1.5)) {
        for (i = 0; i < w.spots.length; i++) {
            if (w.spots[i].kind !== "fire") continue;
            drawFlames(ctx, w.spots[i].x, w.spots[i].y - 2, t);
        }
    }
}

// Llamas, resplandor y chispas de una fogata con base en (fx, fy).
function drawFlames(ctx, fx, fy, t) {
    var tick = Math.floor(t * 4), k;
    ctx.globalAlpha = 0.12;
    ell(ctx, fx, fy + 2, 18, 5, "#ffb060");
    ell(ctx, fx, fy - 4, 9, 7, "#ffb060");
    ctx.globalAlpha = 1;
    for (k = -2; k <= 2; k++) {
        var fh = 2 + Math.floor(hash2(k + 9, tick) * (4 - Math.abs(k)));
        rect(ctx, fx + k, fy - fh, 1, fh, "#ff8a30");
        rect(ctx, fx + k, fy - Math.max(1, fh - 2), 1, Math.max(1, fh - 2), "#ffd060");
        if (hash2(k, tick + 3) < 0.4) rect(ctx, fx + k, fy - fh - 1, 1, 1, "#e85030");
    }
    for (k = 0; k < 3; k++) {
        var up = (t * 6 + k * 5) % 14;
        ctx.globalAlpha = 1 - up / 14;
        rect(ctx, fx - 1 + Math.round(Math.sin(t * 2 + k * 2) * 2), fy - 6 - up, 1, 1, "#ffc060");
    }
    ctx.globalAlpha = 1;
}

// Bañistas (de día y sin lluvia) y cangrejos que corren de lado por la orilla.
function stepBeach(w, dt, hour, P) {
    var R = Math.random, T = w.timers, W = w.W, i, j;
    var swim = hour >= 9 && hour < 18.5 && P.rain < 0.3 && P.fog < 0.5;
    var want = swim ? Math.round(5 * Math.max(1, W / 480) * busy(hour)) : 0;
    T.swim -= dt;
    if (T.swim <= 0) {
        T.swim = 3 + R() * 6;
        if (w.swimmers.length < want) {
            w.swimmers.push({ x: 10 + R() * (W - 20), y: w.yP - 4 - Math.floor(R() * 12), dir: R() < 0.5 ? 1 : -1,
                speed: R() < 0.4 ? 0 : 1.5 + R() * 2, ph: R() * 6, ring: R() < 0.3 ? rgb(pick(R, RINGS)) : null,
                skin: rgb(pick(R, SKINS)), hair: rgb(pick(R, HAIRS)) });
        } else if (w.swimmers.length > want) {
            w.swimmers.splice(Math.floor(R() * w.swimmers.length), 1);
        }
    }
    for (i = 0; i < w.swimmers.length; i++) {
        var s = w.swimmers[i];
        s.x += s.dir * s.speed * dt;
        s.ph += dt;
        if (s.x < 6 || s.x > W - 6) s.dir = -s.dir;
    }

    T.crab -= dt;
    if (T.crab <= 0) {
        T.crab = 25 + R() * 50;
        if (w.critters.length < 2 && P.rain < 0.5) {
            var cd = R() < 0.5 ? 1 : -1;
            w.critters.push({ kind: "crab", x: cd > 0 ? -6 : W + 6, y: w.yP + 3 + Math.floor(R() * 4), dir: cd, run: true, tm: 1 + R() * 2, dist: 0 });
        }
    }
    for (i = w.critters.length - 1; i >= 0; i--) {
        var c = w.critters[i];
        c.tm -= dt;
        if (c.tm <= 0) {
            c.run = !c.run;
            c.tm = c.run ? 1 + R() * 2.5 : 0.5 + R() * 2;
        }
        // Si alguien pasa cerca, sale corriendo hacia el otro lado.
        for (j = 0; j < w.people.length; j++) {
            var q = w.people[j];
            if (Math.abs(q.x - c.x) < 10 && Math.abs(q.y - c.y) < 6) { c.run = true; c.dir = q.x < c.x ? 1 : -1; c.tm = 1.2; break; }
        }
        if (c.run) { c.x += c.dir * 11 * dt; c.dist += 11 * dt; }
        if (c.x < -10 || c.x > W + 10) w.critters.splice(i, 1);
    }
}

function drawSwimmer(ctx, s, P, t) {
    var x = Math.round(s.x), y = Math.round(s.y + Math.sin(s.ph * 2) * 0.6), d = s.dir;
    var skin = css(lit(s.skin, P)), hair = css(lit(s.hair, P));
    var ripple = css(mix(lit([235, 245, 250], P), P.water, 0.3));
    if (s.ring) {
        var rc = lit(s.ring, P);
        rect(ctx, x - 3, y + 1, 7, 2, css(rc));
        rect(ctx, x - 1, y + 1, 1, 2, css(lit([244, 244, 240], P)));
        rect(ctx, x + 2, y + 1, 1, 2, css(lit([244, 244, 240], P)));
    }
    rect(ctx, x - 1, y - 1, 3, 1, hair);
    rect(ctx, x - 1, y, 3, 2, skin);
    rect(ctx, d > 0 ? x - 1 : x + 1, y, 1, 1, hair);
    ctx.globalAlpha = 0.6;
    rect(ctx, x - 3, y + 2, 7, 1, ripple);
    ctx.globalAlpha = 1;
    if (!s.ring && s.speed > 0) {
        // Brazada de crol.
        var f = Math.floor(s.ph * 3) % 4;
        if (f === 0) rect(ctx, x + d * 3, y, 1, 2, skin);
        else if (f === 1) rect(ctx, x + d * 2, y - 2, 1, 2, skin);
        else if (f === 2) rect(ctx, x - d * 2, y - 1, 1, 2, skin);
        else rect(ctx, x - d * 3, y + 1, 2, 1, ripple);
    }
}

// Cangrejo de 7×4: e ojos, c caparazón, k tenazas.
var CRAB = {
    a: ["..e.e..", "k.ccc.k", "kccccck", "c.c.c.c"],
    b: ["..e.e..", "k.ccc.k", "kccccck", ".c.c.c."]
};
var CRAB_PAL = { e: [36, 24, 24], c: [212, 86, 62], k: [232, 116, 84] };
function drawCrab(ctx, c, P, t) {
    var f = c.run && Math.floor(c.dist / 2) % 2 ? CRAB.b : CRAB.a;
    sprite(ctx, f, Math.round(c.x) - 3, Math.round(c.y) - 3, false, CRAB_PAL, function (v) { return css(lit(v, P)); });
}

// Toallas, pelota, tabla, cubeta y huellas en la arena de enfrente.
function drawProp(ctx, o, P, open, sand) {
    var x = o.x, y = o.y;
    if (o.kind === "steps") {
        ctx.fillStyle = css(mul(sand, 0.86));
        for (var k = 0; k < 8; k++) ctx.fillRect(x + o.dir * k * 4, y + (k % 2) * 2 - Math.floor(k / 3), 2, 1);
        return;
    }
    if (o.kind === "bucket") {
        rect(ctx, x, y - 3, 3, 3, css(lit(o.col, P)));
        rect(ctx, x, y - 3, 3, 1, css(mul(lit(o.col, P), 0.8)));
        rect(ctx, x + 4, y - 4, 1, 4, css(lit([200, 190, 80], P)));
        return;
    }
    if (!open) return;
    if (o.kind === "ball") {
        rect(ctx, x, y - 3, 3, 3, css(lit([240, 240, 236], P)));
        rect(ctx, x, y - 3, 1, 3, css(lit([220, 70, 70], P)));
        rect(ctx, x + 2, y - 3, 1, 3, css(lit([60, 120, 210], P)));
        return;
    }
    if (o.kind === "board") {
        var bc = lit(o.col, P);
        rect(ctx, x + 1, y - 2, 12, 2, css(bc));
        rect(ctx, x, y - 1, 1, 1, css(bc)); rect(ctx, x + 13, y - 1, 1, 1, css(bc));
        rect(ctx, x + 1, y - 1, 12, 1, css(mix(bc, [255, 255, 255], 0.35)));
        return;
    }
    // Toalla, a veces con alguien asoleándose.
    var tw = lit(o.col, P);
    rect(ctx, x, y - 2, 11, 3, css(tw));
    rect(ctx, x, y - 1, 11, 1, css(mix(tw, [255, 255, 255], 0.4)));
    if (o.bather && P.amb > 0.7) {
        var sk = css(lit(o.skin, P)), hx = o.dir > 0 ? x + 1 : x + 8;
        rect(ctx, hx, y - 2, 2, 2, sk);
        rect(ctx, o.dir > 0 ? x + 3 : x + 5, y - 2, 3, 2, css(lit(o.suit, P)));
        rect(ctx, o.dir > 0 ? x + 6 : x + 1, y - 2, 4, 1, sk);
    }
}

// ---------- escena: montaña ----------
// Cordilleras con picos nevados que se reflejan en un lago, bosque de pinos y una cabaña con
// chimenea y muelle en la orilla de enfrente. Excursionistas con mochila, venados al amanecer y al
// atardecer, un águila que planea, canoas, peces que saltan, luciérnagas en verano y fogata de noche.

// Cresta de una cordillera: picos triangulares (pendiente slope) más ruido por punto medio.
function makeRidge(R, W, base, hiH, loH, nPeaks, slope, rough) {
    var peaks = [], top = [], x, i;
    for (i = 0; i < nPeaks; i++)
        peaks.push({ x: (i + 0.2 + R() * 0.6) / nPeaks * W * 1.1 - W * 0.05, h: loH + R() * (hiH - loH), s: slope * (0.7 + R() * 0.6) });
    var n = 1;
    while (n < W) n *= 2;
    var noise = [];
    for (x = 0; x <= n; x++) noise.push(0);
    for (var st = n; st > 1; st /= 2)
        for (x = 0; x < n; x += st)
            noise[x + st / 2] = (noise[x] + noise[x + st]) / 2 + (R() - 0.5) * rough * Math.min(st, 32) / 8;
    // face[x]: 1 si la ladera mira a la izquierda (del lado izquierdo de su pico), -1 si a la derecha.
    top.face = [];
    for (x = 0; x < W; x++) {
        var h = loH * 0.35, f = 0;
        for (i = 0; i < peaks.length; i++) {
            var hp = peaks[i].h - Math.abs(x - peaks[i].x) * peaks[i].s;
            if (hp > h) { h = hp; f = x < peaks[i].x ? 1 : -1; }
        }
        top.push(Math.round(base - h + noise[x]));
        top.face.push(f);
    }
    return top;
}

function createMountain(W, H, seed, opts) {
    var R = rng(seed || 7), i, x, y;
    var w = { W: W, H: H, opts: opts || {}, scene: "mountain", noGulls: true, noBoats: true };
    w.yW = Math.round(H * 0.6);        // orilla lejana del lago, al pie de los cerros
    w.base = w.yW;
    w.axis = w.yW - 1;
    w.yP = Math.round(H * 0.75);       // orilla de enfrente
    w.wBot = w.yP;
    w.ground = w.yP + 2;
    w.windows = []; w.antennas = []; w.signs = []; w.tvs = []; w.leds = []; w.screens = [];
    w.ads = []; w.bigAds = []; w.refl = []; w.layers = [[], [], []];
    w.lamps = []; w.benches = []; w.trees = []; w.hedge = [];

    // Picos nevados al fondo, cerros con bosque y lomas de pinos junto al lago.
    w.ranges = [
        makeRidge(R, W, w.yW, H * 0.37, H * 0.2, Math.round(W / 120) + 2, 0.8, 2.5),
        makeRidge(R, W, w.yW, H * 0.2, H * 0.09, Math.round(W / 90) + 2, 0.45, 1.5),
        makeRidge(R, W, w.yW, H * 0.08, H * 0.03, Math.round(W / 70) + 2, 0.3, 1)
    ];
    // Bosque sobre la loma de enfrente: pinos en fila sobre la cresta.
    w.ridgePines = [];
    for (x = ri(R, -4, 2); x < W + 4; x += ri(R, 3, 6)) w.ridgePines.push({ x: x, h: ri(R, 5, 11) });
    // Línea de nieve de los picos (fila desde la que empieza la roca).
    var hi = w.yW;
    for (x = 0; x < W; x++) hi = Math.min(hi, w.ranges[0][x]);
    w.snowLine = Math.round(hi + (w.yW - hi) * 0.4);

    // Cabaña en un lado, con el muelle y la fogata hacia el centro.
    var side = R() < 0.5 ? -1 : 1;
    var cx = Math.round(side < 0 ? W * (0.16 + R() * 0.1) : W * (0.74 + R() * 0.1));
    w.cabin = { x: cx, y: w.yP + 6, side: side, roof: rgb(pick(R, ["#8a3a32", "#3a5a4a", "#4a4a5a", "#7a4a2a"])) };
    w.dock = { x: cx - side * 26, len: 30, dir: -side, y: w.yP - 2 };
    w.fire = { x: cx - side * 30, y: w.yP + 24 };
    w.chimney = { x: cx + side * 8, y: w.cabin.y - 34 };

    // Pinos en la orilla de enfrente, lejos de la cabaña y el muelle.
    w.pines = [];
    for (x = ri(R, 4, 20); x < W - 4; x += ri(R, 14, 40)) {
        if (Math.abs(x - cx) < 34 || Math.abs(x - w.dock.x - w.dock.dir * 15) < 22) continue;
        w.pines.push({ x: x, y: w.yP + ri(R, 3, 6), h: ri(R, 16, 28) });
    }

    // Silueta contra el cielo: la cordillera más alta en cada columna, más los pinos de la loma.
    w.sky = [];
    for (x = 0; x < W; x++) w.sky.push(Math.min(w.ranges[0][x], w.ranges[1][x], w.ranges[2][x]));
    for (i = 0; i < w.ridgePines.length; i++) {
        var rp = w.ridgePines[i];
        for (x = -2; x <= 2; x++) {
            var px = rp.x + x;
            if (px >= 0 && px < W) w.sky[px] = Math.min(w.sky[px], w.ranges[2][clamp(rp.x, 0, W - 1)] - rp.h + Math.abs(x) * 2);
        }
    }

    genSky(w, R);

    w.waterLines = [];
    for (y = w.yW + 2; y < w.yP - 1; y += 2)
        for (i = 0; i < Math.round(W / 34); i++)
            w.waterLines.push({ x: ri(R, 0, W - 1), y: y, len: ri(R, 3, 12), light: R() < 0.5 });

    // Pradera: pasto, flores, piedras y el sendero.
    w.grass = [];
    for (i = 0; i < Math.round(W * (H - w.ground) / 40); i++)
        w.grass.push({ x: ri(R, 0, W - 1), y: ri(R, w.ground + 1, H - 1), light: R() < 0.5 });
    w.flowers = [];
    for (i = 0; i < Math.round(W / 9); i++)
        w.flowers.push({ x: ri(R, 0, W - 1), y: ri(R, w.yP + 20, H - 2), col: rgb(pick(R, ["#f0e060", "#f4f0f0", "#c080e0", "#f08080", "#80b0f0"])) });
    w.rocks = [];
    for (i = 0; i < Math.round(W / 120) + 1; i++) w.rocks.push({ x: ri(R, 10, W - 10), y: ri(R, w.yP + 32, H - 6), r: ri(R, 3, 6) });
    w.trailY = w.yP + 9;
    w.lanes = [w.trailY + 2, w.trailY + 6];
    for (y = w.yP + 34; y < H - 3; y += 7) w.lanes.push(y);

    // Pinos grandes delante de todo, en las orillas de la pantalla.
    w.bigPines = [
        { x: side < 0 ? W - ri(R, 4, 16) : ri(R, 4, 16), y: H + 2, h: Math.round(H * (0.5 + R() * 0.1)) },
        { x: side < 0 ? W - ri(R, 26, 40) : ri(R, 26, 40), y: H + 2, h: Math.round(H * (0.32 + R() * 0.08)) },
        { x: side < 0 ? ri(R, -6, 4) : W - ri(R, -4, 6), y: H + 2, h: Math.round(H * (0.26 + R() * 0.06)) }
    ];
    w.bushes = [];
    for (x = ri(R, -4, 10); x < W + 8; x += ri(R, 30, 70)) w.bushes.push({ x: x, r: ri(R, 4, 7) });

    initLife(w, R);
    w.critters = [];
    w.eagle = null;
    w.timers.deer = 5;
    w.timers.eagle = 20;
    w.timers.canoe = 10;
    return w;
}

// Color de una cordillera según la profundidad (0 al fondo): más lejos, más del color del cielo.
function rangeCol(c, P, d) {
    var k = mix(mul(c, P.amb), P.hor, 0.1);
    k = mix(k, [24, 26, 58], (1 - P.amb) * 0.35);
    return mix(k, P.haze, [0.5, 0.28, 0.12][d]);
}

// Las tres cordilleras con nieve, bosque y pinos; también sirve para el reflejo del lago.
function drawRanges(ctx, w, P) {
    var W = w.W, yW = w.yW, x, y, d;
    var sun = sunPos(w, P.hour);
    // Luz de lado: por la mañana se iluminan las laderas que miran a la izquierda.
    var side = sun ? clamp((W / 2 - sun.x) / (W * 0.3), -1, 1) * (1 - P.rain) : 0;
    var sc = P.snowCover, snowLine = w.snowLine + Math.round(sc * (yW - w.snowLine) * 0.7);
    var snow = lit([240, 244, 250], P), snowS = mix(lit([196, 206, 232], P), P.haze, 0.2);
    var bases = [[116, 122, 150], [62, 92, 88], [44, 76, 62]];
    for (d = 0; d < 3; d++) {
        var top = w.ranges[d], base = rangeCol(bases[d], P, d);
        var lightC = mix(base, [255, 240, 210], 0.16), darkC = mul(base, 0.8);
        var dust = d === 1 ? clamp(sc * 1.4 - 0.3, 0, 0.8) : (d === 2 ? clamp(sc * 1.2 - 0.4, 0, 0.6) : 0);
        for (x = 0; x < W; x++) {
            // Cada pico tiene una cara de luz y otra de sombra, en tres tonos.
            var t0 = top[x], amt = d === 2 ? 0 : top.face[x] * side;     // la loma de pinos va pareja
            var col = amt > 0.25 ? lightC : (amt < -0.25 ? darkC : base);
            if (dust > 0) col = mix(col, rangeCol([220, 226, 240], P, d), dust);
            rect(ctx, x, t0, 1, yW - t0, css(col));
            if (d === 0) {
                // Nieve arriba de la línea (con orilla irregular) y vetas de roca.
                var sl = snowLine + Math.round(5 * Math.sin(x * 0.11 + 1.7) + 3 * Math.sin(x * 0.29) + (hash2(x, 7) - 0.5) * 3);
                if (t0 < sl) rect(ctx, x, t0, 1, sl - t0, css(amt < -0.25 ? snowS : snow));
                if (hash2(x, 3) < 0.25) rect(ctx, x, Math.max(t0 + 2, sl) + Math.floor(hash2(x, 5) * 7), 1, 2, css(mul(col, 0.85)));
            } else {
                // Textura de bosque: puntos claros y oscuros.
                for (y = t0 + 2; y < yW; y += 3)
                    if (hash2(x * 7 + d, y) < 0.3) rect(ctx, x, y, 1, 1, css(hash2(x, y + d) < 0.5 ? darkC : mix(col, [255, 255, 255], 0.06)));
            }
        }
        if (d === 2) {
            var pc = mul(base, 0.85), pcs = css(pc), psn = css(mix(rangeCol([226, 232, 244], P, 2), pc, 0.2));
            for (var i = 0; i < w.ridgePines.length; i++) {
                var rp = w.ridgePines[i], ry = top[clamp(rp.x, 0, W - 1)];
                for (var r = 0; r < rp.h; r++) {
                    var hw = Math.floor(r * 0.35);
                    rect(ctx, rp.x - hw, ry - rp.h + r, hw * 2 + 1, 1, pcs);
                    if (sc > 0.3 && r % 3 === 0) rect(ctx, rp.x - hw, ry - rp.h + r, hw + 1, 1, psn);
                }
            }
        }
        // Neblina que separa las cordilleras.
        if (P.fog > 0.02) {
            var fh = Math.round(w.yW * 0.5), fa = [0.5, 0.4, 0.28][d] * P.fog;
            ctx.fillStyle = css(P.fogc);
            for (var fy = 0; fy < fh; fy += 2) {
                var u = 1 - fy / fh;
                ctx.globalAlpha = fa * u * u;
                ctx.fillRect(0, yW - fy - 2, W, 2);
            }
            ctx.globalAlpha = 1;
        }
    }
}

// Pino de varios pisos con base en (x, y) y altura h; la nieve se queda en lo alto de cada piso.
function drawPine(ctx, x, y, h, P, k) {
    var base = lit([40, 82, 62], P);
    if (k) base = mix(base, P.haze, k);
    var mid = css(base), dark = css(mul(base, 0.7)), light = css(mix(base, [180, 220, 150], 0.18));
    var trunk = css(lit([86, 60, 44], P)), sc = P.snowCover;
    var snow = css(lit([236, 240, 248], P)), ts = Math.max(4, Math.round(h / 6));
    var fol = h - Math.max(2, Math.round(h * 0.12)), top = y - h;
    rect(ctx, x - 1, top + fol - 1, 3, h - fol + 1, trunk);
    for (var r = 0; r < fol; r++) {
        var hw = Math.floor((r % ts) * 0.75 + r * 0.2) + (r > 0 ? 1 : 0);
        rect(ctx, x - hw, top + r, hw + 1, 1, mid);
        rect(ctx, x + 1, top + r, hw, 1, dark);
        if (r % ts === ts - 1) { rect(ctx, x - hw, top + r, 2, 1, light); rect(ctx, x + hw - 1, top + r, 2, 1, dark); }
        if (sc > 0.1 && r % ts < (sc > 0.5 ? 2 : 1)) rect(ctx, x - hw, top + r, hw + (sc > 0.5 ? Math.ceil(hw / 2) : 0) + 1, 1, snow);
    }
}

function drawMountain(ctx, w, P, t) {
    var W = w.W, H = w.H, yW = w.yW, yP = w.yP, hour = P.hour, i, x, y;
    ctx.clearRect(0, 0, W, H);
    drawRanges(ctx, w, P);

    // Lago con el reflejo de las montañas.
    var lake = mix(P.water, [40, 92, 96], 0.25 * P.amb), lakeD = mix(P.waterDeep, [30, 70, 80], 0.2 * P.amb);
    for (y = yW; y < yP; y += 2) rect(ctx, 0, y, W, 2, css(mix(lake, lakeD, (y - yW) / (yP - yW))));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, yW, W, yP - yW);
    ctx.clip();
    ctx.globalAlpha = 0.4;
    ctx.translate(0, 2 * w.axis + 1);
    ctx.scale(1, -1);
    drawRanges(ctx, w, P);
    ctx.restore();
    ctx.globalAlpha = 0.45 + 0.15 * P.night;
    for (y = yW; y < yP; y += 2) rect(ctx, 0, y, W, 2, css(mix(lake, lakeD, (y - yW) / (yP - yW))));
    ctx.globalAlpha = 0.35;
    var wl = css(mix(lake, [255, 255, 255], 0.25)), wd = css(mul(lakeD, 0.8));
    for (i = 0; i < w.waterLines.length; i++) {
        var l = w.waterLines[i];
        rect(ctx, l.x, l.y, l.len, 1, l.light ? wl : wd);
    }
    ctx.globalAlpha = 1;
    rect(ctx, 0, yW, W, 1, css(mul(rangeCol([44, 76, 62], P, 2), 0.7)));
    if (P.fog > 0.02) {
        ctx.fillStyle = css(P.fogc);
        for (y = yW - 10; y < yP; y += 2) {
            ctx.globalAlpha = 0.5 * P.fog * clamp(1 - (y - yW) / (yP - yW + 10), 0.1, 1);
            ctx.fillRect(0, y, W, 2);
        }
        ctx.globalAlpha = 1;
    }

    // Muelle de madera con una lancha de remos amarrada.
    var D = w.dock, wood = lit([132, 98, 70], P), woodC = css(wood), woodD = css(mul(wood, 0.7));
    var dx0 = D.dir > 0 ? D.x : D.x - D.len;
    rect(ctx, dx0, D.y, D.len, 2, woodC);
    rect(ctx, dx0, D.y + 2, D.len, 1, woodD);
    for (x = 0; x < D.len; x += 3) rect(ctx, dx0 + x, D.y, 1, 1, woodD);
    for (x = 2; x < D.len; x += 9) rect(ctx, dx0 + x, D.y + 3, 1, 3, woodD);
    var bxx = D.dir > 0 ? dx0 + D.len - 12 : dx0 + 2, by = D.y - 6;
    var hull = lit([60, 110, 150], P);
    rect(ctx, bxx, by + 2, 10, 2, css(hull));
    rect(ctx, bxx + 1, by + 4, 8, 1, css(mul(hull, 0.7)));
    rect(ctx, bxx, by + 2, 10, 1, css(mix(hull, [255, 255, 255], 0.3)));
    rect(ctx, bxx + 3, by + 1, 1, 1, woodD); rect(ctx, bxx + 6, by + 1, 1, 1, woodD);

    // Pradera de enfrente (blanca si nevó), con sendero de tierra.
    var sc = P.snowCover, snowC = lit([236, 240, 248], P);
    var grass = mix(lit([98, 142, 74], P), snowC, clamp(sc * 1.1, 0, 0.92));
    rect(ctx, 0, yP, W, H - yP, css(grass));
    rect(ctx, 0, yP, W, 2, css(mix(lit([150, 140, 118], P), snowC, sc * 0.8)));
    rect(ctx, 0, yP + 2, W, 1, css(mul(grass, 0.85)));
    var gl = css(mix(grass, [255, 255, 230], 0.18)), gd = css(mul(grass, 0.85));
    for (i = 0; i < w.grass.length; i++) rect(ctx, w.grass[i].x, w.grass[i].y, 1, 1, w.grass[i].light ? gl : gd);
    var dirt = mix(lit([170, 140, 100], P), snowC, sc * 0.6), dirtC = css(dirt), dirtD = css(mul(dirt, 0.88));
    for (x = 0; x < W; x++) {
        var e0 = Math.round(Math.sin(x * 0.05) * 1.2 + hash2(x >> 1, 31)), e1 = Math.round(Math.sin(x * 0.04 + 2) * 1.2 + hash2(x >> 1, 37));
        rect(ctx, x, w.trailY - e0, 1, 9 + e0 + e1, dirtC);
        if (hash2(x, 41) < 0.2) rect(ctx, x, w.trailY + 2 + Math.floor(hash2(x, 43) * 5), 1, 1, dirtD);
    }
    var m = new Date().getMonth();
    if (m >= 3 && m <= 8 && sc < 0.3)
        for (i = 0; i < w.flowers.length; i++) rect(ctx, w.flowers[i].x, w.flowers[i].y, 1, 1, css(lit(w.flowers[i].col, P)));
    for (i = 0; i < w.rocks.length; i++) {
        var rk = w.rocks[i], rc = lit([132, 130, 136], P);
        ell(ctx, rk.x, rk.y, rk.r, rk.r * 0.6, css(mul(rc, 0.75)));
        ell(ctx, rk.x - 1, rk.y - 1, rk.r - 1, Math.max(1, rk.r * 0.6 - 1), css(rc));
        if (sc > 0.2) rect(ctx, rk.x - rk.r + 2, rk.y - Math.round(rk.r * 0.6), rk.r * 2 - 3, 1, css(snowC));
    }

    // Pinos de la orilla, la cabaña y la fogata, por profundidad.
    var items = w.pines.map(function (p) { return { y: p.y, p: p }; });
    items.push({ y: w.cabin.y, c: 1 });
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) {
        if (items[i].c) drawCabin(ctx, w, P, hour);
        else drawPine(ctx, items[i].p.x, items[i].p.y, items[i].p.h, P, 0.08);
    }
    var F = w.fire, stone = css(lit([126, 122, 128], P)), log = css(lit([96, 66, 46], P)), logD = css(lit([70, 48, 36], P));
    for (var k = -5; k <= 5; k += 2) rect(ctx, F.x + k, F.y + (Math.abs(k) > 3 ? -1 : 0), 1, 1, stone);
    rect(ctx, F.x - 3, F.y - 1, 7, 1, log);
    rect(ctx, F.x - 2, F.y - 2, 2, 1, logD); rect(ctx, F.x + 1, F.y - 2, 2, 1, logD);
    // Troncos para sentarse.
    rect(ctx, F.x - 16, F.y - 2, 8, 3, log); rect(ctx, F.x - 16, F.y - 2, 1, 3, logD);
    rect(ctx, F.x + 9, F.y - 1, 8, 3, log); rect(ctx, F.x + 16, F.y - 1, 1, 3, logD);
    if (sc > 0.2) { rect(ctx, F.x - 16, F.y - 3, 8, 1, css(snowC)); rect(ctx, F.x + 9, F.y - 2, 8, 1, css(snowC)); }
}

// ¿Hay alguien en la cabaña? Luces encendidas al anochecer y temprano en la mañana.
function cabinLit(hour) { return (hour >= 17.5 && hour < 23.5) || (hour >= 5.3 && hour < 7.2); }

function drawCabin(ctx, w, P, hour) {
    var C = w.cabin, x = C.x, y = C.y, cw = 36, half = 18, wallH = 14, roofH = 15, i, r;
    var log = lit([150, 104, 66], P), logC = css(log), logD = css(mul(log, 0.72)), logL = css(mix(log, [255, 230, 190], 0.15));
    var roof = lit(C.roof, P), roofC = css(roof), roofD = css(mul(roof, 0.7));
    var sc = P.snowCover, snow = css(lit([238, 242, 250], P));
    var on = cabinLit(hour) && P.night > 0.25;
    var glass = on ? "#ffd27a" : css(mix(lit([120, 150, 170], P), P.hor, 0.35));
    var wy = y - wallH;
    // Base de piedra y paredes de troncos (las puntas sobresalen en las esquinas).
    rect(ctx, x - half, y - 2, cw, 2, css(lit([120, 116, 120], P)));
    for (r = 0; r < wallH - 2; r += 2) {
        rect(ctx, x - half, wy + r, cw, 2, logC);
        rect(ctx, x - half, wy + r + 1, cw, 1, logD);
        rect(ctx, x - half - 1 - (r % 4 ? 0 : 1), wy + r, 2, 2, logL);
        rect(ctx, x + half - 1 + (r % 4 ? 0 : 1), wy + r, 2, 2, logL);
    }
    // Hastial (triángulo) con troncos, alero del techo y ventanita.
    for (r = 0; r < roofH; r++) {
        var hw = Math.round((r + 1) * (half + 3) / roofH), ry = wy - roofH + r;
        rect(ctx, x - hw, ry, hw * 2 + 1, 1, r % 2 ? logD : logC);
        rect(ctx, x - hw, ry, 3, 1, roofC);
        rect(ctx, x + hw - 2, ry, 3, 1, roofC);
        rect(ctx, x - hw, ry + 1, 1, 1, roofD);
        rect(ctx, x + hw, ry + 1, 1, 1, roofD);
        if (sc > 0.1) { rect(ctx, x - hw, ry - 1, 2, 1, snow); rect(ctx, x + hw - 1, ry - 1, 2, 1, snow); }
    }
    rect(ctx, x - half - 3, wy, cw + 6, 1, roofD);
    rect(ctx, x - 2, wy - 8, 5, 4, css(lit([90, 64, 44], P)));
    rect(ctx, x - 1, wy - 7, 3, 2, glass);
    // Chimenea de piedra.
    var ch = w.chimney, stone = lit([128, 120, 118], P);
    rect(ctx, ch.x - 2, ch.y, 5, wy - ch.y - 4, css(stone));
    rect(ctx, ch.x - 3, ch.y, 7, 2, css(mul(stone, 0.8)));
    for (i = ch.y + 3; i < wy - 4; i += 3) rect(ctx, ch.x - 2 + (i % 2) * 2, i, 2, 1, css(mul(stone, 0.85)));
    if (sc > 0.2) rect(ctx, ch.x - 3, ch.y - 1, 7, 1, snow);
    // Puerta y ventanas.
    var door = lit([96, 64, 42], P);
    rect(ctx, x - 3, y - 11, 7, 9, css(door));
    rect(ctx, x - 3, y - 11, 7, 1, css(mul(door, 0.7)));
    rect(ctx, x + 2, y - 7, 1, 1, css(lit([210, 180, 90], P)));
    for (i = -1; i <= 1; i += 2) {
        var wx = x + i * 11 - 3;
        rect(ctx, wx - 1, y - 11, 8, 7, css(lit([226, 214, 190], P)));
        rect(ctx, wx, y - 10, 6, 5, glass);
        rect(ctx, wx + 3, y - 10, 1, 5, css(lit([226, 214, 190], P)));
        rect(ctx, wx, y - 8, 6, 1, css(lit([226, 214, 190], P)));
        if (!on) rect(ctx, wx, y - 10, 2, 1, css(mix(lit([200, 220, 235], P), P.hor, 0.2)));
        rect(ctx, wx - 1, y - 4, 8, 1, css(lit([120, 150, 80], P)));       // jardinera
        if (sc > 0.2) rect(ctx, wx - 1, y - 5, 8, 1, snow);
    }
    // Leña apilada junto a la cabaña.
    var lx = x - C.side * (half + 7), wd = css(lit([120, 84, 56], P)), wdl = css(lit([196, 160, 110], P));
    for (r = 0; r < 3; r++)
        for (i = 0; i < 4 - r; i++) {
            rect(ctx, lx - 6 + i * 3 + r, y - 3 - r * 3, 3, 3, wd);
            rect(ctx, lx - 5 + i * 3 + r, y - 2 - r * 3, 1, 1, wdl);
        }
    if (sc > 0.2) rect(ctx, lx - 4, y - 10, 7, 1, snow);
    // Luz de las ventanas sobre el piso y farol junto a la puerta.
    if (on) {
        ctx.globalAlpha = 0.14 * P.night;
        ell(ctx, x - 11, y + 4, 9, 2, "#ffd27a");
        ell(ctx, x + 11, y + 4, 9, 2, "#ffd27a");
        ell(ctx, x, y + 3, 6, 2, "#ffd27a");
        ctx.globalAlpha = 0.25;
        disc(ctx, x + 6, y - 9, 4, "#ffd890");
        ctx.globalAlpha = 1;
        rect(ctx, x + 6, y - 10, 1, 2, "#fff0c0");
    }
}

// Pinos grandes y matorrales delante de todo.
function drawMountainFront(ctx, w, P) {
    var i;
    for (i = 0; i < w.bigPines.length; i++) drawPine(ctx, w.bigPines[i].x, w.bigPines[i].y, w.bigPines[i].h, P, 0);
    var b = lit([50, 84, 58], P), sc = P.snowCover;
    var dark = css(mul(b, 0.7)), mid = css(mix(b, lit([236, 240, 248], P), clamp(sc - 0.2, 0, 0.8)));
    for (i = 0; i < w.bushes.length; i++) disc(ctx, w.bushes[i].x, w.H + 2, w.bushes[i].r, dark);
    for (i = 0; i < w.bushes.length; i++) disc(ctx, w.bushes[i].x - 1, w.H + 3, w.bushes[i].r - 2, mid);
}

// Capa ambiental de la montaña (4 fps): humo de la chimenea, peces, luciérnagas y fogata.
function drawMountainAmbient(ctx, w, P, t) {
    var W = w.W, hour = P.hour, i, k;
    drawSmoke(ctx, P, w.chimney.x, w.chimney.y - 2, t, w.cabin.side,
        cabinLit(hour) || P.snowCover > 0.2 || w.month >= 10 || w.month <= 2 ? 1 : 0.45);

    // Peces que saltan: arco y círculos en el agua.
    if (P.amb > 0.4 && P.rain < 0.3) {
        var cyc = Math.floor(t / 7), ph = t % 7;
        if (ph < 2.2 && hash2(cyc, 51) < 0.7) {
            var fx = Math.round(W * (0.1 + hash2(cyc, 52) * 0.8)), fy = Math.round(w.yW + 6 + hash2(cyc, 53) * (w.yP - w.yW - 12));
            var ring = css(mix(P.water, [255, 255, 255], 0.5));
            if (ph < 0.6) {
                var a = ph / 0.6, hx = fx + Math.round((a - 0.5) * 8), hy = fy - Math.round(Math.sin(a * Math.PI) * 6);
                rect(ctx, hx - 1, hy, 3, 1, css(lit([150, 160, 170], P)));
            }
            for (k = 0; k < 2; k++) {
                var rr = (ph - k * 0.4) * 5;
                if (rr <= 0) continue;
                ctx.globalAlpha = clamp(0.6 - rr / 14, 0, 1);
                rect(ctx, fx - Math.round(rr), fy, 2, 1, ring);
                rect(ctx, fx + Math.round(rr) - 1, fy, 2, 1, ring);
                rect(ctx, fx - Math.round(rr * 0.5), fy - 1, Math.round(rr) + 1, 1, ring);
                rect(ctx, fx - Math.round(rr * 0.5), fy + 1, Math.round(rr) + 1, 1, ring);
            }
            ctx.globalAlpha = 1;
        }
    }

    drawFireflies(ctx, w, P, t, w.yP + 4, w.H - 6);

    // Fogata del anochecer, si no llueve.
    if (P.night > 0.4 && P.rain < 0.2 && (hour >= 18.5 && hour < 23.5)) drawFlames(ctx, w.fire.x, w.fire.y - 2, t);
}

// Venados al amanecer y al atardecer, el águila de día y alguna canoa en el lago.
function stepMountain(w, dt, hour, P) {
    var R = Math.random, T = w.timers, W = w.W, i, j;
    var dusk = (hour >= 5.3 && hour < 8.5) || (hour >= 17.3 && hour < 20.5);
    T.deer -= dt;
    if (T.deer <= 0) {
        T.deer = 40 + R() * 60;
        if (dusk && P.rain < 0.5 && w.critters.length === 0) {
            var dir = R() < 0.5 ? 1 : -1, n = 1 + Math.floor(R() * 3), y0 = w.yP + 22 + R() * (w.H - w.yP - 30);
            for (j = 0; j < n; j++)
                w.critters.push({ kind: "deer", x: dir > 0 ? -12 - j * 14 : W + 12 + j * 14, y: Math.round(y0 + j * 4 - R() * 3),
                    dir: dir, state: "walk", tx: W * (0.2 + R() * 0.6) - dir * j * 14, tm: 60 + R() * 60, dist: 0, buck: j === 0 && R() < 0.6, look: 0 });
        }
    }
    for (i = w.critters.length - 1; i >= 0; i--) {
        var c = w.critters[i];
        c.tm -= dt;
        if (c.state !== "run") {
            for (j = 0; j < w.people.length; j++) {
                var q = w.people[j];
                if (Math.abs(q.x - c.x) < 26 && Math.abs(q.y - c.y) < 14) { c.state = "run"; c.dir = q.x < c.x ? 1 : -1; break; }
            }
        }
        if (c.state === "walk") {
            c.x += c.dir * 5 * dt; c.dist += 5 * dt;
            if (c.tm > 0 && (c.dir > 0 ? c.x >= c.tx : c.x <= c.tx)) { c.state = "graze"; c.look = 2 + R() * 4; }
        } else if (c.state === "graze") {
            c.look -= dt;
            if (c.look <= 0) {
                if (c.tm <= 0 || !dusk) { c.state = "walk"; c.tx = c.dir > 0 ? W + 40 : -40; }
                else { c.state = R() < 0.3 ? "walk" : "graze"; c.up = R() < 0.4; c.look = 1.5 + R() * 4; c.tx = c.x + c.dir * (6 + R() * 10); }
            }
        } else if (c.state === "run") {
            c.x += c.dir * 34 * dt; c.dist += 34 * dt;
        }
        if (c.x < -50 || c.x > W + 50) w.critters.splice(i, 1);
    }

    // Águila: planea en círculos amplios que se van corriendo.
    if (w.eagle) {
        var e = w.eagle;
        e.ph += dt * 0.35; e.cx += e.drift * dt; e.life -= dt;
        e.x = e.cx + Math.cos(e.ph) * e.r; e.y = e.cy + Math.sin(e.ph) * e.r * 0.3;
        if (e.life <= 0) e.cx += e.drift * dt * 8;
        // Velocidad horizontal: hacia dónde mira. Cerca de cero está dando la vuelta.
        e.vx = e.drift * (e.life <= 0 ? 9 : 1) - Math.sin(e.ph) * e.r * 0.35;
        // Aletea de vez en cuando unos segundos; casi siempre planea.
        if (e.flap > 0) e.flap -= dt;
        else {
            e.nextFlap = (e.nextFlap === undefined ? 3 + R() * 6 : e.nextFlap) - dt;
            if (e.nextFlap <= 0) { e.flap = 1.6; e.nextFlap = 7 + R() * 10; }
        }
        if (e.cx < -60 || e.cx > W + 60) w.eagle = null;
    } else {
        T.eagle -= dt;
        if (T.eagle <= 0) {
            T.eagle = 60 + R() * 120;
            if (P.amb > 0.6 && P.rain < 0.3) {
                var ed = R() < 0.5 ? 1 : -1;
                w.eagle = { cx: ed > 0 ? -40 : W + 40, cy: 20 + R() * w.yW * 0.3, r: 18 + R() * 14, ph: R() * 6, drift: ed * (3 + R() * 2), life: 60 + R() * 60 };
                w.eagle.x = w.eagle.cx; w.eagle.y = w.eagle.cy;
            }
        }
    }

    // Canoas de día.
    T.canoe -= dt;
    if (T.canoe <= 0) {
        T.canoe = 30 + R() * 60;
        if (hour >= 7 && hour < 19 && P.rain < 0.3 && w.boats.length < 1) {
            // Entra por el lado contrario a la cabaña y da la vuelta antes de llegar al muelle.
            var cd = w.cabin.side;
            w.boats.push({ kind: "canoe", x: cd > 0 ? -20 : W + 20, turn: w.cabin.x - cd * (70 + R() * 80), y: Math.round(w.yW + 1 + R() * 4), dir: cd, speed: 4 + R() * 3,
                skin: rgb(pick(R, SKINS)), top: rgb(pick(R, TOPS)), hull: rgb(pick(R, ["#d0603a", "#3a7ad0", "#e0b040", "#40905a"])), two: R() < 0.5 });
        }
    }
    for (i = 0; i < w.boats.length; i++) {
        var bo = w.boats[i];
        if (bo.turn !== null && (bo.dir > 0 ? bo.x >= bo.turn : bo.x <= bo.turn)) { bo.dir = -bo.dir; bo.turn = null; }
    }
}

// Águila calva de 19×9 vista de lado (mira a la derecha): planea con el ala larga echada hacia atrás,
// aletea (arriba, al nivel, abajo) y, al dar la vuelta en su círculo, se ve de frente con las alas abiertas.
var EAGLE = {
    glide: ["...................", ".f.f...............", "..ffwwww...........", "....wwwwwwww.......",
        "tt...bbbbbbbbbhh...", "tttbbbbbbbbbbbhhhy.", "tt....bbbbbbb......", "...................", "..................."],
    up: ["f.f................", ".ff................", "..fww..............", "...wwwwww..........",
        "tt...bbwwwwbbbhh...", "tttbbbbbbbbbbbhhhy.", "tt....bbbbbbb......", "...................", "..................."],
    level: ["...................", "...................", "...................", "..ffwwwwwwwww......",
        "tt...bbbbbbbbbhh...", "tttbbbbbbbbbbbhhhy.", "tt....bbbbbbb......", "...................", "..................."],
    down: ["...................", "...................", "...................", "...................",
        "tt...bbbbbbbbbhh...", "tttbbbbbbbbbbbhhhy.", "tt...wwwwwwwbb.....", "...wwwww...........", ".ff.f.............."],
    turn: ["...................", "...................", ".f.f...........f.f.", "..ffww...h...wwff..",
        "....wwwwbbbwwww....", ".......wbbbw.......", "........ttt........", ".......t.t.t.......", "..................."]
};
var EAGLE_PAL = { b: [84, 60, 44], w: [70, 50, 38], f: [46, 34, 28], h: [240, 238, 230], t: [240, 238, 230], y: [232, 180, 48] };

// Águila en la capa de vida.
function drawMountainLife(ctx, w, P, t) {
    var e = w.eagle;
    if (!e) return;
    var vx = e.vx || e.drift, f;
    if (Math.abs(vx) < 1.5) f = EAGLE.turn;
    else if (e.flap > 0) f = [EAGLE.up, EAGLE.level, EAGLE.down, EAGLE.level][Math.floor(e.flap * 5) % 4];
    else f = EAGLE.glide;
    var x = Math.round(e.x) - 9, y = Math.round(e.y) - 5, flip = vx < 0 && f !== EAGLE.turn;
    for (var r = 0; r < f.length; r++) {
        var row = f[r];
        for (var k = 0; k < row.length; k++) {
            var ch = row[flip ? row.length - 1 - k : k];
            if (ch !== ".") rect(ctx, x + k, y + r, 1, 1, css(lit(EAGLE_PAL[ch], P)));
        }
    }
}

// Canoa con uno o dos remeros.
function drawCanoe(ctx, b, P, t) {
    var x = Math.round(b.x), y = b.y, d = b.dir, hull = lit(b.hull, P);
    var skin = css(lit(b.skin, P)), top = css(lit(b.top, P)), pad = css(lit([110, 80, 56], P));
    ctx.globalAlpha = 0.4;
    for (var k = 0; k < 4; k++) rect(ctx, x - d * (10 + k * 4) - (d > 0 ? 3 : 0), y + 5 + (k % 2), 3, 1, "#e8f0ff");
    ctx.globalAlpha = 1;
    rect(ctx, x - 7, y + 3, 15, 2, css(hull));
    rect(ctx, x - 8, y + 2, 1, 2, css(hull)); rect(ctx, x + 8, y + 2, 1, 2, css(hull));
    rect(ctx, x - 6, y + 5, 13, 1, css(mul(hull, 0.65)));
    rect(ctx, x - 7, y + 3, 15, 1, css(mix(hull, [255, 255, 255], 0.3)));
    var seats = b.two ? [-3, 3] : [0];
    for (var i = 0; i < seats.length; i++) {
        var sx = x + seats[i], f = Math.floor(t * 1.5 + i) % 2;
        rect(ctx, sx, y - 2, 2, 2, skin);
        rect(ctx, sx, y, 2, 3, top);
        // Remo: alterna de lado.
        rect(ctx, sx + (f ? 2 : -1), y + 1, 1, 3, pad);
        rect(ctx, sx + (f ? 3 : -2), y + 4, 1, 2, pad);
    }
}

// Venado de 12×11 (mira a la derecha): parado, pastando y corriendo; a cornamenta, solo el macho.
var DEER = {
    stand: ["........a.a.", ".........a..", "........ehhh", "........hhkn", "t......hh...", "bbbbbbbbb...", ".bbbbbbbb...",
        ".bwwwwwb....", ".l.l..l.l...", ".l.l..l.l...", ".d.d..d.d..."],
    graze: ["............", "............", "............", "............", "t...........", "bbbbbbbbb...", ".bbbbbbbbh.a",
        ".bwwwwwb.hha", ".l.l..l.l.hh", ".l.l..l.l.hn", ".d.d..d.d..."],
    run1: ["........a.a.", ".........a..", "........ehhh", "........hhkn", "t......hh...", "bbbbbbbbb...", ".bbbbbbbb...",
        "lbwwwwwbbl..", "l........l..", "d.........d.", "............"],
    run2: ["............", "........a.a.", ".........a..", "........ehhh", "t.......hhkn", "bbbbbbbbhh..", ".bbbbbbbb...",
        ".bwwwwwb....", "..ll..ll....", "..d....d....", "............"]
};
var DEER_PAL = { b: [150, 100, 64], h: [140, 94, 60], e: [118, 78, 50], k: [30, 20, 20], n: [40, 30, 30], t: [238, 230, 216],
    w: [214, 190, 160], l: [122, 84, 56], d: [50, 40, 36], a: [206, 186, 150] };
function drawDeer(ctx, c, P, t) {
    var f = c.state === "run" ? (Math.floor(c.dist / 5) % 2 ? DEER.run1 : DEER.run2)
        : (c.state === "graze" && !c.up ? DEER.graze : DEER.stand);
    var walk = c.state === "walk" && Math.floor(c.dist / 3) % 2;
    var x = Math.round(c.x) - 6, y = Math.round(c.y) - 10, flip = c.dir < 0;
    for (var r = 0; r < f.length; r++) {
        var row = f[r];
        if (walk && r >= 8) row = r === 10 ? "d.d...d.d..." : "l.l...l.l...";
        for (var k = 0; k < row.length; k++) {
            var ch = row[flip ? row.length - 1 - k : k];
            if (ch === "." || (ch === "a" && !c.buck)) continue;
            rect(ctx, x + k, y + r, 1, 1, css(lit(DEER_PAL[ch], P)));
        }
    }
}

// Humo de chimenea: bocanadas que suben desde (x, y) y se doblan con el viento (wind = ±1).
function drawSmoke(ctx, P, x, y, t, wind, k) {
    var smoke = css(lit([214, 214, 220], P));
    for (var i = 0; i < 8; i++) {
        var age = (t * 0.12 + i / 8 + x * 0.013) % 1;
        ctx.globalAlpha = 0.4 * (1 - age) * k;
        disc(ctx, x + wind * age * age * 26 + Math.sin(t * 0.8 + i) * age * 2, y - age * 34, 1 + age * 3.5, smoke);
    }
    ctx.globalAlpha = 1;
}

// ---------- escena: pueblo nevado ----------
// Pueblo de montaña en invierno: casas de colores con techos cargados de nieve, iglesia, árbol de
// Navidad, guirnaldas de luces sobre la calle, puestos de mercado y una pista de hielo con
// patinadores. Siempre hay nieve en el suelo y casi siempre que hay precipitación es nieve. Algunas
// noches cruza el cielo un trineo con renos.

var HOUSE_COLS = ["#c8584a", "#d8c8a0", "#6a8ab0", "#7aa070", "#e0b060", "#b07a9a", "#e8e0d0", "#a0c0c8"];
var HOUSE_ROOFS = ["#5a3a34", "#3a3a48", "#4a4038", "#3a4a3a"];
var BULBS = [[255, 74, 74], [255, 208, 64], [64, 208, 96], [74, 138, 255], [255, 112, 208]];

function createVillage(W, H, seed, opts) {
    var R = rng(seed || 7), i, x, y;
    var w = { W: W, H: H, opts: opts || {}, scene: "village", noGulls: true, noBoats: true, noWater: true,
        alwaysSnow: true, minSnow: 0.85 };
    w.yS = Math.round(H * 0.64);       // pie de las casas
    w.yW = w.yS;
    w.base = w.yS;
    w.axis = w.yS;
    w.yP = w.yS + 16;                  // fin de la calle
    w.ground = w.yP;
    w.windows = []; w.antennas = []; w.signs = []; w.tvs = []; w.leds = []; w.screens = [];
    w.ads = []; w.bigAds = []; w.refl = []; w.layers = [[], [], []];
    w.lamps = []; w.benches = []; w.trees = []; w.hedge = [];

    // Lomas nevadas con bosque detrás del pueblo.
    w.hills = [
        makeRidge(R, W, w.yS, H * 0.3, H * 0.16, Math.round(W / 140) + 2, 0.35, 1.5),
        makeRidge(R, W, w.yS, H * 0.16, H * 0.07, Math.round(W / 100) + 2, 0.25, 1)
    ];
    w.forest = [];
    for (x = ri(R, -3, 2); x < W + 3; x += ri(R, 3, 5)) w.forest.push({ x: x, h: ri(R, 5, 10) });

    // Casas en fila; la iglesia cerca del centro.
    w.houses = [];
    var churchAt = Math.round(W * (0.35 + R() * 0.3)), church = null;
    for (x = ri(R, -12, 4); x < W + 6; ) {
        if (!church && x + 50 > churchAt) {
            church = { kind: "church", x: x, w: 40, wallH: Math.round(H * 0.1), roofH: 14, towerW: 14, towerH: Math.round(H * 0.22),
                col: rgb("#e4dccc"), roof: rgb("#4a4a5a"), towerLeft: R() < 0.5 };
            w.houses.push(church);
            x += 40 + ri(R, 2, 6);
            continue;
        }
        var hw = ri(R, 24, 42), kind = R() < 0.55 ? "gable" : "side";
        if (kind === "gable" && hw % 2) hw++;
        var h = { kind: kind, x: x, w: hw, wallH: ri(R, Math.round(H * 0.07), Math.round(H * 0.12)), roofH: kind === "gable" ? Math.round(hw * 0.55) : ri(R, 8, 12),
            col: rgb(pick(R, HOUSE_COLS)), roof: rgb(pick(R, HOUSE_ROOFS)), timber: R() < 0.3, wreath: R() < 0.6,
            chimney: R() < 0.75 ? ri(R, 4, hw - 8) : -1, seed: ri(R, 0, 9999), back: R() < 0.3 };
        if (h.back) { h.wallH += ri(R, 6, 12); }
        w.houses.push(h);
        x += hw + ri(R, -2, 5);
    }
    // Las de atrás (más altas) primero, para que las de enfrente las tapen.
    w.houses.sort(function (a, b) { return (b.back ? 1 : 0) - (a.back ? 1 : 0); });

    // Foquitos en los aleros de cada casa (se calculan una vez y se animan en la capa ambiental).
    w.bulbs = [];
    for (i = 0; i < w.houses.length; i++) {
        var hh = w.houses[i];
        if (hh.kind === "church") continue;
        var top = w.yS - hh.wallH, n = 0;
        if (hh.kind === "gable") {
            var cxh = hh.x + hh.w / 2;
            for (var r = 1; r < hh.roofH; r += 2) {
                var half = Math.round((r + 1) * (hh.w / 2 + 2) / hh.roofH);
                w.bulbs.push({ x: Math.round(cxh - half), y: top - hh.roofH + r + 1, c: n++ % BULBS.length });
                w.bulbs.push({ x: Math.round(cxh + half), y: top - hh.roofH + r + 1, c: n++ % BULBS.length });
            }
        } else {
            for (x = hh.x - 1; x <= hh.x + hh.w; x += 3) w.bulbs.push({ x: x, y: top + 1, c: n++ % BULBS.length });
        }
    }

    // Árbol de Navidad, puestos del mercado y faroles con guirnaldas sobre la acera.
    var treeX = Math.round(churchAt < W / 2 ? W * (0.62 + R() * 0.12) : W * (0.24 + R() * 0.12));
    w.xtree = { x: treeX, y: w.yS + 3, h: Math.round(H * 0.25), orn: [] };
    for (i = 0; i < 46; i++) {
        var oy = R(), ox = (R() - 0.5) * (0.2 + oy * 0.8);
        w.xtree.orn.push({ u: oy, v: ox, c: i % BULBS.length, ball: i % 3 === 0 });
    }
    w.stalls = [];
    for (i = 0; i < Math.max(1, Math.round(W / 300)); i++) {
        var sx = ri(R, 20, W - 40);
        if (Math.abs(sx - treeX) < 40) sx = (sx + Math.round(W / 2)) % (W - 40) + 10;
        w.stalls.push({ x: sx, y: w.yS + 3, col: rgb(pick(R, ["#c83a3a", "#3a6ac8", "#3a9a5a"])) });
    }
    for (x = ri(R, 16, 40); x < W - 6; x += ri(R, 70, 100))
        if (Math.abs(x - treeX) > 14) w.lamps.push(x);

    // Pista de hielo en la plaza.
    w.pond = { x: Math.round(W * (0.3 + R() * 0.4)), y: w.yP + 22, rx: Math.round(Math.max(44, W * 0.12)), ry: 9 };
    w.lanes = [w.yS + 8, w.yS + 13];
    for (y = w.pond.y + w.pond.ry + 8; y < H - 3; y += 7) w.lanes.push(y);
    w.flakes = [];
    for (i = 0; i < Math.round(W * (H - w.yP) / 60); i++) w.flakes.push({ x: ri(R, 0, W - 1), y: ri(R, w.yP + 1, H - 1) });
    w.snowman = { x: R() < 0.5 ? ri(R, 12, 40) : W - ri(R, 12, 40), y: H - 2 };
    // Bancas en la plaza (entre la calle y la pista, donde no camina nadie) y huellas en la nieve.
    w.pbenches = [];
    for (x = ri(R, 20, 60); x < W - 20; x += ri(R, 80, 140))
        if (Math.abs(x - w.pond.x) > w.pond.rx + 10) w.pbenches.push(x);
    w.steps = [];
    for (i = 0; i < Math.max(2, Math.round(W / 200)); i++)
        w.steps.push({ x: ri(R, 0, W - 1), y: w.yP + 4, dx: (R() - 0.5) * 1.6, n: ri(R, 12, 30) });
    w.drifts = [];
    for (x = ri(R, -6, 8); x < W + 8; x += ri(R, 24, 60)) w.drifts.push({ x: x, r: ri(R, 4, 8) });

    // Silueta contra el cielo: lomas, bosque, casas, iglesia y árbol.
    w.sky = [];
    for (x = 0; x < W; x++) w.sky.push(Math.min(w.hills[0][x], w.hills[1][x]));
    for (i = 0; i < w.forest.length; i++) {
        var fp = w.forest[i], fx = clamp(fp.x, 0, W - 1);
        for (x = -1; x <= 1; x++) if (fp.x + x >= 0 && fp.x + x < W) w.sky[fp.x + x] = Math.min(w.sky[fp.x + x], w.hills[1][fx] - fp.h);
    }
    for (i = 0; i < w.houses.length; i++)
        for (x = 0; x < W; x++) { var tp = houseTop(w, w.houses[i], x); if (tp < w.sky[x]) w.sky[x] = tp; }
    for (x = -10; x <= 10; x++) {
        var tx = treeX + x;
        if (tx >= 0 && tx < W) w.sky[tx] = Math.min(w.sky[tx], w.xtree.y - w.xtree.h + Math.abs(x) * 2);
    }

    genSky(w, R);
    initLife(w, R);
    w.rainChance = 0.3;
    w.critters = [];
    w.sleigh = null;
    w.timers.skate = 0;
    w.timers.sleigh = 60;
    return w;
}

// Fila más alta de una casa en la columna x (o 1e9 si no la cubre).
function houseTop(w, h, x) {
    var top = w.yS - h.wallH;
    if (h.kind === "church") {
        var tx = h.towerLeft ? h.x - 4 : h.x + h.w - 10;
        if (x >= tx && x < tx + h.towerW) {
            var c = tx + h.towerW / 2 - 0.5, d = Math.abs(x - c);
            return w.yS - h.towerH - Math.max(0, Math.round(26 - d * 26 / 6)) - (d < 1 ? 4 : 0);
        }
    }
    if (x < h.x - 2 || x >= h.x + h.w + 2) return 1e9;
    if (h.kind === "side") {
        var ins = Math.min(x - (h.x - 2), h.x + h.w + 1 - x);
        return top - Math.min(h.roofH, ins + 1);
    }
    var cx = h.x + h.w / 2 - 0.5, dd = Math.abs(x - cx);
    for (var r = 0; r < h.roofH; r++) if (Math.round((r + 1) * (h.w / 2 + 2) / h.roofH) >= dd) return top - h.roofH + r;
    return top;
}

function drawVillage(ctx, w, P, t) {
    var W = w.W, H = w.H, yS = w.yS, hour = P.hour, i, x, y;
    ctx.clearRect(0, 0, W, H);
    var snowL = lit([240, 244, 252], P), snowS = mix(lit([200, 210, 236], P), P.haze, 0.2);

    // Lomas nevadas con pinos.
    var sun = sunPos(w, hour), side = sun ? clamp((W / 2 - sun.x) / (W * 0.3), -1, 1) * (1 - P.rain) : 0;
    for (var d = 0; d < 2; d++) {
        var top = w.hills[d], base = mix(snowL, P.haze, d ? 0.15 : 0.35), shade = mix(snowS, P.haze, d ? 0.15 : 0.35);
        for (x = 0; x < W; x++) {
            var amt = top.face[x] * side;
            rect(ctx, x, top[x], 1, yS - top[x], css(amt < -0.25 ? shade : base));
            if (d === 0) for (y = top[x] + 3; y < yS; y += 3) if (hash2(x * 3, y) < 0.18) rect(ctx, x, y, 1, 1, css(mix(lit([52, 80, 70], P), P.haze, 0.5)));
        }
        if (d === 1) {
            var pine = mix(lit([40, 70, 58], P), P.haze, 0.2), pc = css(pine), ps = css(mix(snowL, P.haze, 0.1));
            for (i = 0; i < w.forest.length; i++) {
                var fp = w.forest[i], fy = top[clamp(fp.x, 0, W - 1)];
                for (var r = 0; r < fp.h; r++) {
                    var hw = Math.floor(r * 0.35);
                    rect(ctx, fp.x - hw, fy - fp.h + r, hw * 2 + 1, 1, r % 3 === 0 ? ps : pc);
                }
            }
            for (x = 0; x < W; x++) for (y = top[x] + 2; y < yS; y += 2) if (hash2(x, y * 5) < 0.22) rect(ctx, x, y, 1, 1, pc);
        }
        if (P.fog > 0.02) {
            ctx.fillStyle = css(P.fogc);
            for (var fy2 = 0; fy2 < 60; fy2 += 2) { ctx.globalAlpha = (d ? 0.3 : 0.45) * P.fog * (1 - fy2 / 60); ctx.fillRect(0, yS - fy2 - 2, W, 2); }
            ctx.globalAlpha = 1;
        }
    }

    // Casas e iglesia.
    for (i = 0; i < w.houses.length; i++) {
        if (w.houses[i].kind === "church") drawChurch(ctx, w, w.houses[i], P, hour);
        else drawHouse(ctx, w, w.houses[i], P, hour);
    }

    // Acera y calle empedrada con nieve pisada.
    var walk = mix(lit([150, 146, 160], P), snowL, 0.55), street = mix(lit([120, 116, 130], P), snowL, 0.45);
    rect(ctx, 0, yS, W, 4, css(walk));
    rect(ctx, 0, yS + 4, W, 12, css(street));
    rect(ctx, 0, yS + 4, W, 1, css(mul(walk, 0.85)));
    ctx.fillStyle = css(mul(street, 0.92));
    for (y = yS + 6; y < yS + 16; y += 3) for (x = (y % 2) * 3; x < W; x += 6) ctx.fillRect(x, y, 3, 1);
    ctx.fillStyle = css(mix(street, snowL, 0.5));
    for (x = 0; x < W; x += 2) if (hash2(x, 77) < 0.3) ctx.fillRect(x, yS + 5 + Math.floor(hash2(x, 78) * 10), 2, 1);

    // Plaza nevada con la pista de hielo.
    var plaza = snowL;
    rect(ctx, 0, w.yP, W, H - w.yP, css(plaza));
    rect(ctx, 0, w.yP, W, 1, css(snowS));
    var fl = css(snowS);
    for (i = 0; i < w.flakes.length; i++) rect(ctx, w.flakes[i].x, w.flakes[i].y, 1, 1, fl);
    ctx.fillStyle = css(mul(snowS, 0.93));
    for (i = 0; i < w.steps.length; i++) {
        var st = w.steps[i];
        for (var k2 = 0; k2 < st.n; k2++) ctx.fillRect(Math.round(st.x + st.dx * k2 * 3 + (k2 % 2) * 2), st.y + k2 * 3, 1, 1);
    }
    var bw = lit([120, 84, 58], P), bm = css(lit([50, 50, 60], P));
    for (i = 0; i < w.pbenches.length; i++) {
        var bx = w.pbenches[i], by = w.yP + 9;
        rect(ctx, bx, by, 13, 1, css(bw)); rect(ctx, bx, by + 1, 13, 1, css(mul(bw, 0.8)));
        rect(ctx, bx, by - 3, 13, 1, css(bw));
        rect(ctx, bx + 1, by + 2, 1, 3, bm); rect(ctx, bx + 11, by + 2, 1, 3, bm);
        rect(ctx, bx, by - 1, 13, 1, css(snowL)); rect(ctx, bx, by - 4, 13, 1, css(snowL));
    }
    var pd = w.pond, ice = mix(lit([170, 200, 224], P), P.hor, 0.25);
    ell(ctx, pd.x, pd.y + 1, pd.rx + 2, pd.ry + 1, css(snowS));
    ell(ctx, pd.x, pd.y, pd.rx, pd.ry, css(ice));
    ctx.globalAlpha = 0.5;
    ell(ctx, pd.x - Math.round(pd.rx * 0.3), pd.y - 3, Math.round(pd.rx * 0.4), 2, css(mix(ice, [255, 255, 255], 0.4)));
    ctx.globalAlpha = 0.35;
    for (i = 0; i < 9; i++) {
        var lx = pd.x + Math.round((hash2(i, 81) - 0.5) * pd.rx * 1.4), ly = pd.y + Math.round((hash2(i, 82) - 0.5) * pd.ry * 1.2);
        rect(ctx, lx, ly, 4 + Math.floor(hash2(i, 83) * 8), 1, css(mul(ice, 0.85)));
    }
    ctx.globalAlpha = 1;
    // Cerca de la pista.
    var post = css(lit([110, 80, 56], P));
    for (var a = 0; a < 28; a++) {
        var ang = a / 28 * Math.PI * 2, px = Math.round(pd.x + Math.cos(ang) * (pd.rx + 4)), py = Math.round(pd.y + Math.sin(ang) * (pd.ry + 3));
        if (Math.sin(ang) > 0.2) continue;
        rect(ctx, px, py - 3, 1, 3, post);
    }

    // Faroles, puestos y árbol (sobre la acera).
    var pole = css(lit([44, 46, 56], P));
    for (i = 0; i < w.lamps.length; i++) {
        var lx2 = w.lamps[i], ltop = yS + 3 - 22;
        rect(ctx, lx2, ltop, 1, 22, pole);
        rect(ctx, lx2 - 1, yS + 1, 3, 2, pole);
        rect(ctx, lx2 - 2, ltop - 3, 5, 4, pole);
        rect(ctx, lx2 - 1, ltop - 2, 3, 2, P.night > 0.35 ? "#fff0c0" : css(lit([200, 200, 190], P)));
        rect(ctx, lx2 - 2, ltop - 4, 5, 1, css(snowL));
        if (P.night > 0.35) {
            ctx.globalAlpha = 0.18;
            disc(ctx, lx2, ltop - 1, 7, "#ffe9b0");
            ctx.globalAlpha = 0.08 * P.night;
            ell(ctx, lx2, yS + 8, 14, 3, "#ffe1a0");
            ctx.globalAlpha = 1;
        }
    }
    for (i = 0; i < w.stalls.length; i++) drawStall(ctx, w.stalls[i], P, hour);
    drawXmasTree(ctx, w.xtree, P);
}

function drawHouse(ctx, w, h, P, hour) {
    var yS = w.yS, x = h.x, wd = h.w, top = yS - h.wallH, i, r, k;
    var wall = lit(h.col, P);
    if (h.back) wall = mix(wall, P.haze, 0.18);
    var wallC = css(wall), wallD = css(mul(wall, 0.84)), roof = lit(h.roof, P), roofC = css(roof);
    var snow = css(lit([240, 244, 252], P)), snowS = css(lit([206, 214, 236], P));
    var night = P.night > 0.35;
    rect(ctx, x, top, wd, h.wallH, wallC);
    rect(ctx, x + wd - 2, top, 2, h.wallH, wallD);
    if (h.timber) {
        var beam = css(lit([84, 56, 40], P));
        rect(ctx, x, top, 1, h.wallH, beam); rect(ctx, x + wd - 1, top, 1, h.wallH, beam);
        rect(ctx, x, top + Math.round(h.wallH / 2), wd, 1, beam);
        rect(ctx, x, top, wd, 1, beam);
        for (k = 0; k < 4; k++) rect(ctx, x + 1 + k, top + Math.round(h.wallH / 2) - 1 - k, 1, 1, beam);
        for (k = 0; k < 4; k++) rect(ctx, x + wd - 2 - k, top + Math.round(h.wallH / 2) - 1 - k, 1, 1, beam);
    }
    // Ventanas por piso; de noche casi todas encendidas, algunas con vela.
    var floors = Math.max(1, Math.floor((h.wallH - 4) / 10)), n = Math.max(1, Math.floor((wd - 6) / 9));
    var gap = (wd - n * 5) / (n + 1), door = h.back ? -1 : Math.floor(n / 2);
    for (var f = 0; f < floors; f++)
        for (i = 0; i < n; i++) {
            var wx = Math.round(x + gap + i * (5 + gap)), wy = yS - 11 - f * 10;
            if (f === 0 && i === door) continue;
            var on = night && hash2(h.seed + i * 7 + f * 31, Math.floor(hour * 2)) < occupancy(hour) + 0.25;
            rect(ctx, wx - 1, wy - 1, 7, 7, css(lit([236, 230, 214], P)));
            rect(ctx, wx, wy, 5, 5, on ? "#ffcf70" : css(mix(lit([90, 110, 140], P), P.hor, 0.3)));
            rect(ctx, wx + 2, wy, 1, 5, css(lit([236, 230, 214], P)));
            rect(ctx, wx, wy + 2, 5, 1, css(lit([236, 230, 214], P)));
            if (on && hash2(h.seed, i + f) < 0.3) rect(ctx, wx + 3, wy + 3, 1, 2, "#fff6d0");
            rect(ctx, wx - 1, wy + 6, 7, 1, snow);
            if (!h.back) { rect(ctx, wx - 2, wy - 1, 1, 7, css(mix(roof, wall, 0.3))); rect(ctx, wx + 6, wy - 1, 1, 7, css(mix(roof, wall, 0.3))); }
        }
    if (door >= 0) {
        var dx = Math.round(x + gap + door * (5 + gap)), dcol = lit([96, 60, 44], P);
        rect(ctx, dx, yS - 9, 5, 9, css(dcol));
        rect(ctx, dx, yS - 9, 5, 1, css(mul(dcol, 0.7)));
        if (h.wreath) {
            rect(ctx, dx + 1, yS - 8, 3, 3, css(lit([50, 120, 60], P)));
            rect(ctx, dx + 2, yS - 7, 1, 1, css(dcol));
            rect(ctx, dx + 2, yS - 6, 1, 1, css(lit([210, 50, 50], P)));
        }
        if (night) { ctx.globalAlpha = 0.3; disc(ctx, dx + 2, yS - 11, 3, "#ffe0a0"); ctx.globalAlpha = 1; rect(ctx, dx + 2, yS - 11, 1, 1, "#fff0c0"); }
    }
    // Techo con nieve gruesa y carámbanos.
    if (h.chimney >= 0) {
        var chx = x + h.chimney, cht = top - h.roofH - 2;
        rect(ctx, chx, cht, 4, h.roofH, css(lit([140, 80, 64], P)));
        rect(ctx, chx - 1, cht, 6, 1, css(lit([110, 64, 52], P)));
        rect(ctx, chx - 1, cht - 1, 6, 1, snow);
    }
    if (h.kind === "gable") {
        var cx = x + wd / 2 - 0.5;
        for (r = 0; r < h.roofH; r++) {
            var half = Math.round((r + 1) * (wd / 2 + 2) / h.roofH), ry = top - h.roofH + r;
            var x0 = Math.round(cx - half), x1 = Math.round(cx + half);
            rect(ctx, x0, ry, x1 - x0 + 1, 1, css(mix(wall, roof, 0.15)));
            rect(ctx, x0, ry, 3, 1, roofC); rect(ctx, x1 - 2, ry, 3, 1, roofC);
            rect(ctx, x0, ry, 2, 1, snow); rect(ctx, x1 - 1, ry, 2, 1, snowS);
            if (r < 3) rect(ctx, x0, ry, x1 - x0 + 1, 1, r === 2 ? snowS : snow);
        }
        rect(ctx, Math.round(cx) - 1, top - Math.round(h.roofH * 0.55), 3, 3, night ? "#ffcf70" : css(mix(lit([90, 110, 140], P), P.hor, 0.3)));
        rect(ctx, x - 2, top, wd + 4, 1, css(mul(roof, 0.7)));
    } else {
        // Techo de cuatro aguas visto de frente: alero oscuro abajo y nieve encima.
        for (r = 0; r < h.roofH; r++) {
            var ry2 = top - 1 - r, rw = wd + 4 - 2 * r;
            if (rw <= 4) continue;
            rect(ctx, x - 2 + r, ry2, rw, 1, r === 0 ? css(mul(roof, 0.8)) : (r === 1 ? roofC : (r === 2 ? snowS : snow)));
        }
        rect(ctx, x - 2, top, wd + 4, 1, css(mul(roof, 0.7)));
    }
    ctx.fillStyle = css(lit([226, 238, 250], P));
    for (k = x - 1; k < x + wd + 1; k += 2)
        if (hash2(k, h.seed) < 0.45) ctx.fillRect(k, top + 1, 1, 1 + Math.floor(hash2(k, h.seed + 1) * 3));
}

function drawChurch(ctx, w, c, P, hour) {
    var yS = w.yS, x = c.x, top = yS - c.wallH, i, r;
    var wall = lit(c.col, P), wallC = css(wall), wallD = css(mul(wall, 0.84)), roofC = css(lit(c.roof, P));
    var snow = css(lit([240, 244, 252], P)), night = P.night > 0.35;
    // Nave con techo a dos aguas.
    rect(ctx, x, top, c.w, c.wallH, wallC);
    var cx = x + c.w / 2 - 0.5;
    for (r = 0; r < c.roofH; r++) {
        var half = Math.round((r + 1) * (c.w / 2 + 2) / c.roofH), ry = top - c.roofH + r;
        rect(ctx, Math.round(cx - half), ry, half * 2 + 1, 1, r < 3 ? snow : wallD);
        rect(ctx, Math.round(cx - half), ry, 3, 1, roofC); rect(ctx, Math.round(cx + half) - 2, ry, 3, 1, roofC);
        rect(ctx, Math.round(cx - half), ry, 2, 1, snow);
    }
    rect(ctx, x - 2, top, c.w + 4, 1, roofC);
    // Vitrales de colores (brillan de noche), rosetón y puerta en arco.
    var glass = [[220, 70, 70], [70, 120, 220], [240, 200, 70], [80, 180, 100]];
    for (i = 0; i < 3; i++) {
        var gx = x + 6 + i * 12;
        for (var k = 0; k < 4; k++) rect(ctx, gx + (k % 2), top + 4 + Math.floor(k / 2) * 4, 1, 4, night ? css(glass[(i + k) % 4]) : css(mix(lit(glass[(i + k) % 4], P), [60, 70, 90], 0.6)));
        rect(ctx, gx, top + 3, 2, 1, wallD);
    }
    disc(ctx, cx, top - Math.round(c.roofH * 0.45), 2, night ? "#ffd27a" : css(lit([90, 110, 140], P)));
    var dcol = lit([90, 56, 40], P);
    rect(ctx, Math.round(cx) - 3, yS - 10, 7, 10, css(dcol));
    rect(ctx, Math.round(cx) - 2, yS - 11, 5, 1, css(dcol));
    // Torre con reloj y aguja.
    var tx = c.towerLeft ? x - 4 : x + c.w - 10, tw = c.towerW, tt = yS - c.towerH;
    rect(ctx, tx, tt, tw, c.towerH, wallC);
    rect(ctx, tx + tw - 2, tt, 2, c.towerH, wallD);
    rect(ctx, tx - 1, tt, tw + 2, 2, wallD);
    rect(ctx, tx - 1, tt - 1, tw + 2, 1, snow);
    disc(ctx, tx + tw / 2 - 0.5, tt + 8, 3, css(lit([244, 240, 228], P)));
    var hr = (P.hour % 12) / 12 * Math.PI * 2, hcx = Math.round(tx + tw / 2 - 0.5), hcy = tt + 8;
    rect(ctx, hcx, hcy, 1, 1, css(lit([40, 40, 50], P)));
    rect(ctx, hcx + Math.round(Math.sin(hr) * 2), hcy - Math.round(Math.cos(hr) * 2), 1, 1, css(lit([40, 40, 50], P)));
    rect(ctx, tx + 4, tt + 14, tw - 8, 6, night ? "#3a3040" : css(mul(wall, 0.5)));    // campanario
    rect(ctx, tx + tw / 2 - 1, tt + 15, 2, 3, css(lit([200, 160, 70], P)));
    for (r = 0; r < 26; r++) {
        var hw = Math.max(0, Math.round((r + 1) * 6 / 26));
        rect(ctx, Math.round(tx + tw / 2 - 0.5) - hw, tt - 26 + r, hw * 2 + 1, 1, r % 5 === 4 ? snow : roofC);
        rect(ctx, Math.round(tx + tw / 2 - 0.5) - hw, tt - 26 + r, 1, 1, snow);
    }
    var cxs = Math.round(tx + tw / 2 - 0.5), gold = css(lit([220, 180, 80], P));
    rect(ctx, cxs, tt - 31, 1, 5, gold);
    rect(ctx, cxs - 1, tt - 30, 3, 1, gold);
}

// Puesto del mercado navideño con toldo a rayas.
function drawStall(ctx, s, P, hour) {
    var x = s.x, y = s.y, wood = lit([140, 100, 70], P), c = lit(s.col, P), white = lit([240, 236, 230], P);
    var snow = css(lit([240, 244, 252], P)), night = P.night > 0.35;
    rect(ctx, x, y - 8, 18, 8, css(wood));
    rect(ctx, x, y - 8, 18, 1, css(mul(wood, 0.75)));
    rect(ctx, x + 1, y - 12, 1, 4, css(mul(wood, 0.7))); rect(ctx, x + 16, y - 12, 1, 4, css(mul(wood, 0.7)));
    if (night) { ctx.globalAlpha = 0.25; rect(ctx, x + 2, y - 12, 14, 4, "#ffd890"); ctx.globalAlpha = 1; }
    for (var k = 0; k < 7; k++) rect(ctx, x + 2 + k * 2, y - 10, 1, 2, css(lit(BULBS[k % BULBS.length], P)));
    for (var r = 0; r < 4; r++)
        for (k = -1; k < 20; k++) rect(ctx, x + k, y - 16 + r, 1, 1, css(Math.floor((k + 1) / 3) % 2 ? white : c));
    rect(ctx, x - 1, y - 17, 21, 1, snow);
    ctx.fillStyle = css(mul(c, 0.8));
    for (k = 0; k < 20; k += 3) ctx.fillRect(x + k, y - 12, 2, 1);
}

// Árbol de Navidad de la plaza: esferas fijas; los foquitos y la estrella brillan en la capa ambiental.
function drawXmasTree(ctx, T, P) {
    drawPine(ctx, T.x, T.y, T.h, P, 0);
    var top = T.y - T.h;
    rect(ctx, T.x - 4, T.y - 2, 9, 4, css(lit([170, 60, 50], P)));
    rect(ctx, T.x - 4, T.y - 2, 9, 1, css(lit([210, 180, 80], P)));
    for (var i = 0; i < T.orn.length; i++) {
        var o = T.orn[i];
        if (!o.ball) continue;
        var oy = Math.round(top + 6 + o.u * (T.h - 12)), ox = Math.round(T.x + o.v * T.h * 0.5);
        rect(ctx, ox, oy, 2, 2, css(lit(BULBS[o.c], P)));
    }
}

function drawVillageFront(ctx, w, P) {
    var H = w.H, i, snow = css(lit([240, 244, 252], P)), snowS = css(lit([210, 218, 238], P));
    for (i = 0; i < w.drifts.length; i++) disc(ctx, w.drifts[i].x, H + 3, w.drifts[i].r, snowS);
    for (i = 0; i < w.drifts.length; i++) disc(ctx, w.drifts[i].x - 1, H + 3, w.drifts[i].r - 1, snow);
    // Muñeco de nieve con sombrero, bufanda y nariz de zanahoria.
    var s = w.snowman, x = s.x, y = s.y;
    disc(ctx, x, y - 6, 6, snowS); disc(ctx, x - 1, y - 7, 5, snow);
    disc(ctx, x, y - 15, 4, snowS); disc(ctx, x - 1, y - 16, 3, snow);
    disc(ctx, x, y - 22, 3, snowS); disc(ctx, x - 1, y - 23, 2, snow);
    var dark = css(lit([36, 34, 40], P));
    rect(ctx, x - 3, y - 26, 7, 1, dark); rect(ctx, x - 2, y - 30, 5, 4, dark);
    rect(ctx, x - 2, y - 27, 5, 1, css(lit([190, 50, 50], P)));
    rect(ctx, x - 2, y - 23, 1, 1, dark); rect(ctx, x + 1, y - 23, 1, 1, dark);
    rect(ctx, x + 1, y - 22, 3, 1, css(lit([240, 130, 40], P)));
    rect(ctx, x - 3, y - 19, 7, 2, css(lit([60, 110, 200], P)));
    rect(ctx, x + 2, y - 17, 2, 3, css(lit([60, 110, 200], P)));
    rect(ctx, x, y - 15, 1, 1, dark); rect(ctx, x, y - 12, 1, 1, dark);
    rect(ctx, x - 9, y - 18, 5, 1, css(lit([110, 76, 50], P))); rect(ctx, x + 5, y - 17, 5, 1, css(lit([110, 76, 50], P)));
}

// Foquitos que cambian de patrón, estrella del árbol, humo de chimeneas y vapor de la pista.
function drawVillageAmbient(ctx, w, P, t) {
    var i, night = P.night > 0.3, mode = Math.floor(t / 10) % 3, step4 = Math.floor(t * 4);
    function bulbOn(i, c) {
        if (mode === 0) return (i + step4) % 3 !== 0;
        if (mode === 1) return hash2(i, step4) < 0.7;
        return true;
    }
    function bulb(x, y, i, c) {
        var cc = mode === 2 ? (c + Math.floor(t * 2)) % BULBS.length : c, on = bulbOn(i, c);
        var col = BULBS[cc];
        if (!night) { rect(ctx, x, y, 1, 1, css(mix(lit(col, P), [80, 80, 90], 0.3))); return; }
        if (!on) { rect(ctx, x, y, 1, 1, css(mul(col, 0.35))); return; }
        ctx.globalAlpha = 0.28;
        rect(ctx, x - 1, y - 1, 3, 3, css(col));
        ctx.globalAlpha = 1;
        rect(ctx, x, y, 1, 1, css(mix(col, [255, 255, 255], 0.35)));
    }
    for (i = 0; i < w.bulbs.length; i++) bulb(w.bulbs[i].x, w.bulbs[i].y, i, w.bulbs[i].c);
    // Guirnaldas entre faroles: cuelgan en curva.
    var yL = w.yS + 3 - 22, n = 0;
    for (i = 0; i + 1 < w.lamps.length; i++) {
        var a = w.lamps[i], b = w.lamps[i + 1], span = b - a;
        if (span > 140) continue;
        for (var x = a + 3; x < b - 1; x += 4) {
            var u = (x - a) / span, sag = Math.round(Math.sin(u * Math.PI) * 7);
            rect(ctx, x, yL - 2 + sag, 1, 1, css(lit([40, 44, 40], P)));
            bulb(x, yL - 1 + sag, n++, n % BULBS.length);
        }
    }
    // Foquitos del árbol y la estrella.
    var T = w.xtree, top = T.y - T.h;
    for (i = 0; i < T.orn.length; i++) {
        var o = T.orn[i];
        if (o.ball) continue;
        bulb(Math.round(T.x + o.v * T.h * 0.5), Math.round(top + 6 + o.u * (T.h - 12)), i + 500, o.c);
    }
    var st = 0.6 + 0.4 * Math.sin(t * 3);
    if (night) { ctx.globalAlpha = 0.25 * st; disc(ctx, T.x, top - 1, 5, "#fff0a0"); ctx.globalAlpha = 1; }
    var sc = night ? "#fff4b0" : css(lit([230, 200, 80], P));
    rect(ctx, T.x - 1, top - 3, 3, 3, sc); rect(ctx, T.x, top - 5, 1, 7, sc); rect(ctx, T.x - 3, top - 2, 7, 1, sc);
    // Humo de las chimeneas.
    for (i = 0; i < w.houses.length; i++) {
        var h = w.houses[i];
        if (h.kind === "church" || h.chimney < 0) continue;
        drawSmoke(ctx, P, h.x + h.chimney + 2, w.yS - h.wallH - h.roofH - 4, t, 1, 0.8);
    }
}

// Patinadores en la pista y el trineo nocturno.
function stepVillage(w, dt, hour, P) {
    var R = Math.random, T = w.timers, W = w.W, i;
    var pd = w.pond, want = hour >= 9 && hour < 22 ? Math.round(3 * Math.max(1, W / 480)) : (hour >= 22 || hour < 1 ? 1 : 0);
    T.skate -= dt;
    if (T.skate <= 0) {
        T.skate = 6 + R() * 10;
        if (w.critters.length < want) {
            var kid = R() < 0.3, sk = newPerson(w, pd.x, pd.y, 1, 0, kid);
            sk.kind = "skater"; sk.a = R() * Math.PI * 2; sk.w = (R() < 0.5 ? 1 : -1) * (0.25 + R() * 0.2);
            sk.k = 0.55 + R() * 0.3;
            w.critters.push(sk);
        } else if (w.critters.length > want) w.critters.splice(Math.floor(R() * w.critters.length), 1);
    }
    for (i = 0; i < w.critters.length; i++) {
        var s = w.critters[i], ox = s.x;
        s.a += s.w * dt;
        s.x = pd.x + Math.cos(s.a) * pd.rx * s.k;
        s.y = Math.round(pd.y + 2 + Math.sin(s.a) * (pd.ry - 2) * s.k);
        s.dir = s.x > ox ? 1 : -1;
        s.dist += Math.abs(s.x - ox) * 0.25;
    }
    // Trineo con renos que cruza el cielo algunas noches.
    if (w.sleigh) {
        w.sleigh.x += w.sleigh.dir * 28 * dt;
        w.sleigh.t += dt;
        if (w.sleigh.x < -80 || w.sleigh.x > W + 80) w.sleigh = null;
    } else {
        T.sleigh -= dt;
        if (T.sleigh <= 0) {
            T.sleigh = 240 + R() * 400;
            if (P.night > 0.8 && P.rain < 0.4 && R() < 0.6) {
                var d = R() < 0.5 ? 1 : -1;
                w.sleigh = { x: d > 0 ? -70 : W + 70, y: 14 + R() * w.yS * 0.3, dir: d, t: 0 };
            }
        }
    }
}

function drawVillageLife(ctx, w, P, t) {
    var S = w.sleigh;
    if (!S) return;
    var d = S.dir, x0 = Math.round(S.x), y0 = Math.round(S.y + Math.sin(S.t * 1.5) * 3);
    var deer = css(lit([140, 96, 60], P)), ant = css(lit([200, 180, 140], P)), red = css(lit([210, 50, 50], P));
    var gold = css(lit([230, 190, 80], P)), skin = css(lit([240, 200, 170], P)), white = css(lit([244, 244, 244], P));
    // Estela de chispas.
    for (var k = 0; k < 10; k++) {
        ctx.globalAlpha = 0.6 * (1 - k / 10);
        rect(ctx, x0 - d * (6 + k * 4), y0 + 3 + Math.round(Math.sin(S.t * 1.5 - k * 0.3) * 2), 1, 1, hash2(k, Math.floor(t * 8)) < 0.5 ? "#fff4b0" : "#ffd060");
    }
    ctx.globalAlpha = 1;
    // Trineo y conductor.
    rect(ctx, x0 - 5, y0, 10, 3, red);
    rect(ctx, d > 0 ? x0 + 3 : x0 - 5, y0 - 2, 2, 2, red);
    rect(ctx, x0 - 6, y0 + 4, 12, 1, gold);
    rect(ctx, d > 0 ? x0 + 5 : x0 - 6, y0 + 3, 1, 1, gold);
    rect(ctx, x0 - 2, y0 - 4, 3, 4, red);
    rect(ctx, x0 - 2, y0 - 6, 3, 2, skin);
    rect(ctx, x0 - 2, y0 - 7, 3, 1, red); rect(ctx, x0 - 2, y0 - 5, 3, 1, white);
    rect(ctx, d > 0 ? x0 - 4 : x0 + 2, y0 - 3, 2, 3, css(lit([120, 80, 50], P)));     // costal
    // Renos en fila con riendas.
    for (var i = 0; i < 4; i++) {
        var rx = x0 + d * (10 + i * 9), ry = y0 - 2 + Math.round(Math.sin(S.t * 3 + i) * 1), f = Math.floor(S.t * 6 + i) % 2;
        rect(ctx, rx - 3, ry, 6, 2, deer);
        rect(ctx, d > 0 ? rx + 2 : rx - 3, ry - 2, 2, 2, deer);
        rect(ctx, d > 0 ? rx + 3 : rx - 4, ry - 1, 1, 1, i === 3 ? red : deer);
        rect(ctx, d > 0 ? rx + 2 : rx - 3, ry - 4, 1, 2, ant); rect(ctx, d > 0 ? rx + 1 : rx - 2, ry - 4, 1, 1, ant);
        rect(ctx, rx - 3 + (f ? 0 : 1), ry + 2, 1, 2, deer); rect(ctx, rx + 1 + (f ? 1 : 0), ry + 2, 1, 2, deer);
        rect(ctx, rx - d * 5, ry, 3, 1, css(lit([120, 80, 50], P)));
    }
}

// Luciérnagas en las noches de verano, entre las filas y0 y y1.
function drawFireflies(ctx, w, P, t, y0, y1) {
    if (!(P.night > 0.6 && P.rain < 0.1 && w.month >= 5 && w.month <= 8)) return;
    for (var i = 0; i < 22; i++) {
        if (hash2(i, Math.floor(t * 1.5 + i)) < 0.45) continue;
        var lx = (hash2(i, 61) * w.W + Math.sin(t * 0.3 + i) * 12 + w.W) % w.W;
        var ly = y0 + hash2(i, 62) * (y1 - y0) + Math.sin(t * 0.5 + i * 2) * 4;
        ctx.globalAlpha = 0.3;
        rect(ctx, lx - 1, ly - 1, 3, 3, "#d8ff70");
        ctx.globalAlpha = 1;
        rect(ctx, lx, ly, 1, 1, "#f0ffa0");
    }
}

// ---------- escena: campo ----------
// Lomas con parcelas que cambian de color con la estación, granero rojo con silo, casa con tendedero,
// molino de aspas que giran, aerogeneradores a lo lejos, camino de tierra con tractor y camioneta,
// vacas que pastan (y se echan de noche), gallinas, espantapájaros y girasoles en verano.

// Colores de las parcelas según el mes: [principal, surco].
function fieldCols(kind, m) {
    var spring = m >= 2 && m <= 4, summer = m >= 5 && m <= 7, autumn = m >= 8 && m <= 10;
    if (kind === 0) return spring ? [[120, 170, 80], [96, 140, 66]] : (summer ? [[222, 190, 96], [196, 162, 76]] : (autumn ? [[196, 150, 84], [168, 124, 70]] : [[150, 130, 96], [128, 110, 82]]));
    if (kind === 1) return spring || summer ? [[86, 146, 70], [64, 116, 56]] : (autumn ? [[176, 140, 70], [150, 112, 60]] : [[130, 120, 92], [112, 100, 78]]);
    if (kind === 2) return [[150, 108, 76], [124, 88, 62]];                                        // arada
    return summer || spring ? [[150, 120, 196], [122, 96, 166]] : [[120, 150, 90], [100, 126, 74]];   // lavanda o pasto
}

function createFarm(W, H, seed, opts) {
    var R = rng(seed || 7), i, x, y;
    var w = { W: W, H: H, opts: opts || {}, scene: "farm", noGulls: true, noBoats: true, noWater: true, crowd: 5 };
    w.yW = Math.round(H * 0.56);       // horizonte de las lomas
    w.base = w.yW;
    w.axis = w.yW;
    w.yR = Math.round(H * 0.76);       // camino de tierra
    w.yP = w.yR + 11;                  // empieza el potrero
    w.ground = w.yP;
    w.windows = []; w.antennas = []; w.signs = []; w.tvs = []; w.leds = []; w.screens = [];
    w.ads = []; w.bigAds = []; w.refl = []; w.layers = [[], [], []];
    w.lamps = []; w.benches = []; w.trees = []; w.hedge = [];

    w.hills = [
        makeRidge(R, W, w.yW, H * 0.13, H * 0.05, Math.round(W / 130) + 2, 0.16, 1),
        makeRidge(R, W, w.yW, H * 0.07, H * 0.02, Math.round(W / 100) + 2, 0.12, 0.6)
    ];
    // Parcelas: franjas inclinadas en las lomas y bandas de cultivo hasta el camino.
    w.patch = [];
    for (i = 0; i < 40; i++) w.patch.push({ k: ri(R, 0, 3), lean: (R() - 0.5) * 0.8 });
    w.bands = [];
    for (y = w.yW; y < w.yR; ) {
        var bh = ri(R, 5, 10);
        w.bands.push({ y: y, h: Math.min(bh, w.yR - y), k: ri(R, 0, 3), split: R() < 0.5 ? ri(R, Math.round(W * 0.2), Math.round(W * 0.8)) : -1, k2: ri(R, 0, 3) });
        y += bh;
    }
    w.distTrees = [];
    for (x = ri(R, 0, 30); x < W; x += ri(R, 18, 60)) w.distTrees.push({ x: x, r: ri(R, 2, 4), d: R() < 0.5 ? 0 : 1 });
    w.turbines = [];
    for (i = 0; i < Math.max(2, Math.round(W / 200)); i++) {
        var tx = ri(R, 10, W - 10);
        w.turbines.push({ x: tx, y: w.hills[0][tx], h: ri(R, 16, 24), ph: R() * 6 });
    }

    // Granja: granero con silo y casa en un lado, molino en el otro.
    var side = R() < 0.5 ? -1 : 1;
    var bx = Math.round(side < 0 ? W * (0.1 + R() * 0.08) : W * (0.62 + R() * 0.08));
    w.barn = { x: bx, y: w.yR - 2, w: 40, h: 18 };
    w.silo = { x: bx + (side < 0 ? 44 : -14), y: w.yR - 2, h: 40 };
    w.house = { x: bx + (side < 0 ? 64 : -66), y: w.yR - 2, w: 36, h: 16 };
    w.line = { x0: w.house.x + (side < 0 ? 40 : -24), y: w.yR - 12 };
    w.mill = { x: Math.round(side < 0 ? W * (0.74 + R() * 0.12) : W * (0.12 + R() * 0.12)), y: w.yR - 3, h: 40 };
    w.scare = { x: Math.round(W * (0.45 + R() * 0.1)), y: w.yW + Math.round((w.yR - w.yW) * 0.55) };
    w.bales = [];
    for (i = 0; i < 4; i++) w.bales.push({ x: ri(R, 10, W - 10), y: ri(R, w.yW + 6, w.yR - 16) });
    w.mtrees = [];
    for (i = 0; i < 3; i++) {
        var mx = ri(R, 10, W - 10);
        if (Math.abs(mx - w.mill.x) < 30 || Math.abs(mx - bx - 20) < 60) continue;
        w.mtrees.push({ x: mx, y: w.yR - ri(R, 2, 6), r: ri(R, 7, 10) });
    }

    w.lanes = [w.yR + 9, w.yR + 11];
    w.grass = [];
    for (i = 0; i < Math.round(W * (H - w.yP) / 40); i++) w.grass.push({ x: ri(R, 0, W - 1), y: ri(R, w.yP + 1, H - 1), light: R() < 0.5 });
    w.flowers = [];
    for (x = ri(R, -4, 6); x < W + 4; x += ri(R, 5, 9)) w.flowers.push({ x: x, h: ri(R, 12, 22), lean: R() < 0.5 ? -1 : 1 });
    w.fenceSide = side;

    // Silueta contra el cielo.
    w.sky = [];
    for (x = 0; x < W; x++) w.sky.push(Math.min(w.hills[0][x], w.hills[1][x]));
    function block(x0, x1, top) { for (var xx = Math.max(0, x0); xx < Math.min(W, x1); xx++) w.sky[xx] = Math.min(w.sky[xx], top); }
    block(w.barn.x - 2, w.barn.x + w.barn.w + 2, w.barn.y - w.barn.h - 14);
    block(w.silo.x, w.silo.x + 10, w.silo.y - w.silo.h - 4);
    block(w.house.x - 2, w.house.x + w.house.w + 2, w.house.y - w.house.h - 10);
    block(w.mill.x - 9, w.mill.x + 10, w.mill.y - w.mill.h - 6);
    for (i = 0; i < w.turbines.length; i++) block(w.turbines[i].x, w.turbines[i].x + 1, w.turbines[i].y - w.turbines[i].h);

    genSky(w, R);
    initLife(w, R);
    w.critters = [];
    var nc = Math.max(3, Math.round(W / 110));
    for (i = 0; i < nc; i++) w.critters.push({ kind: "cow", x: ri(R, 20, W - 20), y: ri(R, w.yP + 12, H - 8), dir: R() < 0.5 ? 1 : -1,
        state: "graze", tm: R() * 5, spots: ri(R, 0, 999), brown: R() < 0.3, dist: 0 });
    var hx = w.barn.x + 20;
    for (i = 0; i < 5; i++) w.critters.push({ kind: "hen", x: clamp(hx + ri(R, -50, 50), 6, W - 6), y: ri(R, w.yP + 4, w.yP + 14), dir: R() < 0.5 ? 1 : -1,
        state: "idle", tm: R() * 2, brown: R() < 0.4, dist: 0, hx: hx });
    w.timers.tractor = 5;
    return w;
}

function drawFarm(ctx, w, P, t) {
    var W = w.W, H = w.H, yW = w.yW, yR = w.yR, hour = P.hour, i, x, y, m = w.month;
    ctx.clearRect(0, 0, W, H);
    var sc = P.snowCover, snowC = lit([236, 240, 248], P);
    function fc(k, d, row) {
        var c = fieldCols(k, m)[row ? 1 : 0];
        c = mix(lit(c, P), P.haze, d);
        return css(mix(c, mix(snowC, P.haze, d), clamp(sc * 1.1, 0, 0.9)));
    }
    // Lomas con parcelas inclinadas.
    for (var d = 0; d < 2; d++) {
        var top = w.hills[d], haze = d ? 0.25 : 0.42;
        for (x = 0; x < W; x++) {
            for (y = top[x]; y < yW; y++) {
                var pi = Math.floor((x + (y - top[x]) * 6 * w.patch[Math.floor(x / 40) % 40].lean) / 26 + d * 7) % 40;
                var pk = w.patch[(pi + 40) % 40].k;
                rect(ctx, x, y, 1, 1, fc(pk, haze, (y + d) % 3 === 0));
            }
        }
        // Árboles lejanos sobre la loma.
        for (i = 0; i < w.distTrees.length; i++) {
            var dt = w.distTrees[i];
            if (dt.d !== d) continue;
            disc(ctx, dt.x, w.hills[d][clamp(dt.x, 0, W - 1)] - dt.r + 1, dt.r, css(mix(mix(lit([60, 100, 66], P), snowC, clamp(sc - 0.3, 0, 0.6)), P.haze, haze)));
        }
    }
    // Aerogeneradores: torre blanca (las aspas giran en la capa ambiental).
    for (i = 0; i < w.turbines.length; i++) {
        var tb = w.turbines[i];
        rect(ctx, tb.x, tb.y - tb.h, 1, tb.h, css(mix(lit([236, 236, 240], P), P.haze, 0.45)));
    }
    // Bandas de cultivo hasta el camino, con surcos.
    for (i = 0; i < w.bands.length; i++) {
        var b = w.bands[i], far = 0.18 * (1 - (b.y - yW) / (yR - yW));
        for (var half = 0; half < 2; half++) {
            var k = half && b.split >= 0 ? b.k2 : b.k, x0 = half ? Math.max(0, b.split) : 0, x1 = half ? W : (b.split >= 0 ? b.split : W);
            if (x1 <= x0) continue;
            rect(ctx, x0, b.y, x1 - x0, b.h, fc(k, far, false));
            ctx.fillStyle = fc(k, far, true);
            for (y = b.y + 1; y < b.y + b.h; y += 2) ctx.fillRect(x0, y, x1 - x0, 1);
        }
        if (b.split >= 0) rect(ctx, b.split - 1, b.y, 2, b.h, css(mix(lit([70, 100, 60], P), snowC, sc * 0.7)));
        rect(ctx, 0, b.y, W, 1, css(mix(lit([84, 116, 66], P), snowC, sc * 0.8)));
    }
    if (P.fog > 0.02) {
        ctx.fillStyle = css(P.fogc);
        for (y = yW - 30; y < yR; y += 2) { ctx.globalAlpha = 0.5 * P.fog * clamp(1 - Math.abs(y - yW) / 34, 0.1, 1); ctx.fillRect(0, y, W, 2); }
        ctx.globalAlpha = 1;
    }
    // Pacas de heno en verano y otoño.
    if (m >= 6 && m <= 9 && sc < 0.3)
        for (i = 0; i < w.bales.length; i++) {
            var bl = w.bales[i], hc = lit([214, 180, 96], P);
            disc(ctx, bl.x, bl.y, 3, css(mul(hc, 0.8))); disc(ctx, bl.x - 1, bl.y - 1, 2, css(hc));
            rect(ctx, bl.x - 1, bl.y - 1, 1, 1, css(mul(hc, 0.7)));
        }
    drawScarecrow(ctx, w.scare, P);
    for (i = 0; i < w.mtrees.length; i++) {
        var mt = w.mtrees[i], leaf = lit(m >= 9 && m <= 10 ? [196, 120, 60] : [70, 120, 70], P);
        rect(ctx, mt.x - 1, mt.y - mt.r, 2, mt.r, css(lit([90, 66, 50], P)));
        if (m === 11 || m <= 1) {
            ctx.fillStyle = css(lit([90, 66, 50], P));
            for (k = 0; k < 5; k++) ctx.fillRect(mt.x - 4 + k * 2, mt.y - mt.r * 2 + (k % 2) * 3, 1, mt.r);
            if (sc > 0.2) rect(ctx, mt.x - 5, mt.y - mt.r * 2, 10, 1, css(snowC));
        } else {
            disc(ctx, mt.x, mt.y - mt.r * 1.6, mt.r, css(mul(leaf, 0.75)));
            disc(ctx, mt.x - 1, mt.y - mt.r * 1.6 - 1, mt.r - 1, css(leaf));
            disc(ctx, mt.x - 3, mt.y - mt.r * 1.6 - 3, Math.max(2, mt.r * 0.4), css(mix(leaf, [230, 240, 180], 0.2)));
            if (sc > 0.2) rect(ctx, mt.x - mt.r + 2, Math.round(mt.y - mt.r * 2.6), mt.r * 2 - 4, 1, css(snowC));
        }
    }
    drawMillBody(ctx, w, P);
    drawSilo(ctx, w, P);
    drawBarn(ctx, w, P, hour);
    drawFarmhouse(ctx, w, P, hour);

    // Cerca y camino de tierra.
    var wood = lit([150, 116, 84], P), woodC = css(wood), woodD = css(mul(wood, 0.72));
    rect(ctx, 0, yR - 5, W, 1, woodC);
    rect(ctx, 0, yR - 2, W, 1, woodD);
    for (x = 3; x < W; x += 12) { rect(ctx, x, yR - 7, 2, 7, woodC); rect(ctx, x + 1, yR - 7, 1, 7, woodD); if (sc > 0.2) rect(ctx, x, yR - 8, 2, 1, css(snowC)); }
    var dirt = mix(lit([168, 136, 98], P), snowC, sc * 0.5), dirtC = css(dirt), dirtD = css(mul(dirt, 0.85));
    rect(ctx, 0, yR, W, 11, dirtC);
    rect(ctx, 0, yR, W, 1, dirtD);
    ctx.fillStyle = dirtD;
    for (x = 0; x < W; x += 3) { if (hash2(x, 5) < 0.5) ctx.fillRect(x, yR + 3, 2, 1); if (hash2(x, 6) < 0.5) ctx.fillRect(x + 1, yR + 7, 2, 1); }
    rect(ctx, 0, yR + 5, W, 1, css(mix(dirt, lit([110, 140, 80], P), 0.4)));
    if (P.rain > 0.3) {
        ctx.globalAlpha = 0.35;
        for (i = 0; i < 8; i++) ell(ctx, (hash2(i, 9) * W) | 0, yR + 3 + (i % 2) * 4, 6, 1, css(mix(P.hor, dirt, 0.3)));
        ctx.globalAlpha = 1;
    }
    // Potrero.
    var grass = mix(lit([102, 150, 76], P), snowC, clamp(sc * 1.1, 0, 0.92));
    rect(ctx, 0, w.yP, W, H - w.yP, css(grass));
    var gl = css(mix(grass, [255, 255, 220], 0.15)), gd = css(mul(grass, 0.85));
    for (i = 0; i < w.grass.length; i++) rect(ctx, w.grass[i].x, w.grass[i].y, 1, 1, w.grass[i].light ? gl : gd);
}

function drawScarecrow(ctx, s, P) {
    var x = s.x, y = s.y, stick = css(lit([110, 80, 54], P));
    rect(ctx, x, y - 14, 1, 14, stick);
    rect(ctx, x - 5, y - 10, 11, 1, stick);
    rect(ctx, x - 3, y - 11, 7, 5, css(lit([170, 70, 60], P)));
    rect(ctx, x - 1, y - 11, 3, 1, css(lit([110, 60, 50], P)));
    rect(ctx, x - 1, y - 14, 3, 3, css(lit([220, 190, 130], P)));
    rect(ctx, x - 3, y - 15, 7, 1, css(lit([200, 168, 90], P)));
    rect(ctx, x - 2, y - 17, 5, 2, css(lit([200, 168, 90], P)));
    rect(ctx, x - 6, y - 10, 1, 2, css(lit([230, 200, 110], P))); rect(ctx, x + 6, y - 10, 1, 2, css(lit([230, 200, 110], P)));
}

function drawMillBody(ctx, w, P) {
    var M = w.mill, x = M.x, y = M.y, h = M.h, r;
    var wall = lit([228, 222, 210], P), wallD = css(mul(wall, 0.82)), cap = lit([90, 70, 60], P), snow = css(lit([240, 244, 252], P));
    for (r = 0; r < h; r++) {
        var hw = Math.round(9 - r * 3 / h);
        rect(ctx, x - hw, y - r, hw * 2 + 1, 1, css(wall));
        rect(ctx, x + hw - 2, y - r, 3, 1, wallD);
    }
    rect(ctx, x - 2, y - 8, 5, 8, css(lit([110, 76, 50], P)));
    rect(ctx, x - 1, y - 24, 3, 4, css(mix(lit([90, 110, 140], P), P.hor, 0.3)));
    rect(ctx, x - 1, y - 34, 3, 3, css(mix(lit([90, 110, 140], P), P.hor, 0.3)));
    rect(ctx, x - 10, y - 18, 21, 1, css(lit([110, 80, 54], P)));     // galería
    for (r = 0; r < 7; r++) {
        var cw = Math.round(7 - r);
        rect(ctx, x - cw, y - h - r, cw * 2 + 1, 1, css(r < 2 ? mul(cap, 0.8) : cap));
    }
    if (P.snowCover > 0.2) rect(ctx, x - 4, y - h - 6, 9, 2, snow);
    if (P.night > 0.4) rect(ctx, x - 1, y - 24, 3, 4, "#ffd27a");
}

function drawSilo(ctx, w, P) {
    var S = w.silo, x = S.x, y = S.y, h = S.h, c = lit([196, 196, 204], P);
    rect(ctx, x, y - h, 10, h, css(c));
    rect(ctx, x + 7, y - h, 3, h, css(mul(c, 0.8)));
    rect(ctx, x + 1, y - h, 1, h, css(mix(c, [255, 255, 255], 0.3)));
    ctx.fillStyle = css(mul(c, 0.86));
    for (var r = y - h + 5; r < y; r += 6) ctx.fillRect(x, r, 10, 1);
    disc(ctx, x + 4.5, y - h, 5, css(lit([170, 70, 60], P)));
    rect(ctx, x - 1, y - h, 12, 1, css(lit([140, 56, 48], P)));
    if (P.snowCover > 0.2) disc(ctx, x + 4.5, y - h - 2, 3, css(lit([240, 244, 252], P)));
}

function drawBarn(ctx, w, P, hour) {
    var B = w.barn, x = B.x, y = B.y, bw = B.w, h = B.h, r;
    var red = lit([176, 56, 48], P), redC = css(red), redD = css(mul(red, 0.78)), white = css(lit([240, 236, 228], P));
    var roof = lit([70, 64, 70], P), roofC = css(roof), snow = css(lit([240, 244, 252], P));
    rect(ctx, x, y - h, bw, h, redC);
    ctx.fillStyle = redD;
    for (var k = x + 2; k < x + bw; k += 3) ctx.fillRect(k, y - h, 1, h);
    // Techo a la holandesa (dos pendientes por lado), con hastial rojo.
    var cx = x + bw / 2 - 0.5, prof = [[0, 22], [3, 21], [6, 19], [8, 16], [10, 12], [12, 7], [13, 3]];
    for (r = 0; r < prof.length; r++) {
        var y0 = y - h - prof[r][0], y1 = r + 1 < prof.length ? y - h - prof[r + 1][0] : y0 - 1, hw = prof[r][1];
        for (var yy = y0; yy > y1; yy--) {
            rect(ctx, Math.round(cx - hw), yy - 1, hw * 2 + 1, 1, redC);
            rect(ctx, Math.round(cx - hw) - 1, yy - 1, 2, 1, roofC);
            rect(ctx, Math.round(cx + hw), yy - 1, 2, 1, roofC);
            if (P.snowCover > 0.1) { rect(ctx, Math.round(cx - hw) - 1, yy - 2, 2, 1, snow); rect(ctx, Math.round(cx + hw), yy - 2, 2, 1, snow); }
        }
    }
    rect(ctx, Math.round(cx) - 1, y - h - 15, 3, 1, roofC);
    // Portón con la X blanca y ventana del pajar.
    rect(ctx, Math.round(cx) - 7, y - 13, 15, 13, redD);
    rect(ctx, Math.round(cx) - 7, y - 13, 15, 1, white); rect(ctx, Math.round(cx) - 7, y - 13, 1, 13, white);
    rect(ctx, Math.round(cx) + 7, y - 13, 1, 13, white); rect(ctx, Math.round(cx), y - 13, 1, 13, white);
    for (k = 0; k < 6; k++) {
        rect(ctx, Math.round(cx) - 6 + k, y - 12 + k * 2, 1, 2, white); rect(ctx, Math.round(cx) - 1 - k, y - 12 + k * 2, 1, 2, white);
        rect(ctx, Math.round(cx) + 1 + k, y - 12 + k * 2, 1, 2, white); rect(ctx, Math.round(cx) + 6 - k, y - 12 + k * 2, 1, 2, white);
    }
    rect(ctx, Math.round(cx) - 3, y - h - 8, 7, 6, white);
    rect(ctx, Math.round(cx) - 2, y - h - 7, 5, 4, css(lit([200, 168, 90], P)));
    rect(ctx, Math.round(cx) - 2, y - h - 7, 5, 1, css(lit([60, 40, 30], P)));
    rect(ctx, x, y - h, bw, 1, white);
    // Farol sobre el portón.
    if (P.night > 0.4) {
        ctx.globalAlpha = 0.25; disc(ctx, cx, y - 16, 6, "#ffe0a0"); ctx.globalAlpha = 0.1; ell(ctx, cx, y + 3, 14, 3, "#ffe0a0"); ctx.globalAlpha = 1;
        rect(ctx, Math.round(cx), y - 16, 1, 2, "#fff0c0");
    }
}

function drawFarmhouse(ctx, w, P, hour) {
    var Hs = w.house, x = Hs.x, y = Hs.y, hw = Hs.w, h = Hs.h, r, i;
    var wall = lit([238, 232, 216], P), wallC = css(wall), wallD = css(mul(wall, 0.84));
    var roof = lit([84, 92, 120], P), snow = css(lit([240, 244, 252], P)), night = P.night > 0.35;
    var on = night && (hour >= 17.5 && hour < 23 || hour >= 5 && hour < 7);
    rect(ctx, x, y - h, hw, h, wallC);
    rect(ctx, x + hw - 2, y - h, 2, h, wallD);
    for (r = 0; r < 10; r++) rect(ctx, x - 3 + r, y - h - 1 - r, hw + 6 - 2 * r, 1, css(r === 0 ? mul(roof, 0.7) : (P.snowCover > 0.2 && r > 2 ? lit([236, 240, 248], P) : roof)));
    rect(ctx, x + hw - 9, y - h - 13, 4, 6, css(lit([150, 80, 64], P)));
    if (P.snowCover > 0.2) rect(ctx, x + hw - 10, y - h - 14, 6, 1, snow);
    // Porche con postes y ventanas.
    rect(ctx, x - 2, y - 9, hw + 4, 1, css(lit([120, 90, 70], P)));
    for (i = 0; i < 4; i++) rect(ctx, x + i * Math.round((hw - 1) / 3), y - 8, 1, 8, css(lit([220, 214, 200], P)));
    rect(ctx, x + Math.round(hw / 2) - 2, y - 7, 4, 7, css(lit([110, 76, 52], P)));
    var glass = on ? "#ffcf70" : css(mix(lit([100, 130, 160], P), P.hor, 0.3));
    for (i = 0; i < 3; i++) {
        var wx = x + 4 + i * Math.round((hw - 12) / 2);
        rect(ctx, wx, y - h + 3, 4, 4, glass);
        rect(ctx, wx - 1, y - h + 3, 1, 4, css(lit([80, 110, 80], P))); rect(ctx, wx + 4, y - h + 3, 1, 4, css(lit([80, 110, 80], P)));
    }
    if (on) { rect(ctx, x + 3, y - 6, 3, 3, glass); rect(ctx, x + hw - 6, y - 6, 3, 3, glass); }
    // Tendedero: el poste; la ropa se mueve en la capa ambiental.
    var L = w.line, pole = css(lit([110, 84, 60], P));
    rect(ctx, L.x0, L.y, 1, y - L.y, pole);
    rect(ctx, L.x0 + 20, L.y, 1, y - L.y, pole);
}

// Aspas del molino: cuatro brazos con su enrejado de tela, girando.
function drawMillSails(ctx, w, P, t) {
    var M = w.mill, hx = M.x, hy = M.y - M.h - 2, ang = t * 0.9, sail = css(lit([236, 230, 214], P)), frame = css(lit([90, 66, 48], P));
    for (var k = 0; k < 4; k++) {
        var a = ang + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
        for (var s = 2; s <= 24; s++) {
            var px = hx + ca * s, py = hy + sa * s;
            if (s > 6) for (var o = 1; o <= 4; o++)
                rect(ctx, Math.round(px + nx * o), Math.round(py + ny * o), 1, 1, (s % 3 === 0 || o === 4) ? frame : sail);
            rect(ctx, Math.round(px), Math.round(py), 1, 1, frame);
        }
    }
    rect(ctx, hx - 1, hy - 1, 3, 3, frame);
}

// Girasoles en verano (pasto alto el resto del año) y un tramo de cerca delante de todo.
function drawFarmFront(ctx, w, P) {
    var H = w.H, i, k, m = w.month, sc = P.snowCover;
    var stem = css(lit([70, 120, 56], P)), leaf = css(lit([88, 140, 64], P)), snow = css(lit([240, 244, 252], P));
    var bloom = m >= 5 && m <= 8 && sc < 0.2;
    for (i = 0; i < w.flowers.length; i++) {
        var f = w.flowers[i];
        if ((i % 7) < 2) continue;
        var x = f.x, top = H - f.h;
        if (bloom) {
            rect(ctx, x, top, 1, f.h, stem);
            rect(ctx, x + f.lean, top + Math.round(f.h * 0.5), 2, 1, leaf);
            rect(ctx, x - f.lean, top + Math.round(f.h * 0.7), 2, 1, leaf);
            var pet = css(lit([246, 196, 40], P));
            rect(ctx, x - 2, top - 2, 5, 5, pet);
            rect(ctx, x - 3, top - 1, 7, 3, pet);
            rect(ctx, x - 1, top - 1, 3, 3, css(lit([110, 70, 36], P)));
        } else {
            var gc = sc > 0.3 ? snow : css(lit(m >= 8 && m <= 10 ? [180, 160, 96] : [96, 136, 70], P));
            for (k = 0; k < 3; k++) {
                var hh = Math.round(f.h * (0.3 + k * 0.12));
                rect(ctx, x + k - 1, H - hh, 1, hh, k === 1 ? stem : gc);
            }
        }
    }
    var wood = lit([150, 116, 84], P), woodC = css(wood), woodD = css(mul(wood, 0.72));
    var fx0 = w.fenceSide < 0 ? w.W - 70 : 0;
    rect(ctx, fx0, H - 16, 70, 2, woodC);
    rect(ctx, fx0, H - 9, 70, 2, woodC);
    for (k = 4; k < 70; k += 16) { rect(ctx, fx0 + k, H - 20, 3, 20, woodC); rect(ctx, fx0 + k + 2, H - 20, 1, 20, woodD); if (sc > 0.2) rect(ctx, fx0 + k, H - 21, 3, 1, snow); }
    if (sc > 0.2) rect(ctx, fx0, H - 17, 70, 1, snow);
}

// Capa ambiental del campo (4 fps): aspas de los aerogeneradores, humo, ropa tendida y luciérnagas.
function drawFarmAmbient(ctx, w, P, t) {
    var i, k;
    for (i = 0; i < w.turbines.length; i++) {
        var tb = w.turbines[i], hx = tb.x, hy = tb.y - tb.h, a0 = t * 1.2 + tb.ph, bc = css(mix(lit([240, 240, 244], P), P.haze, 0.4));
        for (k = 0; k < 3; k++) {
            var a = a0 + k * Math.PI * 2 / 3;
            for (var s = 1; s <= 7; s++) rect(ctx, Math.round(hx + Math.cos(a) * s), Math.round(hy + Math.sin(a) * s), 1, 1, bc);
        }
        if (P.night > 0.4 && Math.floor(t) % 2 === 0) rect(ctx, hx, hy - 1, 1, 1, "#ff4040");
    }
    var Hs = w.house;
    drawSmoke(ctx, P, Hs.x + Hs.w - 7, Hs.y - Hs.h - 14, t, 1, w.month >= 10 || w.month <= 2 || P.night > 0.5 ? 1 : 0.4);
    // Ropa tendida que se mece (no con lluvia ni de noche).
    var L = w.line;
    rect(ctx, L.x0, L.y, 21, 1, css(lit([200, 200, 200], P)));
    if (P.rain < 0.3 && P.night < 0.5) {
        var cols = [[220, 80, 80], [240, 240, 236], [80, 130, 210], [240, 200, 80]];
        for (k = 0; k < 4; k++) {
            var sw = Math.round(Math.sin(t * 2 + k) * 1.2), cx = L.x0 + 2 + k * 5;
            rect(ctx, cx, L.y + 1, 3, 3 + (k % 2), css(lit(cols[k], P)));
            rect(ctx, cx + sw, L.y + 4 + (k % 2), 3, 1, css(mul(lit(cols[k], P), 0.85)));
        }
    }
    drawFireflies(ctx, w, P, t, w.yP + 2, w.H - 4);
}

// Vacas, gallinas y vehículos del camino.
function stepFarm(w, dt, hour, P) {
    var R = Math.random, T = w.timers, W = w.W, i, j;
    var night = P.night > 0.7;
    for (i = 0; i < w.critters.length; i++) {
        var c = w.critters[i];
        c.tm -= dt;
        if (c.kind === "cow") {
            if (night) { c.state = "lie"; continue; }
            if (c.state === "lie") c.state = "graze";
            if (c.tm <= 0) {
                var r = R();
                c.state = r < 0.55 ? "graze" : (r < 0.8 ? "walk" : "stand");
                if (R() < 0.3) c.dir = -c.dir;
                c.tm = 3 + R() * 8;
            }
            if (c.state === "walk") {
                c.x += c.dir * 2.2 * dt; c.dist += 2.2 * dt;
                if (c.x < 14 || c.x > W - 14) { c.dir = -c.dir; c.x = clamp(c.x, 14, W - 14); }
            }
        } else {
            if (night) { c.state = "idle"; continue; }
            if (c.state === "run") {
                c.x += c.dir * 18 * dt; c.dist += 18 * dt;
                if (c.tm <= 0) { c.state = "idle"; c.tm = 1; }
            } else if (c.tm <= 0) {
                var r2 = R();
                c.state = r2 < 0.5 ? "peck" : (r2 < 0.8 ? "idle" : "hop");
                if (c.state === "hop") { c.x += c.dir * 3; c.dist += 3; }
                if (R() < 0.35 || Math.abs(c.x - c.hx) > 60) c.dir = c.x > c.hx ? -1 : 1;
                c.tm = 0.4 + R() * 1.6;
            }
            c.x = clamp(c.x, 4, W - 4);
            for (j = 0; j < w.people.length; j++) {
                var q = w.people[j];
                if (c.state !== "run" && Math.abs(q.x - c.x) < 10 && Math.abs(q.y - c.y) < 8) { c.state = "run"; c.dir = q.x < c.x ? 1 : -1; c.tm = 0.6; }
            }
        }
    }
    T.tractor -= dt;
    if (T.tractor <= 0) {
        T.tractor = 25 + R() * 50;
        if (hour >= 6 && hour < 20 && w.cars.length < 1) {
            var d = R() < 0.5 ? 1 : -1, tr = R() < 0.6;
            w.cars.push({ kind: tr ? "tractor" : "pickup", x: d > 0 ? -20 : W + 20, y: w.yR + 7, dir: d, speed: tr ? 6 + R() * 3 : 16 + R() * 8,
                col: tr ? rgb(pick(R, ["#3a8a3a", "#c83a2a"])) : rgb(pick(R, ["#4a6ac0", "#c8c8d0", "#a04030", "#3a3a44"])), skin: rgb(pick(R, SKINS)) });
        }
    }
    for (i = 0; i < w.cars.length; i++) w.cars[i].ph = (w.cars[i].ph || 0) + dt * w.cars[i].speed;   // step los mueve
}

function drawFarmLife(ctx, w, P, t) { drawMillSails(ctx, w, P, t); }

// Tractor (rueda trasera grande) o camioneta con caja; y es la línea del piso.
function drawFarmVehicle(ctx, car, P) {
    var d = car.dir, x = Math.round(car.x), y = car.y, c = lit(car.col, P), body = css(c), dark = css(mul(c, 0.7));
    var tire = "#1c1c24", hub = css(lit([200, 190, 120], P)), night = P.night > 0.4;
    function bx(o, len) { return d > 0 ? x + o : x - o - len + 1; }
    if (car.kind === "tractor") {
        rect(ctx, bx(-2, 11), y - 7, 11, 4, body);
        rect(ctx, bx(-2, 11), y - 4, 11, 1, dark);
        rect(ctx, bx(-7, 6), y - 13, 6, 7, css(mix(lit([150, 190, 220], P), P.hor, 0.3)));
        rect(ctx, bx(-7, 6), y - 14, 6, 1, body); rect(ctx, bx(-7, 1), y - 13, 1, 7, body); rect(ctx, bx(-2, 1), y - 13, 1, 7, body);
        rect(ctx, bx(-5, 2), y - 11, 2, 2, css(lit(car.skin, P)));
        rect(ctx, bx(-5, 2), y - 12, 2, 1, css(lit([216, 184, 108], P)));
        rect(ctx, bx(5, 1), y - 11, 1, 4, css(lit([60, 60, 66], P)));
        disc(ctx, bx(-5, 1), y - 4, 4, tire);
        disc(ctx, bx(-5, 1), y - 4, 1.5, hub);
        disc(ctx, bx(6, 1), y - 2, 2, tire);
        rect(ctx, bx(6, 1), y - 2, 1, 1, hub);
        var puff = Math.floor(car.ph / 2) % 3;
        ctx.globalAlpha = 0.4;
        rect(ctx, bx(5 - puff, 2), y - 13 - puff * 2, 2, 2, css(lit([150, 150, 156], P)));
        ctx.globalAlpha = 1;
        if (night) { rect(ctx, bx(8, 1), y - 6, 1, 1, "#fff4c0"); ctx.globalAlpha = 0.25; rect(ctx, bx(9, 6), y - 6, 6, 1, "#fff4c0"); ctx.globalAlpha = 1; }
        return;
    }
    rect(ctx, bx(-8, 18), y - 5, 18, 3, body);
    rect(ctx, bx(-8, 18), y - 2, 18, 1, dark);
    rect(ctx, bx(1, 6), y - 9, 6, 4, body);
    rect(ctx, bx(2, 4), y - 8, 4, 2, night ? "#2a2e48" : css(mix([150, 190, 230], P.hor, 0.3)));
    rect(ctx, bx(-8, 1), y - 7, 1, 2, body); rect(ctx, bx(-1, 1), y - 7, 1, 2, body);
    rect(ctx, bx(-6, 4), y - 7, 4, 2, css(lit([200, 168, 90], P)));          // paja en la caja
    disc(ctx, bx(-5, 1), y - 1, 1.5, tire); disc(ctx, bx(6, 1), y - 1, 1.5, tire);
    if (night) { rect(ctx, bx(9, 1), y - 4, 1, 1, "#fff4c0"); rect(ctx, bx(-8, 1), y - 4, 1, 1, "#ff4040"); }
}

// Vaca de perfil: pastando, parada, caminando o echada (de noche).
function drawCow(ctx, c, P, t) {
    var d = c.dir, x0 = Math.round(c.x) - 6, y0 = Math.round(c.y) - 9;
    var base = c.brown ? [150, 96, 60] : [240, 238, 232], patch = c.brown ? [240, 236, 228] : [40, 38, 42];
    var B = css(lit(base, P)), Pt = css(lit(patch, P)), pink = css(lit([230, 160, 160], P)), dark = css(lit([40, 36, 40], P));
    function px(cx, r, cw, ch, col) { rect(ctx, d > 0 ? x0 + cx : x0 + 12 - (cx + cw - 1), y0 + r, cw, ch, col); }
    var lie = c.state === "lie", ly = lie ? 3 : 0;
    px(0, 2 + ly, 10, 5, B);
    for (var k = 0; k < 3; k++) {
        var sx = Math.floor(hash2(c.spots, k) * 8), sy = Math.floor(hash2(c.spots, k + 9) * 3);
        px(sx, 2 + sy + ly, 2 + (k % 2), 2, Pt);
    }
    px(-1, 2 + ly, 1, 4, B); px(-1, 6 + ly, 1, 1, dark);                       // cola
    var down = c.state === "graze" && Math.floor(t * 0.7 + c.spots) % 4 !== 0;
    var hy = lie ? 3 : (down ? 5 : 1);
    px(10, hy, 3, 3, B); px(11, hy + 2, 2, 2, pink); px(10, hy - 1, 1, 1, dark); px(12, hy - 1, 1, 1, dark);
    px(11, hy, 1, 1, dark);
    if (!lie) {
        var f = c.state === "walk" ? Math.floor(c.dist / 2) % 2 : 0;
        px(1 + f, 7, 1, 2, B); px(3 - f, 7, 1, 2, B); px(7 + f, 7, 1, 2, B); px(9 - f, 7, 1, 2, B);
        px(5, 7, 2, 1, pink);
    }
}

// Gallina de 5×5: picotea, salta y sale corriendo si alguien pasa cerca.
function drawHen(ctx, c, P, t) {
    var d = c.dir, x0 = Math.round(c.x) - 2, y0 = Math.round(c.y) - 4;
    var B = css(lit(c.brown ? [176, 110, 60] : [244, 242, 236], P)), W2 = css(lit(c.brown ? [140, 84, 46] : [214, 212, 206], P));
    var red = css(lit([214, 60, 50], P)), beak = css(lit([240, 190, 60], P));
    function px(cx, r, cw, ch, col) { rect(ctx, d > 0 ? x0 + cx : x0 + 4 - (cx + cw - 1), y0 + r, cw, ch, col); }
    var peck = c.state === "peck" && Math.floor(t * 4 + c.x) % 2 === 0;
    px(0, 1, 1, 2, W2);
    px(1, 2, 3, 2, B); px(1, 3, 2, 1, W2);
    if (peck) { px(3, 3, 2, 1, B); px(4, 4, 1, 1, beak); px(4, 2, 1, 1, red); }
    else { px(3, 0, 2, 2, B); px(4, 1, 1, 1, beak); px(3, -1, 1, 1, red); }
    var f = c.state === "run" ? Math.floor(c.dist / 1.5) % 2 : 0;
    px(1 + f, 4, 1, 1, beak); px(3 - f, 4, 1, 1, beak);
}

// ---------- escena: calle ciberpunk ----------
// Calle lluviosa de una megaciudad: torres con miles de ventanas de colores, letreros de neón con
// signos inventados, un holograma, reflectores, tren elevado, autos voladores, autos que flotan sobre
// el asfalto mojado, vapor de las alcantarillas y gente con paraguas de neón. Llueve casi siempre y
// el smog tiñe el cielo; nunca nieva.

var CYBER_WIN = [[90, 230, 255], [255, 90, 200], [255, 200, 110], [170, 120, 255], [120, 255, 190]];

// Signos inventados de 3×4 (bits por fila), para los letreros.
function makeGlyphs(R, n) {
    var g = [];
    for (var i = 0; i < n; i++) {
        var rows = [];
        for (var r = 0; r < 4; r++) rows.push(ri(R, 1, 7));
        rows[ri(R, 0, 3)] = 7;
        g.push(rows);
    }
    return g;
}

function createCyber(W, H, seed, opts) {
    var R = rng(seed || 7), i, x;
    var w = { W: W, H: H, opts: opts || {}, scene: "cyber", noGulls: true, noBoats: true, noWater: true, noSnow: true, noStars: true, crowd: 18 };
    w.yB = Math.round(H * 0.72);       // pie de los edificios
    w.yW = w.yB;
    w.base = w.yB;
    w.axis = w.yB;
    w.yP = w.yB + 21;                  // acera de enfrente
    w.ground = w.yP;
    w.yT = w.yB - 52;                  // vía del tren elevado
    w.windows = []; w.antennas = []; w.signs = []; w.tvs = []; w.leds = []; w.screens = [];
    w.ads = []; w.bigAds = []; w.refl = []; w.layers = [[], [], []];
    w.lamps = []; w.benches = []; w.trees = []; w.hedge = [];

    // Torres lejanas (altísimas), torres medias con letreros y edificios bajos con tiendas.
    w.towers = [[], [], []];
    var spec = [[16, 44, 0.42, 0.8, -2, 4], [24, 56, 0.28, 0.56, 2, 14], [22, 40, 0, 0, 0, 3]];
    for (var d = 0; d < 3; d++) {
        for (x = -ri(R, 0, 20); x < W + 4; ) {
            var tw = ri(R, spec[d][0], spec[d][1]);
            var th = d < 2 ? ri(R, Math.round(H * spec[d][2]), Math.round(H * spec[d][3])) : ri(R, 26, 46);
            var tb = { x: x, w: tw, h: th, seed: ri(R, 0, 99999), col: d === 2 ? rgb(pick(R, ["#4a4058", "#3a4a5a", "#5a4a4a", "#46465a"])) : [44 + d * 10, 40 + d * 8, 70 + d * 6],
                spire: d < 2 && R() < 0.35 ? ri(R, 6, 18) : 0, step: d < 2 && R() < 0.4 ? ri(R, 4, Math.round(tw / 3)) : 0, lit: R() };
            if (d === 1 && R() < 0.7) {
                var sh = ri(R, 4, 7);
                tb.vsign = { x: R() < 0.5 ? x - 3 : x + tw - 2, y: w.yB - th + ri(R, 8, Math.max(10, th - sh * 5 - 30)), g: makeGlyphs(R, sh), c: ri(R, 0, NEON.length - 1), id: ri(R, 0, 9999) };
            }
            if (d === 2) {
                tb.shop = { c: ri(R, 0, NEON.length - 1), g: makeGlyphs(R, ri(R, 3, Math.max(3, Math.floor((tw - 4) / 4)))), id: ri(R, 0, 9999), awning: R() < 0.5,
                    warm: R() < 0.5, ac: R() < 0.7 ? ri(R, 2, tw - 8) : -1, pipe: R() < 0.5 };
            }
            w.towers[d].push(tb);
            x += tw + ri(R, spec[d][4], spec[d][5]);
        }
    }
    // Holograma sobre la torre media más ancha.
    var big = w.towers[1][0];
    for (i = 1; i < w.towers[1].length; i++) if (w.towers[1][i].w > big.w && w.towers[1][i].x > 10 && w.towers[1][i].x < W - 50) big = w.towers[1][i];
    w.holo = { x: big.x + Math.round(big.w / 2), y: w.yB - big.h + Math.round(Math.min(big.h * 0.3, 40)) + 14 };
    // Reflectores en dos torres lejanas.
    w.beams = [];
    for (i = 0; i < 2; i++) {
        var ft = w.towers[0][ri(R, 0, w.towers[0].length - 1)];
        w.beams.push({ x: ft.x + Math.round(ft.w / 2), y: w.yB - ft.h - ft.spire, ph: R() * 6, sp: 0.25 + R() * 0.2 });
    }
    // Pilares del tren, máquinas expendedoras, alcantarillas con vapor y un puesto de fideos.
    w.pillars = [];
    for (x = ri(R, 20, 50); x < W; x += ri(R, 70, 110)) w.pillars.push(x);
    w.vending = [];
    for (i = 0; i < Math.max(2, Math.round(W / 160)); i++) w.vending.push({ x: ri(R, 6, W - 12), c: ri(R, 0, NEON.length - 1) });
    w.vents = [];
    for (i = 0; i < Math.max(2, Math.round(W / 180)); i++) w.vents.push({ x: ri(R, 10, W - 10), y: w.yB + ri(R, 10, 18) });
    w.stand = { x: ri(R, Math.round(W * 0.2), Math.round(W * 0.8)), y: w.yP + 10 };
    w.lanes = [w.yB + 5];
    for (var y = w.yP + 7; y < H - 3; y += 7) w.lanes.push(y);

    // Silueta contra el cielo.
    w.sky = [];
    for (x = 0; x < W; x++) w.sky.push(w.yB);
    for (d = 0; d < 3; d++)
        for (i = 0; i < w.towers[d].length; i++) {
            var T = w.towers[d][i];
            for (x = T.x; x < T.x + T.w; x++) if (x >= 0 && x < W) w.sky[x] = Math.min(w.sky[x], w.yB - T.h);
            var sx = T.x + Math.round(T.w / 2);
            if (T.spire && sx >= 0 && sx < W) w.sky[sx] = Math.min(w.sky[sx], w.yB - T.h - T.spire);
        }

    genSky(w, R);
    initLife(w, R);
    w.rainChance = 0.75;
    w.rain = w.rainTarget = 0.7;       // empieza lloviendo
    w.timers.weather = 300 + R() * 600;
    w.fliers = [];
    w.drones = [];
    for (i = 0; i < 3; i++) w.drones.push({ x: ri(R, 20, W - 20), y: ri(R, 30, w.yT - 20), ph: R() * 6, sp: 4 + R() * 6 });
    w.train = null;
    w.timers.flier = 0;
    w.timers.train = 8;
    w.timers.hover = 0;
    return w;
}

// Smog: gris de día; de noche el horizonte se tiñe del neón de la ciudad y no se ven estrellas.
function tintCyber(P, w) {
    var n = P.night;
    P.top = mix(P.top, mix([90, 100, 116], [26, 18, 50], n), 0.4);
    P.mid = mix(P.mid, mix([140, 146, 156], [92, 40, 112], n), 0.45);
    P.hor = mix(P.hor, mix([176, 172, 166], [210, 84, 156], n), 0.5);
    P.cl = mix(P.cl, mix([170, 172, 178], [126, 70, 136], n), 0.45);
    P.cs = mix(P.cs, mix([112, 114, 124], [60, 30, 82], n), 0.45);
}

function drawCyber(ctx, w, P, t) {
    var W = w.W, H = w.H, yB = w.yB, hour = P.hour, i, x, y, d;
    ctx.clearRect(0, 0, W, H);
    var night = P.night > 0.35, nk = clamp((P.night - 0.2) / 0.6, 0, 1);
    for (d = 0; d < 3; d++) {
        if (d === 2) drawTrack(ctx, w, P);
        for (i = 0; i < w.towers[d].length; i++) drawCyberTower(ctx, w, w.towers[d][i], d, P, nk, hour);
        if (P.fog > 0.02 || d < 2) {
            // Smog entre capas (más con neblina).
            var fh = Math.round(yB * 0.7), fa = (d === 0 ? 0.35 : (d === 1 ? 0.2 : 0)) + 0.3 * P.fog;
            ctx.fillStyle = css(P.fogc);
            for (var fy = 0; fy < fh; fy += 2) { var u = 1 - fy / fh; ctx.globalAlpha = fa * u * u; ctx.fillRect(0, yB - fy - 2, W, 2); }
            ctx.globalAlpha = 1;
        }
    }
    // Acera de atrás, calle y acera de enfrente, siempre mojadas.
    var walk = lit([84, 82, 100], P), road = lit([40, 40, 52], P);
    rect(ctx, 0, yB, W, 7, css(walk));
    rect(ctx, 0, yB, W, 1, css(mix(walk, [255, 255, 255], 0.12)));
    rect(ctx, 0, yB + 7, W, 14, css(road));
    rect(ctx, 0, yB + 7, W, 1, css(mul(walk, 0.7)));
    ctx.fillStyle = css(mix(road, [220, 220, 160], 0.35));
    for (x = 0; x < W; x += 14) ctx.fillRect(x, yB + 14, 7, 1);
    rect(ctx, 0, w.yP, W, H - w.yP, css(walk));
    rect(ctx, 0, w.yP, W, 1, css(mix(walk, [255, 255, 255], 0.12)));
    ctx.fillStyle = css(mul(walk, 0.88));
    for (y = w.yP + 6; y < H; y += 6) ctx.fillRect(0, y, W, 1);
    for (y = w.yP; y < H; y += 6) for (x = (y / 6 % 2) * 8; x < W; x += 16) ctx.fillRect(x, y, 1, 6);
    // Reflejos del neón y de las vitrinas en el piso mojado: franjas que se cortan.
    var wet = (0.2 + 0.35 * Math.max(P.rain, 0.3)) * (night ? 1 : 0.3);
    for (i = 0; i < w.towers[2].length; i++) {
        var T = w.towers[2][i], gw = T.shop.g.length * 4 + 1, sx0 = T.x + Math.round((T.w - gw) / 2);
        for (y = yB + 1; y < yB + 26; y += 2) {
            var fade = 1 - (y - yB) / 26;
            if (hash2(T.seed, y) < 0.3) continue;
            ctx.globalAlpha = wet * fade;
            rect(ctx, sx0 + Math.round(Math.sin(y * 0.9 + T.seed) * 1.5), y, gw, 1, NEON[T.shop.c]);
            if (y < yB + 8 && night) { ctx.globalAlpha = wet * fade * 0.5; rect(ctx, T.x + 3, y, T.w - 6, 1, T.shop.warm ? "#ffd696" : "#96e6ff"); }
        }
    }
    ctx.globalAlpha = 1;
    // Alcantarillas, expendedoras y puesto de fideos.
    for (i = 0; i < w.vents.length; i++) { ell(ctx, w.vents[i].x, w.vents[i].y, 3, 1, css(lit([28, 28, 36], P))); }
    for (i = 0; i < w.vending.length; i++) {
        var V = w.vending[i], vc = rgb(NEON[V.c]);
        rect(ctx, V.x, yB - 11, 7, 12, css(lit([60, 60, 74], P)));
        rect(ctx, V.x + 1, yB - 10, 5, 6, css(night ? vc : mix(lit(vc, P), [90, 90, 100], 0.5)));
        for (var k = 0; k < 3; k++) rect(ctx, V.x + 1 + k * 2, yB - 9, 1, 4, css(mix(lit([240, 240, 240], P), vc, 0.3)));
        rect(ctx, V.x + 1, yB - 3, 5, 1, css(lit([20, 20, 26], P)));
    }
    drawNoodleStand(ctx, w.stand, P, night);
}

// Una torre (o edificio bajo con tienda si d = 2).
function drawCyberTower(ctx, w, T, d, P, nk, hour) {
    var yB = w.yB, x = T.x, top = yB - T.h, k, r;
    var haze = [0.45, 0.22, 0][d];
    var body = mix(lit(T.col, P), P.haze, haze), bodyC = css(body), bodyD = css(mul(body, 0.8)), bodyL = css(mix(body, [255, 255, 255], 0.08));
    rect(ctx, x, top, T.w, T.h, bodyC);
    rect(ctx, x + T.w - Math.max(2, Math.round(T.w * 0.2)), top, Math.max(2, Math.round(T.w * 0.2)), T.h, bodyD);
    rect(ctx, x, top, 1, T.h, bodyL);
    if (T.step) { rect(ctx, x + T.step, top - 6, T.w - 2 * T.step, 6, bodyC); rect(ctx, x + T.step, top - 6, 1, 6, bodyL); }
    if (T.spire) {
        var sx = x + Math.round(T.w / 2);
        rect(ctx, sx, top - T.spire - (T.step ? 6 : 0), 1, T.spire, bodyD);
        if (nk > 0.2) rect(ctx, sx, top - T.spire - (T.step ? 6 : 0), 1, 1, "#ff4060");
    }
    // Ventanas: de noche muchas encendidas, de colores; de día reflejan el cielo.
    var gx = d === 0 ? 3 : 4, gy = d === 0 ? 3 : 4, ww = d === 0 ? 1 : 2;
    var wtop = top + 3, wbot = d === 2 ? yB - 15 : yB - 2;
    var dayC = css(mix(mul(P.hor, 0.7), body, 0.5)), pal = CYBER_WIN[T.seed % CYBER_WIN.length];
    for (var wy = wtop; wy < wbot; wy += gy)
        for (var wx = x + 2; wx < x + T.w - 2 - ww; wx += gx) {
            var hsh = hash2(T.seed + wx, wy);
            if (nk > 0.05 && hsh < (0.25 + 0.4 * T.lit) * nk) {
                var c = hsh < 0.05 ? CYBER_WIN[(T.seed + wy) % CYBER_WIN.length] : pal;
                rect(ctx, wx, wy, ww, 1, css(mix(c, P.haze, haze * 0.8)));
            } else if (hsh > 0.6) rect(ctx, wx, wy, ww, 1, dayC);
        }
    // Franjas horizontales y letrero vertical.
    if (d === 1) {
        ctx.fillStyle = bodyD;
        for (r = top + 12; r < yB; r += 18) ctx.fillRect(x, r, T.w, 1);
        if (T.vsign) drawNeonSign(ctx, T.vsign.x, T.vsign.y, T.vsign.g, true, NEON[T.vsign.c], P, nk);
    }
    if (d < 2) return;
    // Planta baja: vitrina iluminada, letrero de neón, toldo, aire acondicionado y tubos.
    var S = T.shop, sc = rgb(NEON[S.c]);
    var glass = nk > 0.3 ? (S.warm ? [255, 214, 150] : [150, 230, 255]) : mix(mul(P.hor, 0.8), [60, 70, 90], 0.4);
    rect(ctx, x + 2, yB - 10, T.w - 4, 10, css(lit([30, 28, 40], P)));
    rect(ctx, x + 3, yB - 9, T.w - 6, 8, css(glass));
    for (k = x + 3 + 6; k < x + T.w - 4; k += 7) rect(ctx, k, yB - 9, 1, 8, css(lit([40, 38, 50], P)));
    if (nk > 0.3) for (k = 0; k < 3; k++) rect(ctx, x + 5 + Math.floor(hash2(T.seed, k) * (T.w - 12)), yB - 6, 2, 5, css(mul(glass, 0.55)));
    var gw = S.g.length * 4 + 1;
    drawNeonSign(ctx, x + Math.round((T.w - gw) / 2), yB - 17, S.g, false, NEON[S.c], P, nk);
    if (S.awning) {
        for (k = 0; k < T.w; k++) rect(ctx, x + k, yB - 11, 1, 2, css(lit(k % 4 < 2 ? sc : [230, 230, 236], P)));
    }
    if (S.ac >= 0) {
        var ay = top + 6;
        rect(ctx, x + S.ac, ay, 6, 4, css(lit([170, 172, 180], P)));
        rect(ctx, x + S.ac + 1, ay + 1, 3, 2, css(lit([90, 92, 100], P)));
    }
    if (S.pipe) { rect(ctx, x + T.w - 3, top, 1, T.h - 11, css(lit([110, 110, 120], P))); }
    rect(ctx, x, top, T.w, 1, css(lit([110, 106, 124], P)));
}

// Letrero de neón con signos inventados (vertical u horizontal); de noche brilla.
function drawNeonSign(ctx, x, y, glyphs, vert, col, P, nk) {
    var c = rgb(col), on = nk > 0.3;
    var n = glyphs.length, w = vert ? 5 : n * 4 + 1, h = vert ? n * 5 + 1 : 6;
    rect(ctx, x, y, w, h, css(lit([22, 18, 32], P)));
    var gc = css(on ? mix(c, [255, 255, 255], 0.3) : mix(lit(c, P), [90, 90, 100], 0.45));
    var fc = css(on ? c : mix(lit(c, P), [80, 80, 90], 0.5));
    rect(ctx, x, y, w, 1, fc); rect(ctx, x, y + h - 1, w, 1, fc); rect(ctx, x, y, 1, h, fc); rect(ctx, x + w - 1, y, 1, h, fc);
    ctx.fillStyle = gc;
    for (var i = 0; i < n; i++) {
        var gx = vert ? x + 1 : x + 1 + i * 4, gy = vert ? y + 1 + i * 5 : y + 1;
        for (var r = 0; r < 4; r++) for (var b = 0; b < 3; b++) if (glyphs[i][r] & (1 << b)) ctx.fillRect(gx + b, gy + r, 1, 1);
    }
}

function drawTrack(ctx, w, P) {
    var W = w.W, yT = w.yT, beam = lit([70, 70, 86], P), i;
    for (i = 0; i < w.pillars.length; i++) {
        var px = w.pillars[i];
        rect(ctx, px - 2, yT + 3, 5, w.yB - yT - 3, css(mul(beam, 0.85)));
        rect(ctx, px - 2, yT + 3, 1, w.yB - yT - 3, css(mix(beam, [255, 255, 255], 0.1)));
        rect(ctx, px - 5, yT + 3, 11, 2, css(beam));
    }
    rect(ctx, 0, yT, W, 4, css(beam));
    rect(ctx, 0, yT, W, 1, css(mix(beam, [255, 255, 255], 0.2)));
    rect(ctx, 0, yT + 4, W, 1, css(mul(beam, 0.6)));
    ctx.fillStyle = css(mul(beam, 0.7));
    for (var x = 0; x < W; x += 6) ctx.fillRect(x, yT + 2, 3, 1);
    // Luces bajo la vía.
    if (P.night > 0.35) for (x = 4; x < W; x += 12) { rect(ctx, x, yT + 4, 1, 1, "#9ff0ff"); ctx.globalAlpha = 0.2; rect(ctx, x - 1, yT + 5, 3, 2, "#9ff0ff"); ctx.globalAlpha = 1; }
}

function drawNoodleStand(ctx, s, P, night) {
    var x = s.x, y = s.y, wood = lit([120, 80, 56], P), red = lit([200, 50, 50], P);
    rect(ctx, x - 12, y - 7, 24, 7, css(wood));
    rect(ctx, x - 12, y - 7, 24, 1, css(mix(wood, [255, 255, 255], 0.2)));
    rect(ctx, x - 11, y - 18, 1, 11, css(mul(wood, 0.7))); rect(ctx, x + 10, y - 18, 1, 11, css(mul(wood, 0.7)));
    for (var k = -13; k <= 13; k++) rect(ctx, x + k, y - 20, 1, 3, css(Math.floor((k + 13) / 3) % 2 ? lit([240, 236, 230], P) : red));
    rect(ctx, x - 13, y - 17, 27, 1, css(mul(red, 0.7)));
    // Faroles de papel.
    for (k = -1; k <= 1; k += 2) {
        rect(ctx, x + k * 8 - 1, y - 16, 3, 4, night ? "#ff7050" : css(red));
        if (night) { ctx.globalAlpha = 0.25; disc(ctx, x + k * 8, y - 14, 4, "#ff9070"); ctx.globalAlpha = 1; }
    }
    rect(ctx, x - 6, y - 10, 3, 3, css(lit([230, 230, 230], P))); rect(ctx, x + 2, y - 10, 3, 3, css(lit([230, 230, 230], P)));
    rect(ctx, x - 9, y - 1, 2, 1, css(lit([60, 60, 70], P))); rect(ctx, x + 7, y - 1, 2, 1, css(lit([60, 60, 70], P)));
}

// Primer plano: postes de luz con cables y un letrero de neón grande que cuelga en una orilla.
function drawCyberFront(ctx, w, P) {
    var W = w.W, H = w.H, nk = clamp((P.night - 0.2) / 0.6, 0, 1), pole = css(lit([34, 34, 44], P));
    var px = w.holo.x < W / 2 ? W - 14 : 10;
    rect(ctx, px, Math.round(H * 0.3), 3, H, pole);
    rect(ctx, px - 8, Math.round(H * 0.3), 19, 2, pole);
    rect(ctx, px - 9, Math.round(H * 0.3) + 2, 4, 2, css(nk > 0.3 ? [255, 250, 230] : lit([200, 200, 200], P)));
    var g = w.frontSign || (w.frontSign = makeGlyphs(rng(77), 6));
    drawNeonSign(ctx, px < W / 2 ? px + 4 : px - 6, Math.round(H * 0.42), g, true, NEON[1], P, nk);
    ctx.fillStyle = pole;
    for (var x = 0; x < W; x++) {
        var u = x / W, y = Math.round(H * 0.08 + Math.sin(u * Math.PI) * 14);
        ctx.fillRect(x, y, 1, 1);
        if (x % 37 === 0) ctx.fillRect(x, y, 1, 3);
    }
}

// Capa ambiental (4 fps): resplandor y parpadeo del neón, holograma, reflectores y vapor.
function drawCyberAmbient(ctx, w, P, t) {
    var W = w.W, i, k, nk = clamp((P.night - 0.2) / 0.6, 0, 1), tick = Math.floor(t * 4);
    // Reflectores que barren el cielo (solo donde se ve cielo).
    if (nk > 0.3) {
        for (i = 0; i < w.beams.length; i++) {
            var B = w.beams[i], a = -Math.PI / 2 + Math.sin(t * B.sp + B.ph) * 0.7, ca = Math.cos(a), sa = Math.sin(a);
            for (var s = 4; s < 160; s += 1) {
                var bx = Math.round(B.x + ca * s), by = Math.round(B.y + sa * s), half = 1 + Math.floor(s * 0.06);
                if (by < 0) break;
                ctx.globalAlpha = 0.07 * nk * (1 - s / 160);
                for (k = -half; k <= half; k++) skyDot(ctx, w, bx + k, by, "#d8e8ff");
            }
        }
        ctx.globalAlpha = 1;
    }
    // Holograma: medusa translúcida con líneas de barrido.
    var Hh = w.holo, pulse = Math.sin(t * 1.6), hx = Hh.x, hy = Math.round(Hh.y + Math.sin(t * 0.7) * 3);
    var hc = Math.floor(t / 8) % 2 ? "#5ff2ff" : "#ff5fd0", glitch = hash2(tick, 3) < 0.06 ? 2 : 0;
    ctx.globalAlpha = 0.25 + 0.35 * nk;
    var rx = 9 + Math.round(pulse), ry = 7 - Math.round(pulse * 0.5);
    ctx.fillStyle = hc;
    for (var yy = -ry; yy <= 0; yy++) {
        if ((yy + tick) % 3 === 0) continue;
        var hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry)));
        ctx.fillRect(hx - hw + glitch * ((yy % 2) ? 1 : -1), hy + yy, hw * 2 + 1, 1);
    }
    for (k = -3; k <= 3; k++)
        for (var j = 1; j < 16; j++) {
            if ((j + tick) % 3 === 0) continue;
            ctx.fillRect(Math.round(hx + k * 2.5 + Math.sin(t * 2 + j * 0.4 + k) * (j * 0.18)), hy + j, 1, 1);
        }
    ctx.globalAlpha = 0.12 * nk;
    ell(ctx, hx, hy + 4, 18, 16, hc);
    ctx.globalAlpha = 1;
    // Resplandor y parpadeo de los letreros.
    if (nk > 0.3) {
        for (i = 0; i < w.towers[1].length; i++) {
            var vs = w.towers[1][i].vsign;
            if (!vs) continue;
            var vh = vs.g.length * 5 + 1;
            if (hash2(vs.id, Math.floor(t * 6)) < 0.03) { rect(ctx, vs.x, vs.y, 5, vh, css(lit([22, 18, 32], P))); continue; }
            ctx.globalAlpha = 0.14 * nk;
            rect(ctx, vs.x - 3, vs.y - 2, 11, vh + 4, NEON[vs.c]);
            ctx.globalAlpha = 1;
        }
        for (i = 0; i < w.towers[2].length; i++) {
            var T = w.towers[2][i], S = T.shop, gw = S.g.length * 4 + 1, sx = T.x + Math.round((T.w - gw) / 2);
            if (hash2(S.id, Math.floor(t * 5)) < 0.025) { rect(ctx, sx, w.yB - 17, gw, 6, css(lit([22, 18, 32], P))); continue; }
            ctx.globalAlpha = 0.16 * nk;
            rect(ctx, sx - 2, w.yB - 19, gw + 4, 10, NEON[S.c]);
            ctx.globalAlpha = 1;
        }
        // Brillos que tiemblan en los charcos.
        for (i = 0; i < 40; i++) {
            if (hash2(i, tick) > 0.5) continue;
            var px = Math.floor(hash2(i, 5) * W), py = w.yB + 2 + Math.floor(hash2(i, 6) * (w.H - w.yB - 3));
            ctx.globalAlpha = 0.35;
            rect(ctx, px, py, 2 + Math.floor(hash2(i, tick + 1) * 3), 1, NEON[i % NEON.length]);
        }
        ctx.globalAlpha = 1;
    }
    // Vapor de las alcantarillas y del puesto de fideos.
    for (i = 0; i < w.vents.length; i++) drawSteam(ctx, P, w.vents[i].x, w.vents[i].y, t + i * 3);
    drawSteam(ctx, P, w.stand.x, w.stand.y - 10, t);
}

function drawSteam(ctx, P, x, y, t) {
    var c = css(lit([220, 220, 230], P));
    for (var i = 0; i < 6; i++) {
        var age = (t * 0.2 + i / 6) % 1;
        ctx.globalAlpha = 0.28 * (1 - age);
        disc(ctx, x + Math.sin(t * 0.9 + i * 2) * age * 4, y - age * 22, 1 + age * 4, c);
    }
    ctx.globalAlpha = 1;
}

// Autos voladores, drones, tren elevado y autos que flotan sobre la calle.
function stepCyber(w, dt, hour, P) {
    var R = Math.random, T = w.timers, W = w.W, H = w.H, i;
    var bz = busy(hour);
    T.flier -= dt;
    if (T.flier <= 0) {
        T.flier = (1 + R() * 2.5) / Math.max(bz, 0.3);
        if (w.fliers.length < Math.round(10 * Math.max(1, W / 480))) {
            var lane = Math.floor(R() * 4), d = lane % 2 ? 1 : -1;
            var ly = [H * 0.16, H * 0.24, H * 0.32, w.yT - 16][lane] + R() * 4;
            w.fliers.push({ x: d > 0 ? -12 : W + 12, y: Math.round(ly), dir: d, speed: 30 + R() * 30 + lane * 4, far: lane < 2,
                col: rgb(pick(R, ["#d0d4e0", "#3a3a48", "#c83a4a", "#e0b040", "#2a6ad0"])), glow: rgb(pick(R, NEON)) });
        }
    }
    for (i = w.fliers.length - 1; i >= 0; i--) {
        var f = w.fliers[i];
        f.x += f.dir * f.speed * dt;
        if (f.x < -20 || f.x > W + 20) w.fliers.splice(i, 1);
    }
    for (i = 0; i < w.drones.length; i++) {
        var dr = w.drones[i];
        dr.ph += dt;
        dr.x += Math.cos(dr.ph * 0.3) * dr.sp * dt;
        dr.y += Math.sin(dr.ph * 0.5) * 2 * dt;
        if (dr.x < -10) dr.x = W + 8; if (dr.x > W + 10) dr.x = -8;
    }
    if (w.train) {
        w.train.x += w.train.dir * 70 * dt;
        if (w.train.x < -140 || w.train.x > W + 140) w.train = null;
    } else {
        T.train -= dt;
        if (T.train <= 0) {
            T.train = 25 + R() * 40;
            if (hour >= 5 || hour < 1.5) { var td = R() < 0.5 ? 1 : -1; w.train = { x: td > 0 ? -130 : W + 130, dir: td, cars: 3 + Math.floor(R() * 2) }; }
        }
    }
    T.hover -= dt;
    if (T.hover <= 0) {
        T.hover = (1.5 + R() * 4) / Math.max(bz, 0.2);
        var hd = R() < 0.5 ? 1 : -1;
        w.cars.push({ kind: "hover", x: hd > 0 ? -18 : W + 18, y: hd > 0 ? w.yB + 13 : w.yB + 19, dir: hd, speed: 26 + R() * 20,
            col: rgb(pick(R, ["#d04848", "#2a2a36", "#e8e8f0", "#e0b040", "#3a7ad0", "#7a4ac0"])), glow: rgb(pick(R, NEON)), taxi: R() < 0.2 });
    }
}

function drawCyberLife(ctx, w, P, t) {
    var i, nk = clamp((P.night - 0.2) / 0.6, 0, 1);
    // Tren elevado.
    if (w.train) {
        var tr = w.train, body = lit([200, 204, 214], P), win = nk > 0.3 ? "#bff4ff" : css(mix(mul(P.hor, 0.7), [60, 70, 90], 0.4));
        for (var c = 0; c < tr.cars; c++) {
            var cx = Math.round(tr.x - tr.dir * c * 32) - 15;
            rect(ctx, cx, w.yT - 9, 30, 9, css(body));
            rect(ctx, cx, w.yT - 9, 30, 1, css(mix(body, [255, 255, 255], 0.3)));
            rect(ctx, cx + 1, w.yT - 7, 28, 3, win);
            rect(ctx, cx, w.yT - 3, 30, 1, css(lit(NEON[1] === "#5ff2ff" ? [95, 242, 255] : [255, 95, 162], P)));
            ctx.fillStyle = css(mul(body, 0.7));
            for (var k = cx + 5; k < cx + 30; k += 6) ctx.fillRect(k, w.yT - 7, 1, 3);
        }
        var head = tr.dir > 0 ? Math.round(tr.x) + 15 : Math.round(tr.x) - 16;
        rect(ctx, head, w.yT - 6, 1, 2, "#fff4c0");
        if (nk > 0.3) { ctx.globalAlpha = 0.2; rect(ctx, tr.dir > 0 ? head + 1 : head - 14, w.yT - 6, 14, 2, "#fff4c0"); ctx.globalAlpha = 1; }
    }
    // Autos voladores.
    for (i = 0; i < w.fliers.length; i++) {
        var f = w.fliers[i], x = Math.round(f.x), y = f.y, d = f.dir, col = lit(f.col, P);
        if (f.far) col = mix(col, P.haze, 0.35);
        rect(ctx, x - 4, y, 9, 2, css(col));
        rect(ctx, d > 0 ? x : x - 3, y - 1, 4, 1, css(mix(lit([150, 200, 240], P), P.hor, 0.3)));
        rect(ctx, x - 4, y + 2, 9, 1, css(mul(col, 0.7)));
        ctx.globalAlpha = 0.5 + 0.4 * nk;
        rect(ctx, x - 3, y + 3, 7, 1, css(f.glow));
        ctx.globalAlpha = 1;
        rect(ctx, d > 0 ? x + 4 : x - 4, y, 1, 1, "#fff4c0");
        rect(ctx, d > 0 ? x - 4 : x + 4, y, 1, 1, "#ff3040");
        if (nk > 0.3) {
            ctx.globalAlpha = 0.18;
            rect(ctx, d > 0 ? x + 5 : x - 14, y, 10, 1, "#fff4c0");
            ctx.globalAlpha = 0.25;
            rect(ctx, d > 0 ? x - 12 : x + 5, y + 1, 8, 1, "#ff3040");
            ctx.globalAlpha = 1;
        }
    }
    // Drones con luz que parpadea.
    for (i = 0; i < w.drones.length; i++) {
        var dr = w.drones[i], dx = Math.round(dr.x), dy = Math.round(dr.y);
        rect(ctx, dx - 1, dy, 3, 1, css(lit([60, 60, 70], P)));
        rect(ctx, dx - 2, dy - 1, 1, 1, css(lit([90, 90, 100], P))); rect(ctx, dx + 2, dy - 1, 1, 1, css(lit([90, 90, 100], P)));
        if (Math.floor(t * 2 + dr.ph) % 2 === 0) rect(ctx, dx, dy + 1, 1, 1, i % 2 ? "#5ff2ff" : "#ff5050");
    }
}

// Auto que flota sobre la calle, con luz de neón debajo.
function drawHoverCar(ctx, car, P) {
    var d = car.dir, x = Math.round(car.x), y = car.y, c = lit(car.col, P), nk = clamp((P.night - 0.2) / 0.6, 0, 1);
    function bx(o, len) { return d > 0 ? x + o : x - o - len + 1; }
    ctx.globalAlpha = 0.35 + 0.4 * nk;
    rect(ctx, bx(-8, 18), y - 1, 18, 1, css(car.glow));
    ctx.globalAlpha = 0.15 + 0.2 * nk;
    rect(ctx, bx(-10, 22), y, 22, 1, css(car.glow));
    ctx.globalAlpha = 1;
    rect(ctx, bx(-9, 19), y - 5, 19, 3, css(c));
    rect(ctx, bx(-9, 19), y - 3, 19, 1, css(mul(c, 0.7)));
    rect(ctx, bx(-4, 10), y - 8, 10, 3, css(c));
    rect(ctx, bx(-3, 8), y - 7, 8, 2, nk > 0.3 ? "#2a2e48" : css(mix([150, 190, 230], P.hor, 0.3)));
    rect(ctx, bx(-9, 19), y - 5, 19, 1, css(mix(c, [255, 255, 255], 0.3)));
    if (car.taxi) rect(ctx, bx(0, 3), y - 9, 3, 1, "#fff4a0");
    rect(ctx, bx(9, 1), y - 4, 1, 1, "#fff4c0");
    rect(ctx, bx(-9, 1), y - 4, 1, 1, "#ff3040");
    if (nk > 0.3) { ctx.globalAlpha = 0.22; rect(ctx, bx(10, 12), y - 4, 12, 1, "#fff4c0"); ctx.globalAlpha = 1; }
}

// ---------- tabla de escenas ----------
// Cada escena distinta de la ciudad: create arma el mundo, draw pinta la capa fija (cada ~30 s),
// front el primer plano, y opcionalmente ambient (4 fps), step (simulación), life (dibujo extra
// en la capa de vida, detrás de la gente) y tint (ajuste de la paleta).
var SCENES = {
    beach: { create: createBeach, draw: drawBeach, front: drawPalms, ambient: drawBeachAmbient, step: stepBeach,
        life: function (ctx, w, P, t) { for (var i = 0; i < w.swimmers.length; i++) drawSwimmer(ctx, w.swimmers[i], P, t); } },
    mountain: { create: createMountain, draw: drawMountain, front: drawMountainFront, ambient: drawMountainAmbient,
        step: stepMountain, life: drawMountainLife },
    village: { create: createVillage, draw: drawVillage, front: drawVillageFront, ambient: drawVillageAmbient,
        step: stepVillage, life: drawVillageLife },
    farm: { create: createFarm, draw: drawFarm, front: drawFarmFront, ambient: drawFarmAmbient, step: stepFarm, life: drawFarmLife },
    cyber: { create: createCyber, draw: drawCyber, front: drawCyberFront, ambient: drawCyberAmbient, step: stepCyber, life: drawCyberLife,
        tint: tintCyber }
};

// Vehículos de las escenas (w.cars con kind); los demás son los autos de la ciudad.
var VEHICLES = { tractor: drawFarmVehicle, pickup: drawFarmVehicle, hover: drawHoverCar };

// Animales que caminan entre la gente (w.critters): se ordenan por profundidad con ella.
var CRITTERS = { crab: drawCrab, deer: drawDeer, skater: function (ctx, c, P) { drawPerson(ctx, c, P); }, cow: drawCow, hen: drawHen };
