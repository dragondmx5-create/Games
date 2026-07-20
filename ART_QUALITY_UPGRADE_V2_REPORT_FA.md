# گزارش ارتقای کیفیت Art و Asset — نسخه V2

**پروژه:** UNDRAL
**تاریخ:** ۱۹ ژوئیهٔ ۲۰۲۶
**مبنای کار:** آخرین نسخهٔ `Ultimate Rendering`
**دامنهٔ این مرحله:** منبع تولید PBR، مقابله با تکرار تکسچر، زمین چندلایه، UV variation، grounding مدل‌های procedural، QA و مستندات.

## جمع‌بندی اجرایی

این مرحله سیستم موازی جدیدی نساخت؛ همان مسیرهای موجود در `scripts/generate_pbr_textures.py`، `src/art3d/materials.ts`، `src/art3d/modeling.ts` و `src/art3d/advancedTerrainMaterial.ts` ارتقا یافتند.

بزرگ‌ترین تغییر، حذف نویز Fourier مبتنی بر جمع محدود `sin/cos` و جایگزینی آن با **periodic gradient noise** همراه **domain warping** است. قرارداد موجود بدون تغییر باقی ماند:

- ابعاد هر Map: `512×512`
- BaseColor: sRGB
- Normal: linear/non-color
- ORM: linear، با چیدمان R=AO، G=Roughness و B=Metallic
- Height: authoring map
- بدون dependency جدید npm یا pip برای generator

در runtime نیز ضدتکرار فقط به preview محدود نشد. مدل‌های procedural transform پایدار UV می‌گیرند و زمین BaseColor/Normal/ORM را از دو projection هم‌خوان با blend پیوستهٔ world-space نمونه‌برداری می‌کند.

## ۱. تأیید تشخیص اولیه

نسخهٔ مبنا در `periodic_noise()` چند مؤلفهٔ سینوسی و کسینوسی با فرکانس‌های صحیح را جمع می‌کرد. seam اصلی با این روش کنترل می‌شد، ولی سیگنال از نظر ساختار همچنان جمع موج‌های محدود بود و در سطح بزرگ ظاهر cloud/band تکرارشونده داشت.

علاوه بر آن، چند جزئیات دستی مانند ریشهٔ زمین، ترک Dirt، شیار Mud، رگهٔ Foliage و band کریستال از ضرایب غیرصحیح استفاده می‌کردند. در نتیجه حتی وقتی هستهٔ noise دوره‌ای بود، این مؤلفه‌های فرعی می‌توانستند seam بسازند. ضرایب این الگوها نیز دوره‌ای شدند.

## ۲. نویز Gradient دوره‌ای و Domain Warping

فایل تغییرکرده:

- `scripts/generate_pbr_textures.py`

اجزای اضافه‌شده:

- `fade_quintic()`
- `periodic_gradient_lattice()`
- `sample_periodic_gradient_noise()`
- `periodic_fbm_raw()`
- `periodic_noise()` جدید با warp دوکاناله

شبکهٔ gradient با modulo نمونه‌برداری می‌شود؛ بنابراین periodic بودن از خود lattice می‌آید و بعداً با blur یا seam-fix مصنوعی تحمیل نمی‌شود. میدان warp نیز periodic است، پس مختصات جابه‌جا‌شده در لبه‌های مقابل یکسان باقی می‌مانند.

Generator همچنان deterministic و pure NumPy/Pillow است.

## ۳. QA خودکار تکرار تکسچر

فایل جدید:

- `scripts/validate_texture_repetition.py`

Generator اکنون برای هر ۱۹ جنس یک preview سه‌درسه می‌سازد:

- `artifacts/pbr-tiled-previews/<kind>_tiled_preview.jpg`

Validator سه نوع metric را بررسی می‌کند:

1. `source_wrap_edge_ratio` برای seam خود tile؛
2. `preview_boundary_ratio` برای seam مرز سلول‌های preview؛
3. `max_highpass_cell_correlation` برای تشخیص تکرار واضح میان ۹ بخش.

خروجی‌های انسانی و ماشینی:

- `artifacts/pbr-tiled-previews/contact-sheet.jpg`
- `artifacts/pbr-tiled-previews/focus-ground-foliage.jpg`
- `artifacts/pbr-tiled-previews/qa-metrics.json`

نتایج جنس‌های حساس:

| جنس | Wrap edge | Preview boundary | بیشترین correlation |
|---|---:|---:|---:|
| ground | 0.4042 | 0.5552 | 0.0502 |
| grass | 0.7001 | 0.5401 | 0.1056 |
| foliage | 0.4390 | 0.4013 | 0.1529 |
| dirt | 0.3059 | 0.4700 | 0.0825 |
| moss | 0.4661 | 0.5318 | 0.0943 |
| leaflitter | 0.4851 | 0.5218 | 0.0366 |

این gate از طریق `npm run art:textures:validate` اجرا می‌شود و نبود preview یا عبور metric از سقف، build art را fail می‌کند.

## ۴. Anti-repetition در runtime مدل‌ها

فایل‌ها:

