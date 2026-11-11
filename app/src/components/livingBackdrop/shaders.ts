/**
 * 背景动效着色器：在原图上做极轻的位移与光的呼吸，不另画新东西。
 *
 * 坐标约定：q 是图像坐标，左上角为 (0, 0)，与看图时的直觉一致。
 * 所有幅度都乘 uK（强度）和 uIntro（开场 0→1 渐入，保证与静态图无缝替换）。
 */

export const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const COMMON = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uView;
uniform float uImgAspect;
uniform vec2 uFocus;
uniform float uTime;
uniform float uK;
uniform float uIntro;
uniform float uPortrait;
varying vec2 vUv;

// Ashima 3D simplex noise (MIT)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
    i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
    i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// 0..1
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s * 0.5 + 0.5;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// 与 CSS object-fit: cover + object-position 等价的取样坐标
vec2 coverUv(vec2 uv) {
  float va = uView.x / uView.y;
  vec2 s = va > uImgAspect ? vec2(1.0, uImgAspect / va) : vec2(va / uImgAspect, 1.0);
  return uv * s + (1.0 - s) * vec2(uFocus.x, 1.0 - uFocus.y);
}

vec3 sampleImg(vec2 uv) { return texture2D(uTex, clamp(uv, 0.001, 0.999)).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`

/** 首页：竹叶随风、溪水流动、薄雾横移、天光呼吸 */
export const BAMBOO_FRAGMENT = COMMON + /* glsl */ `
void main() {
  vec2 uv = coverUv(vUv);
  vec2 q = vec2(uv.x, 1.0 - uv.y);
  float t = uTime;
  float k = uK * uIntro;
  bool portrait = uPortrait > 0.5;

  // 区域：竖图竹叶在上半幅，横图在右侧；水都在底部
  float bamboo = portrait
    ? 1.0 - smoothstep(0.42, 0.66, q.y)
    : smoothstep(0.3, 0.55, q.x) * (1.0 - smoothstep(0.6, 0.86, q.y));
  float water = portrait
    ? smoothstep(0.64, 0.74, q.y)
    : smoothstep(0.7, 0.78, q.y) * (1.0 - smoothstep(0.64, 0.78, q.x));

  // 风：慢阵风包络 × 整体摆动 + 叶尖细颤；竹竿底部不动，越往上摆得越多
  float gust = 0.55 + 0.45 * snoise(vec3(t * 0.05, 0.0, 3.1));
  float sway = sin(t * 0.42 + q.x * 2.0) * 0.6 + snoise(vec3(q * 2.5, t * 0.12)) * 0.7;
  float flutter = snoise(vec3(q * 14.0, t * 0.55));
  float tip = portrait ? (1.0 - q.y) : (1.0 - q.y) * 0.7 + 0.3;
  vec2 d = vec2(sway * 0.0032 * gust * tip + flutter * 0.0007,
                flutter * 0.0005 + sway * 0.0008 * tip) * bamboo;

  // 水：往下游流的细纹
  float r1 = snoise(vec3(q.x * 38.0, q.y * 70.0 - t * 1.6, t * 0.25));
  float r2 = snoise(vec3(q.x * 18.0 + t * 0.3, q.y * 30.0 - t * 0.9, 7.0));
  d += vec2(r1 * 0.0011 + r2 * 0.0006, r2 * 0.0012) * water;

  d *= k;
  vec3 col = sampleImg(uv + vec2(d.x, -d.y));

  // 水面碎光：只在本来就亮的地方闪
  float lum = luma(col);
  float glint = smoothstep(0.55, 0.85, lum) * max(0.0, snoise(vec3(q.x * 90.0, q.y * 140.0 - t * 2.2, t * 0.6)));
  col += glint * 0.10 * water * k;

  // 薄雾：横向慢移，集中在中段
  vec2 mq = q * vec2(2.2, 4.5) + vec2(t * 0.010, sin(t * 0.03) * 0.05);
  float m = fbm(vec3(mq, t * 0.015));
  float band = smoothstep(0.15, 0.45, q.y) * (1.0 - smoothstep(0.75, 0.95, q.y));
  col = mix(col, vec3(0.86, 0.85, 0.76), smoothstep(0.35, 0.85, m) * band * 0.10 * k);

  // 天光：左上那团光慢慢呼吸
  float sun = 1.0 - smoothstep(0.0, 0.6, distance(q, portrait ? vec2(0.2, 0.12) : vec2(0.15, 0.1)));
  col *= 1.0 + sun * 0.035 * sin(t * 0.18) * k;

  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

/** 计时页：云走、星闪、岸边灯火明灭、水面倒影晃动、低雾横移 */
export const NIGHT_FRAGMENT = COMMON + /* glsl */ `
void main() {
  vec2 uv = coverUv(vUv);
  vec2 q = vec2(uv.x, 1.0 - uv.y);
  float t = uTime;
  float k = uK * uIntro;

  float sky = 1.0 - smoothstep(0.35, 0.55, q.y);
  float water = smoothstep(0.6, 0.68, q.y);
  float depth = clamp((q.y - 0.6) / 0.4, 0.0, 1.0);

  // 云：极慢的整体漂移
  vec2 d = vec2(fbm(vec3(q * 3.0 + vec2(t * 0.006, 0.0), t * 0.01)) - 0.5,
                fbm(vec3(q * 3.0 + 5.0, t * 0.01)) - 0.5) * 0.006 * sky;

  // 水：近处纹宽、远处纹密，倒影横向轻晃
  float wy = q.y * mix(260.0, 90.0, depth);
  float rip = snoise(vec3(q.x * mix(14.0, 6.0, depth), wy - t * 0.35, t * 0.2));
  float rip2 = snoise(vec3(q.x * 40.0, wy * 1.7 + t * 0.25, t * 0.4));
  d += vec2(rip * 0.0035 + rip2 * 0.0012, rip2 * 0.0008) * mix(0.35, 1.0, depth) * water;

  d *= k;
  vec3 col = sampleImg(uv + vec2(d.x, -d.y));
  float lum = luma(col);
  float warm = smoothstep(0.0, 0.06, col.r - col.b);

  // 星：天上原有的亮点各自明灭
  float star = smoothstep(0.18, 0.4, lum) * sky;
  col *= 1.0 + star * snoise(vec3(q * vec2(160.0, 107.0), t * 0.9)) * 0.5 * k;

  // 岸边灯火：暖色亮点轻轻跳
  float shore = smoothstep(0.45, 0.52, q.y) * (1.0 - smoothstep(0.68, 0.74, q.y));
  float lights = smoothstep(0.25, 0.55, lum) * warm * shore;
  float fl = snoise(vec3(q * vec2(60.0, 40.0), t * 0.7)) * 0.6 + snoise(vec3(q * 8.0, t * 0.25)) * 0.4;
  col *= 1.0 + lights * fl * 0.35 * k;

  // 倒影里的灯随水纹碎开
  float refl = smoothstep(0.2, 0.45, lum) * water * warm;
  col *= 1.0 + refl * max(0.0, rip2) * 0.4 * k;

  // 低雾：贴着山脚和水面横移
  float mb = smoothstep(0.42, 0.56, q.y) * (1.0 - smoothstep(0.66, 0.8, q.y));
  float m = fbm(vec3(q * vec2(1.6, 6.0) + vec2(t * 0.008, 0.0), t * 0.012));
  col = mix(col, vec3(0.42, 0.46, 0.44), smoothstep(0.35, 0.8, m) * mb * 0.08 * k);

  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`
