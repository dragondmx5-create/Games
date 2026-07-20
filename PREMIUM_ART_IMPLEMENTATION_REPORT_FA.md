# گزارش پیاده‌سازی Art سه‌بعدی پریمیوم در UNDRAL

**تاریخ:** ۱۸ ژوئیهٔ ۲۰۲۶  
**مبنای پروژه:** نسخهٔ Top-Down True 3D اصلاح‌شده  
**هدف:** تبدیل کانسپت خانهٔ ماژولار، کاراکتر، حیوان همراه، Portal، معدن و محیط به هندسهٔ واقعی runtime داخل پروژه؛ بدون اتکا به تصویر تخت یا billboard.

## نتیجهٔ اجرایی

سیستم رندر قبلی که عمدتاً از primitiveهای ساده و بدون زبان بصری منسجم استفاده می‌کرد، به یک pipeline ساخت Asset رویه‌ای و ماژولار ارتقا یافت. مدل‌ها هنگام اجرا از قطعات هندسی، متریال‌های procedural، outline هندسی، نور و animation rig ساخته می‌شوند و بخشی از هندسهٔ ثابت برای کاهش draw call ادغام می‌شود.

## ابزارهای جدید

### `src/art3d/materials.ts`

کتابخانهٔ متریال مشترک با ویژگی‌های زیر:

- بافت رنگ و bump تولیدشده با `CanvasTexture`
- نویز چندلایهٔ deterministic با `simplex-noise`
- الگوهای اختصاصی چوب، سنگ، گچ، شینگل سقف، فلز، پارچه، چرم، زمین، foliage، کریستال و پوست
- cache متریال و texture
- anisotropy کنترل‌شده
- roughness، metalness، emissive، transparency و flat shading قابل تنظیم

### `src/art3d/modeling.ts`

کیت مدل‌سازی reusable شامل:

- Rounded box با bevel واقعی
- Cylinder، sphere، cone، torus و extruded shape
- ساخت تیر بین دو نقطه
- `EdgesGeometry` برای outline هندسی روی فرم‌های ساده
- cache هندسه و edge
- ابزار `bakeStaticGroup` برای merge کردن meshهای ثابت بر اساس متریال
- مدیریت dispose منابع GPU

### `src/art3d/assets.ts`

کارخانهٔ Asset ماژولار برای ساخت:

- خانهٔ کامل
- Hero
- NPC، enemy و wallworm
- حیوانات و pet
- درخت، سنگ، کریستال، chest و گیاهان
- Portal جادویی
- ورودی معدن با ریل
- fence، signpost، camp و props محیطی

## خانهٔ سه‌بعدی

خانه دیگر یک بلوک ساده نیست. هر نمونه شامل اجزای زیر است:

- foundation سنگی
- پنل‌های گچ و timber framing
- تیرهای عمودی و افقی
- پنجره‌های چندبخشی با نور emissive
- در و دستگیره
- ایوان، پله، railing و پادری
- سقف چندشیب با ردیف‌های شینگل
- ridge beam، gable، dormer و chimney
- دود پویا از دودکش
- چراغ ایوان و نور گرم داخلی
- تغییرات رنگ deterministic میان خانه‌ها
- مخفی‌شدن roof هنگام حضور بازیکن داخل خانه

### فضای داخلی واقعی

فضای داخلی از هندسهٔ واقعی تشکیل شده است:

- کف چوبی plank-based
- شومینه و آتش emissive
- کتابخانه و کتاب‌های مجزا
- تخت، تشک، پتو و بالش
- فرش
- میز غذاخوری، صندلی و ظروف
- workbench و ابزار
- barrel و storage props
- planter، crate و جزئیات بیرونی

## کاراکتر و موجودات

Hero جدید از ۳۰ بخش Mesh و یک rig سبک ساخته می‌شود:

- سر و صورت خوانا
- مو و ریش
- torso چندلایه
- چرم و فلز با متریال متفاوت
- shoulder armor
- دست، پا، چکمه و gauntlet
- belt و جزئیات لباس
- scarf و شنل
- شمشیر با pivot مستقل
- contact shadow مشترک
- حرکت دست، پا، بدن و سلاح براساس سرعت و وضعیت حرکت

Pet و حیوانات نیز از حجم‌های چندبخشی، سر، گوش، پا، دم و تجهیزات ساخته شده‌اند و دیگر یک primitive منفرد نیستند.

## نور و خوانایی تصویر

- Point lightهای گرم با flicker فازی
- محدودکردن نورهای فعال به نزدیک‌ترین منابع برای کنترل هزینه
- emissive window/fire/portal/crystal
- contact shadow برای کاراکترها
- outline هندسی روی فرم‌های ساده و props
- procedural variation برای جلوگیری از ظاهر پلاستیکی و یکنواخت
- دود ذره‌ای با gravity قابل تنظیم

