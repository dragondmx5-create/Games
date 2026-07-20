# گزارش تبدیل UNDRAL به Top-Down True 3D (نمای ۳/۴)

**تاریخ:** ۱۸ ژوئیهٔ ۲۰۲۶

## نتیجه

renderer فعال پروژه از سیستم sprite-based دوبعدی به یک renderer سه‌بعدی واقعی مبتنی بر Three.js تغییر کرده است. این تبدیل صرفاً فشرده‌کردن یا چرخاندن تصویر دوبعدی نیست؛ صحنه اکنون PerspectiveCamera، depth buffer، meshهای حجمی، نور، سایه و مختصات سه‌بعدی واقعی دارد.

## موارد پیاده‌سازی‌شده

- دوربین Perspective با زاویهٔ پیش‌فرض ۴۵ درجهٔ افقی و حدود ۵۵ درجهٔ ارتفاع؛ نمای ثابت پایه همان top-down 3/4 است.
- Orbit دوربین با Drag دکمهٔ راست/میانی موس و zoom با Wheel.
- زمین با slabهای حجمی و variation ارتفاعی محدود.
- دیوارهای Rock و Brick با ارتفاع واقعی، depth test و سایه.
- آب سه‌بعدی با MeshPhysicalMaterial، transparency، clearcoat و حرکت آرام سطح.
- نور Hemisphere، نور جهت‌دار، سایهٔ PCF نرم و PointLight همراه بازیکن.
- palette، مه و نور اختصاصی برای Green Land، Witchlands، Rainforest، Frostlands، Desert، Cinder Coast و Dungeon.
- مدل low-poly سه‌بعدی برای بازیکن، بازیکنان آنلاین، NPC، حیوانات، Pet و چهار نوع دشمن.
- مدل‌های سه‌بعدی procedural برای درخت، کنده، سنگ، ستون، stalagmite، قارچ، کریستال، معدن، صندوق، مزرعه، کمپ، خانه و Portal.
- attack arc و سلاح سه‌بعدی برای ضربه‌های بازیکن.
- HP barهای projected، nameplate بازیکنان آنلاین و floating combat text متصل به دوربین.
- particle spark سه‌بعدی با gravity.
- minimap و weapon icon با renderer جدید سازگار شدند.
- renderer سه‌بعدی در Game، Red Zone و Visual Harness فعال شده و renderer دوبعدی دیگر مسیر اجرایی اصلی نیست.
- iconهای inventory حتی بدون asset دوبعدی، fallback procedural دارند.
- CSS از pixelated scaling به rendering مناسب WebGL سه‌بعدی تغییر کرد.

## منطق بازی و شبکه

حرکت، collision، pathing و authority همچنان روی صفحهٔ X/Z دوبعدی محاسبه می‌شوند. این وضعیت برای بازی‌های top-down 3D استاندارد است و باعث می‌شود قراردادهای سرور، حرکت authoritative، combat و Save شکسته نشوند. رندر و اشیا 3D هستند، اما بازی platformer یا دارای پرش/فیزیک عمودی نشده است.

## فایل‌های اصلی تغییرکرده

- `src/render3d.ts`: renderer سه‌بعدی جدید.
- `src/game.ts`: استفاده از renderer جدید.
- `src/redZoneGame.ts`: استفاده از renderer جدید در PvP.
- `src/devVisualHarness.ts`: harness سه‌بعدی.
- `src/rendering/core/WebGLSupportError.ts`: خطای مشترک شروع WebGL.
- `src/rendering/core/WebGL2DContext.ts`: re-export خطای مشترک برای سازگاری.
- `src/styles/base.css` و `src/styles/world.css`: canvas و overlayهای projected.
- `index.html`: کنترل‌های دوربین و مشخص‌کردن True 3D.
- `package.json` و `package-lock.json`: اضافه‌شدن `three` و `@types/three`.

## کنترل‌ها

- `WASD` یا Arrow: حرکت
- `Shift`: دویدن
- `Space`: حمله
- `F`: توانایی
- `E`: تعامل
- `Q`: تعویض سلاح
- Drag دکمهٔ راست یا میانی موس: چرخاندن دوربین
- Wheel: zoom دوربین

## اعتبارسنجی اجراشده

- `npm run verify`: موفق
- Authority boundary: موفق
- ۱۷ فایل تست و ۱۰۳ تست: همگی موفق
- TypeScript: موفق
- Vite production build: موفق
- `npm run artifact`: موفق
- `npm audit --omit=dev`: صفر آسیب‌پذیری شناخته‌شده

Build اصلی JavaScript حدود `913.76 KB` و gzip حدود `232.97 KB` است. بخش عمدهٔ افزایش نسبت به نسخهٔ دوبعدی مربوط به موتور Three.js است.

## نکتهٔ استقرار

احراز هویت پروژه اجباری است. فایل standalone فقط زمانی به backend متصل می‌شود که build با `VITE_API_URL` معتبر ساخته شود یا frontend و API از یک origin سرو شوند.

```bash
npm ci
npm run dev
```

برای build متصل به backend جدا:

```bash
VITE_API_URL=https://api.example.com npm run build
```

## محدودیت بررسی بصری محیط

در محیط ساخت، build و تست کامل انجام شد؛ ولی Chromium headless به علت نبود EGL/Display قابل استفاده برای screenshot WebGL نبود. بنابراین screenshot خودکار ثبت نشد. خود renderer در TypeScript/Vite کامپایل شده و harness توسعه در `?visual-harness` باقی مانده است.

## مسیر تست سریع بدون حساب در حالت توسعه

```text
http://localhost:5173/?visual-harness
```

این مسیر فقط در `npm run dev` فعال است و یک منطقه، بازیکن، دشمن‌ها، حیوانات، خانه‌ها و منابع را با renderer سه‌بعدی نمایش می‌دهد.