- `src/art3d/materials.ts`
- `src/art3d/modeling.ts`

برای هر Mesh یک transform deterministic از ترکیب زیر ساخته می‌شود:

- چرخش‌های ۰، ۹۰، ۱۸۰ و ۲۷۰ درجه؛
- mirror؛
- phase offset مستقل U/V.

برای مدل‌های پویا transform از طریق uniform پیش از draw اعمال می‌شود. برای هندسه‌های ثابت خانه، UV0 و UV1 قبل از `mergeGeometries()` تغییر می‌کنند؛ سپس Meshهای هم‌متریال merge می‌شوند. بنابراین anti-repetition خانه draw call جدیدی اضافه نمی‌کند.

Macro shader متریال‌ها نیز از value-noise ساده به gradient fBm با domain warping تغییر کرد و قدرت آن برای زمین، سنگ، چوب، سقف و plaster افزایش یافت.

Validator حداقل تنوع و orthogonal بودن transformهای UV را نیز بررسی می‌کند.

## ۵. Anti-tiling زمین چندلایه

فایل:

- `src/art3d/advancedTerrainMaterial.ts`

سیستم شش‌لایهٔ موجود حفظ شد:

- Grass
- Dirt
- Mud
- Moss
- Pebble
- Leaf litter

تغییرات:

- ماسک‌های macro اکنون gradient fBm و domain-warped هستند؛
- برای هر لایه یک projection دوم با rotation/mirror/phase پایدار ساخته می‌شود؛
- BaseColor، Normal و ORM با **همان blend و transform** ترکیب می‌شوند؛
- blend در world-space پیوسته است، بنابراین مرز ناگهانی سلول ندارد؛
- Height map برای کنترل هزینهٔ shader همچنان تک‌نمونه باقی مانده است؛
- height-biased layer blending، wetness و clearcoat قبلی حفظ شدند.

این تغییر هزینهٔ texture sampling زمین را بالا می‌برد. قبل از افزایش draw distance یا تراکم زمین باید روی Android میان‌رده و GPUهای مجتمع profile شود.

## ۶. بهبود grounding و silhouette مدل‌های procedural

فایل:

- `src/art3d/assets.ts`

تغییرات:

- Mesh مشترک `contact-shadow` به Tree، Rock cluster، Crystal، Chest، Portal، Mine entrance، Camp، Fence و Signpost اضافه شد؛
- Tree چهار root flare حجمی گرفت؛
- Fence یک brace مورب گرفت؛
- contact shadowها depth-write و shadow casting ندارند و از geometry/material مشترک استفاده می‌کنند.

بودجه‌های مهم بعد از تغییر:

| مدل | Mesh | Triangle |
|---|---:|---:|
| House | 65 | 37,994 |
| Hero | 56 | 5,058 |
| Pet | 23 | 1,528 |
| Portal | 17 | 2,874 |
| Mine | 23 | 2,426 |
| Tree | 23 | 2,086 |
| Rock cluster | 5 | 226 |
| Fence | 6 | 542 |

خانه افزایش Triangle نداشت. Hero نیز در این مرحله سنگین‌تر نشد. Tree به‌خاطر root flare جزئیات بیشتری گرفته است.

## ۷. فایل‌های مستند و gateها

تغییرکرده:

- `docs/ART_PIPELINE_PRODUCTION.md`
- `docs/PROJECT_ISSUES.md`
- `scripts/validate-advanced-rendering.mjs`
- `scripts/validate-art3d.ts`
- `package.json`

Scriptهای اضافه/اصلاح‌شده:

```json
"art:textures:qa": "python3 scripts/validate_texture_repetition.py",
"art:textures:validate": "node scripts/validate-pbr-textures.mjs && npm run art:textures:qa",
"typecheck:source": "tsc --noEmit"
```

`typecheck:source` در دستورالعمل الزامی بود، ولی در root package وجود نداشت؛ اکنون gate واقعی دارد.

## ۸. خروجی خام اعتبارسنجی

تمام logهای کامل در `artifacts/verification/` قرار دارند.

### Authority

```text
> undral@0.2.0 check:authority
> node scripts/check-authority-boundary.cjs

Server-authority boundary check passed.
```

### TypeScript

```text
> undral@0.2.0 typecheck:source
> tsc --noEmit
```

### Texture validation و QA

```text
> undral@0.2.0 art:textures:validate
> node scripts/validate-pbr-textures.mjs && npm run art:textures:qa

validated 76 PBR authoring textures (19 material sets) and 4 terrain atlases

> undral@0.2.0 art:textures:qa
> python3 scripts/validate_texture_repetition.py

validated seamless wrapping and 3x3 anti-repetition previews for 19 material sets
```

### Art3D validation