## بهینه‌سازی

نسخهٔ اولیهٔ خانهٔ پرجزئیات ۳۵۹ Mesh و ۲۶۱ Line داشت. با ابزار bake/merge، نسخهٔ نهایی به این مقدار رسید:

| Asset | Mesh | Line | Light | Triangle تقریبی |
|---|---:|---:|---:|---:|
| خانه | 65 | 3 | 3 | 37,994 |
| Hero | 30 | 27 | 0 | 2,958 |
| Pet | 17 | 12 | 0 | 940 |
| Portal | 16 | 15 | 1 | 2,872 |
| معدن | 22 | 21 | 1 | 2,424 |

خانه‌ها بر اساس ابعاد، جهت در، palette و variant cache می‌شوند و نمونه‌های بعدی از prototype بهینه‌شده clone می‌شوند.

## اتصال به بازی

`src/render3d.ts` به pipeline جدید متصل شده است:

- خانه‌های settlement با کارخانهٔ جدید ساخته می‌شوند
- مدل‌های Hero/NPC/enemy/animal/pet جایگزین primitiveهای قبلی شده‌اند
- Portal و dungeon entrance مدل مستقل دارند
- در محدودهٔ خانه، دیوارهای بلوکی قبلی حذف می‌شوند تا با معماری جدید تداخل نداشته باشند
- متریال terrain و wall از texture procedural استفاده می‌کند
- animation rig در حلقهٔ update اجرا می‌شود
- flicker نور، دود و roof visibility در runtime مدیریت می‌شوند
- dispose کامل factory، material library و geometry toolkit اضافه شده است

## Art Direction داخل پروژه

دو تصویر کانسپت مرجع داخل مسیر زیر قرار گرفتند:

- `docs/art-direction/modular-asset-kit-concept.png`
- `docs/art-direction/gameplay-beauty-concept.png`

این تصاویر texture بازی نیستند؛ فقط مرجع طراحی‌اند. فرم‌های بازی با هندسه و کد سه‌بعدی ساخته می‌شوند.

## اعتبارسنجی انجام‌شده

- `npm run check:authority` — موفق
- `npm run art:validate` — موفق
- TypeScript ریشه — موفق
- ۱۷ فایل تست client — موفق
- **۱۰۳ تست client — موفق**
- TypeScript source server — موفق
- ۳۴ فایل تست pure server — موفق
- **۱۲۰ تست pure server — موفق**
- Production build — موفق
- Standalone artifact — موفق
- Root production audit — صفر آسیب‌پذیری شناخته‌شده
- Server production audit — صفر آسیب‌پذیری شناخته‌شده

**مجموع تست‌های اجراشده: ۲۲۳ تست موفق.**

## اندازهٔ Build

- JavaScript اصلی minified: حدود `984.94 kB`
- gzip: حدود `254.80 kB`
- Standalone HTML: حدود `1.1 MB`

هشدار chunk بزرگ Vite باقی است و برای مرحلهٔ بعدی بهتر است Three.js و بخش‌های UI با dynamic import/manual chunks جدا شوند.

## محدودیت تأیید بصری محیط بررسی

تلاش برای گرفتن screenshot خودکار از WebGL در Chromium container به علت نبود EGL/SwiftShader قابل استفاده در محیط اجرا شکست خورد. این خطا مربوط به محیط headless بود؛ TypeScript، ساخت production، اعتبارسنجی ساختار مدل‌ها و تست‌ها همگی موفق‌اند. برای مشاهدهٔ فوری، پروژه را محلی اجرا کرده و Visual Harness یا بازی را باز کنید.

## اجرای محلی

```bash
npm ci
npm run art:validate
npm run dev
```

برای نسخهٔ واقعی همراه login، backend نیز باید اجرا و `VITE_API_URL` تنظیم شود. فایل standalone بدون backend معتبر صرفاً برای shell/build قابل استفاده است و login آنلاین کار نخواهد کرد.

## مسیر توسعهٔ پیشنهادی بعدی

این نسخه یک جهش واقعی نسبت به primitive art قبلی است، اما برای رسیدن به سطح بازی تجاری کامل، مراحل بعدی عبارت‌اند از:

1. تبدیل Hero procedural به rig/skinning کامل و animation clipهای authored
2. LOD و instancing برای props پرتکرار
3. shadow atlas یا baked light probes برای settlementها
4. post-processing انتخابی شامل SSAO، bloom کنترل‌شده و color grading
5. decalهای زمین، footprint و wear mask
6. تقسیم bundle و streaming منطقه‌ای Assetها
7. تست تصویری WebGL در CI دارای GPU یا Mesa software renderer
