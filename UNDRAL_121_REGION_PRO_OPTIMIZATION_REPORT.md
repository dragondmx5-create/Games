# گزارش بازگشت معماری ۱۲۱ منطقه‌ای و بهینه‌سازی حرفه‌ای UNDRAL

تاریخ: ۲۰ ژوئیهٔ ۲۰۲۶

## خلاصه

این پاس، نسخهٔ «شهر یکپارچهٔ ۲۲۵ بخشی» را کنار گذاشت و بازی را به ساختار اصلی **۱۱×۱۱، در مجموع ۱۲۱ منطقه، با شش سرزمین مستقل** برگرداند. شهرها دوباره نقاط محدود و پراکنده در جهان هستند؛ نه اینکه تمام نقشه یک شهر پیوسته باشد.

هم‌زمان، مسیر رندر ثابت، Instancing، Frustum Culling، LOD خانه‌ها، سایه‌ها، Outlineها، افکت‌ها و بازسازی صحنه برای موبایل بهینه شد. Assetهای ورودی دانجن و تزئینات مرتبط نیز به سیستم Procedural موجود اضافه شدند.

## معماری نهایی جهان

- ابعاد جهان: ۱۱×۱۱ منطقه
- تعداد کل مناطق: ۱۲۱
- تعداد سرزمین‌ها: ۶
  - Witchlands
  - Green Land
  - Rainforest
  - Frostlands
  - Sunscorched Desert
  - Cinder Coast
- تعداد سکونتگاه‌ها: ۳۰
  - ۶ پایتخت
  - ۱۲ شهر کوچک
  - ۶ Outpost
  - ۶ سکونتگاه مخفی

پایتخت‌های شش سرزمین:

| سرزمین | پایتخت | مختصات منطقه |
|---|---|---:|
| Witchlands | Morrowfen | -4,-3 |
| Green Land | Evergrove | 0,0 |
| Rainforest | Canopy Crown | 4,-3 |
| Frostlands | Frosthold | -4,3 |
| Sunscorched Desert | Solspire | 0,4 |
| Cinder Coast | Emberport | 4,3 |

## ترکیب شهر اصلی هر سرزمین

هر پایتخت یک شهر محدود و مشخص است؛ نه یک کلان‌شهر چندصد منطقه‌ای. هر پایتخت دارای ۸ ساختمان است:

### چهار ساختمان اصلی و بزرگ

1. Guild Hall
2. Civic Building
3. Market Hall
4. Quest House

### چهار ساختمان پشتیبان

1. خانهٔ کوچک
2. خانهٔ متوسط
3. Shop
4. Workshop

### فضای بازار و دکور

- یک چاه مرکزی
- دقیقاً سه غرفهٔ بازار
- یک Handcart
- نیمکت، فانوس و Flower Planter در محل‌های امن
- پایتخت‌ها دارای دیوار و Gatehouse هستند
- شهرهای کوچک، Outpostها و نقاط مخفی باز و بدون حلقهٔ دیوار سنگین باقی می‌مانند

شهرهای کوچک ۵ خانه، Outpostها ۴ خانه و سکونتگاه‌های مخفی ۳ خانه دارند. انتخاب خانه‌ها قطعی و Seed-based است.

## Assetهای جدید دانجن

Assetهای زیر با همان سیستم `StylizedAssetFactory` و `PropKind` موجود ساخته شدند:

- `makeDungeonEntrance(palette, seed)`
- `makeDungeonPillar(palette, seed)`
- `makeDungeonBrazier(palette, seed)`
- `makeDungeonRubble(palette, seed)`

هر ورودی دانجن دارای ترکیب زیر است:

- یک ورودی سنگی Rune‌دار
- دو ستون
- دو آتشدان فلزی
- دو مجموعه آوار

در پیمایش کامل جهان:

- ۱۲ ورودی دانجن تولید شد
- ۷۲ Prop تزئینی دانجن تولید شد
- هیچ Asset دانجنی مسیر ورود Authoritative را مسدود نکرد

## بهینه‌سازی‌های حرفه‌ای رندر

### ۱. حذف بازسازی دائمی صحنهٔ ثابت

قبلاً صحنهٔ ثابت تقریباً هر ۹۰۰ میلی‌ثانیه دوباره ساخته می‌شد. این موضوع باعث ایجاد Geometry، جابه‌جایی Object3D، Garbage Collection و مصرف CPU می‌شد؛ حتی وقتی تصویر واقعاً تغییری نکرده بود.

اکنون یک `worldVisualRevision` قطعی محاسبه می‌شود و صحنه فقط زمانی بازسازی می‌شود که وضعیت بصری تغییر کند. شمارش معکوس مزرعه باعث Rebuild نمی‌شود؛ فقط تغییر Stage رشد هندسه را تازه می‌کند.