```text
validated advanced terrain, physical materials, cinematic post-processing, water, wind and character lighting contracts
{"name":"house","meshes":65,"pbrMeshes":57,"uv1Meshes":65,"lines":3,"lights":3,"triangles":37994,"size":[11.29,3.9,8.02]}
{"name":"hero","meshes":56,"pbrMeshes":53,"uv1Meshes":55,"lines":49,"lights":0,"triangles":5058,"size":[1.45,1.93,1.65]}
{"name":"pet","meshes":23,"pbrMeshes":15,"uv1Meshes":22,"lines":16,"lights":0,"triangles":1528,"size":[1.01,1.24,2.02]}
{"name":"portal","meshes":17,"pbrMeshes":16,"uv1Meshes":16,"lines":15,"lights":1,"triangles":2874,"size":[2.5,2.09,1.08]}
{"name":"mine","meshes":23,"pbrMeshes":21,"uv1Meshes":22,"lines":21,"lights":1,"triangles":2426,"size":[2.84,2.17,3.82]}
{"name":"tree","meshes":23,"pbrMeshes":22,"uv1Meshes":22,"lines":16,"lights":0,"triangles":2086,"size":[2.2,3.79,2.16]}
{"name":"rocks","meshes":5,"pbrMeshes":4,"uv1Meshes":4,"lines":4,"lights":0,"triangles":226,"size":[1.71,0.77,1.4]}
{"name":"fence","meshes":6,"pbrMeshes":5,"uv1Meshes":5,"lines":5,"lights":0,"triangles":542,"size":[2.64,1.05,0.5]}
```

### Client tests

```text
Test Files  17 passed (17)
Tests       103 passed (103)
Duration    3.31s
```

### Server checks

```text
> undral-server@0.1.0 typecheck:source
> tsc -p tsconfig.source-check.json

Test Files  34 passed (34)
Tests       120 passed (120)
Duration    10.01s
```

### Production build

```text
✓ 1836 modules transformed.
dist/assets/index-DuytSorI.js  1,159.34 kB │ gzip: 322.29 kB
✓ built in 2.88s
```

Vite یک warning واقعی برای chunk بزرگ‌تر از 500 kB داد. این warning پنهان نشده و code splitting هنوز backlog است.

### Standalone artifact

```text
WARNING: VITE_API_URL was not set. The standalone build only works if the
preceding npm run build ran with VITE_API_URL pointing at a real backend.

wrote dist/undral-standalone.html (12438318 bytes); inlined 90 assets / 8364444 source bytes; non-ascii remaining: false
```

### Audit

```text
root:   found 0 vulnerabilities
server: found 0 vulnerabilities
```

### AI map

```text
> undral@0.2.0 ai:map
> node scripts/ai-map.mjs

AI_MAP.md written — 174 modules, 943 exported symbols.
```

## ۹. تست تصویری/GPU که تأیید نشد

برای گرفتن screenshot واقعی از `?visual-harness`، Chromium headless و سپس Chromium داخل Xvfb اجرا شد. محیط container نتوانست EGL/ANGLE را initialize کند. نمونهٔ خطای واقعی:

```text
eglInitialize SwANGLE failed with error EGL_NOT_INITIALIZED
Initialization of all EGL display types failed.
Exiting GPU process due to errors during initialization
```

بنابراین **کامپایل runtime shader روی GPU در این محیط تأیید نشده است**. TypeScript، Vite، قراردادهای shader و ساخت artifact پاس شده‌اند، ولی قبل از merge باید روی یک مرورگر واقعی با WebGL2 اجرا و Console از خطای shader بررسی شود.

## ۱۰. محدودیت‌های صادقانه

1. Hero هنوز مدل authored در Blender با unique UV، normal bake از High Poly، skeleton و animation set کامل نیست. این مرحله کیفیت منبع متریال و anti-tiling را بالا برد، اما جای DCC production را نمی‌گیرد.
2. contact shadow یک grounding کم‌هزینه است، نه baked AO منحصربه‌فرد برای هر prop.
3. نمونه‌برداری دوم BaseColor/Normal/ORM در زمین هزینهٔ fragment shader را افزایش می‌دهد. profile موبایل هنوز انجام نشده است.
4. AI-generated 2D asset pipeline در این مرحله گسترش پیدا نکرد. بدون screenshot واقعی در game scale و تأیید خوانایی، asset آزمایشی جدید به default ارتقا داده نشد.
5. split فایل‌های بزرگ orchestrator انجام نشد؛ اولویت این مرحله art بود و refactor هم‌زمان ریسک بی‌دلیل برای authority ایجاد می‌کرد.
6. KTX2/Basis هنوز فعال نیست؛ ۷۶ map و چهار Atlas همچنان PNG هستند.
7. bundle اصلی هنوز حدود 1.16 MB minified است و code splitting نیاز دارد.
8. Standalone بدون `VITE_API_URL` معتبر فقط artifact بصری/ساختاری است و login آنلاین کار نمی‌کند.

## ۱۱. نتیجه

بخش اول directive، یعنی تعویض noise core، domain warping، رفع seamهای پنهان، preview سه‌درسه و QA blocking، کامل اجرا شد. Anti-repetition نیز به runtime props و terrain متصل شد. grounding مدل‌های procedural بهبود یافت، اما بخش DCC/AI asset production و refactor orchestrator عمداً به‌عنوان کار باقی‌مانده ثبت شده‌اند و «کامل‌شده» گزارش نمی‌شوند.