### ۲. InstancedMesh و Bounding Volume صحیح

برای زمین، دیوارها، آب، منابع و جزئیات تکراری:

- Frustum Culling فعال شد
- بعد از تغییر Instance Matrix، Bounding Box و Bounding Sphere دوباره محاسبه می‌شوند
- اشیای خارج از دید زودتر حذف می‌شوند

این کار مطابق مستندات رسمی Three.js است که Instancing را برای کاهش Draw Call توصیه می‌کند و تأکید دارد Bounding Volume پس از تغییر Instanceها باید به‌روزرسانی شود.

### ۳. بودجهٔ دید بر اساس کیفیت

شعاع فعال صحنه:

- Low: حدود ۱۸ تایل
- Medium: حدود ۲۲ تایل
- High: حدود ۲۵ تایل
- در Dynamic Resolution پایین، شعاع سه تایل دیگر کاهش پیدا می‌کند

### ۴. LOD اجرایی خانه‌ها

برای خانه‌ها بر اساس فاصله و Quality:

- فضای داخلی فقط در فاصلهٔ نزدیک نگه داشته می‌شود
- Outlineهای دور حذف یا محدود می‌شوند
- Shadow Casterهای دور غیرفعال می‌شوند
- Prototype Cache هنگام تغییر World پاک می‌شود

این تغییر، بدون تخریب مدل نزدیک، هزینهٔ خانه‌های خارج از تمرکز دوربین را کاهش می‌دهد.

### ۵. سایه‌ها و جزئیات زمین

- صخره‌های جزئی فقط روی High سایه می‌اندازند
- سایه و Outline اشیای ثابت بر اساس فاصله محدود است
- بودجهٔ نور و افکت‌های نسخهٔ موبایل حفظ شده است

### ۶. Shader precision موبایل

Particle Shader از `mediump` استفاده می‌کند. Chrome توصیه می‌کند در مواردی که دقت بالا لازم نیست، `mediump` برای سازگاری و عملکرد بهتر GPU موبایل استفاده شود.

### ۷. حذف تخصیص مکرر Geometry

قارچ‌ها قبلاً در Rebuildهای صحنه Geometry و Material تازه می‌ساختند. اکنون از Geometry/Material اشتراکی ModelingToolkit استفاده می‌کنند تا فشار Garbage Collector و رشد حافظه کاهش یابد.

### ۸. Texture QA قابل‌تکرار در Checkout تمیز

فرآیند QA قبلاً به JPGهای Preview تولیدشده‌ای وابسته بود که در Checkout تمیز وجود نداشتند. اکنون اسکریپت `generate_texture_previews.py` ابتدا Previewهای ۳×۳ را از BaseColorهای اصلی تولید می‌کند و سپس Seam/Repetition QA اجرا می‌شود.

## باگ‌های پیدا و اصلاح‌شده

### ۱. حلقهٔ بی‌نهایت در انتخاب خانه

الگوریتم قبلی انتخاب Slot برای Outpost و Hidden Settlement در بعضی Seedها بین دو اندیس رفت‌وبرگشت می‌کرد و تولید منطقه یا سرور را قفل می‌کرد.

اصلاح: انتخاب Rank-based قطعی با Sort و Slice.

### ۲. منابع روی مسیر جاده

برخی منابع Canonical می‌توانستند روی Variant مسیر قرار بگیرند.

اصلاح: Topology متریال جاده را در Footprint منبع پاک می‌کند و تست هم‌خوانی اضافه شد.

### ۳. منابع نزدیک Gate یا ورودی دانجن

تعریف محل Feature بین چند سیستم پراکنده بود و منابع ممکن بود نزدیک ورودی ظاهر شوند.

اصلاح: ماژول مشترک `worldFeatureLayout.ts` و محدودهٔ ممنوعهٔ حداقل ۸ تایل.

### ۴. منابع داخل هستهٔ سکونتگاه

Clearance قبلی برای بعضی چیدمان‌ها کافی نبود.

اصلاح: فاصلهٔ مرکز سکونتگاه برای منابع به ۲۴ تایل افزایش یافت.

### ۵. Rebuild دائمی به‌خاطر تایمر مزرعه

حتی بعد از اضافه‌شدن Revision، شمارش معکوس مزرعه Revision را تغییر می‌داد.

اصلاح: زمان باقی‌مانده از Revision بصری حذف شد و فقط Stage در آن نقش دارد.

### ۶. کد مردهٔ شهر ۲۲۵ بخشی

ماژول‌های `cityLayout.ts` و `worldMetrics.ts` دیگر هیچ مسیر اجرایی نداشتند و با قرارداد جدید خانه‌ها ناسازگار بودند.

اصلاح: حذف کامل کد مرده.

### ۷. شکست QA با سورس تمیز

Texture QA فایل‌های Preview غیرنسخه‌بندی‌شده را فرض می‌کرد.

اصلاح: تولید خودکار Preview پیش از QA.

### ۸. قراردادهای قدیمی تست

تست‌هایی که همچنان ۲۲۵ بخش یا شهر پیوسته را انتظار داشتند، با معماری درخواستی ناسازگار بودند.

اصلاح: جایگزینی با تست‌های ۱۲۱ منطقه، شش سرزمین، پایتخت، شهر، Outpost، طبیعت پراکنده و دانجن.

## نتیجهٔ پیمایش کامل ۱۲۱ منطقه

```json
{
  "regions": 121,
  "lands": 6,
  "settlements": {
    "capital": 6,
    "town": 12,
    "outpost": 6,
    "hidden": 6
  },
  "houses": 150,
  "capitalSignatureBuildings": 24,
  "dungeonPortals": 12,
  "dungeonDressing": 72,
  "naturalProps": 6433,
  "totalProps": 17887,
  "totalPathTiles": 143833,
  "maxPropsInRegion": 213,
  "maxHousesInRegion": 8,
  "resourceNodes": 4908,
  "failures": [],
  "ok": true
}
```

## نتیجهٔ تست‌ها

- Authority boundary check: پاس
- Client tests: **۱۳۳ از ۱۳۳ پاس**
- Server pure-domain tests: **۱۲۳ از ۱۲۳ پاس**
- Client TypeScript/Production build: پاس
- Server source typecheck: پاس
- PBR authoring textures: ۷۶ فایل، ۱۹ Material Set: پاس
- Terrain atlases: ۴ Atlas: پاس
- Texture seam/repetition previews: پاس
- Advanced terrain, water, wind, lighting and post-processing contracts: پاس
- Procedural Art validator: پاس
- Standalone client artifact: ساخته شد
- Full 121-region audit: صفر خطا

## محدودیت‌های صادقانه

### تست موبایل واقعی

این محیط گوشی Android/iOS و GPU فیزیکی نداشت. بنابراین ادعای قطعی ۶۰ FPS یا دمای پایدار ارائه نمی‌شود. Android توضیح می‌دهد که توان پایدار موبایل با وضعیت حرارتی، فرکانس و شرایط دستگاه تغییر می‌کند و Workload باید تطبیقی باشد. Adaptive quality موجود پروژه برای همین هدف حفظ و تقویت شده است.

### فشرده‌سازی ASTC/ETC2

Pipeline کامل KTX2/BasisU/ASTC/ETC2 در این پاس اضافه نشد، زیرا به Encoder، Transcoder Runtime، Fallback مرورگر و آزمایش روی چند GPU واقعی نیاز دارد. اضافه‌کردن ناقص آن می‌توانست باعث Texture Black/Unsupported Format شود.

### Server production bundle

`server typecheck:source` و ۱۲۳ تست سرور پاس شدند، اما Build کامل Server به Prisma Client تولیدشده نیاز دارد. محیط آفلاین نتوانست Engine را از `binaries.prisma.sh` دریافت کند و `prisma generate` با خطای DNS `EAI_AGAIN` متوقف شد. این یک محدودیت محیط Build است، نه خطای قراردادهای World جدید.

### Chunk اصلی کلاینت

Vite همچنان دربارهٔ Chunk اصلی حدود ۱.۲۲۹ MB هشدار می‌دهد. Three.js و موتور اصلی در ورود بازی فوراً لازم‌اند؛ Code Splitting بدون اندازه‌گیری روی Network/Device واقعی می‌تواند فقط زمان Loading را جابه‌جا کند. این مورد برای پاس بعدی Profiling باقی گذاشته شده است.

## منابع رسمی استفاده‌شده برای طراحی بهینه‌سازی

- Three.js Manual — Optimize Lots of Objects: https://threejs.org/manual/en/optimize-lots-of-objects.html
- Three.js InstancedMesh documentation: https://threejs.org/docs/#api/en/objects/InstancedMesh
- Three.js BatchedMesh documentation: https://threejs.org/docs/#api/en/objects/BatchedMesh
- Android Developers — Adaptive Performance / Thermal APIs: https://developer.android.com/games/optimize/adpf
- Chrome Developers — WebGL precision guidance: https://developer.chrome.com/blog/use-mediump-precision-in-webgl-when-possible
- Chrome DevTools — Performance profiling: https://developer.chrome.com/docs/devtools/performance
