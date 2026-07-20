# گزارش ارتقای حرفه‌ای Art و Texture پروژه UNDRAL

**تاریخ:** ۱۹ ژوئیهٔ ۲۰۲۶  
**دامنه:** تکسچر، متریال، UV، نورپردازی، کیفیت runtime، بارگذاری Asset، QA و Artifact.

## جمع‌بندی

مشکل نسخه قبلی فقط کمبود Polygon یا رزولوشن نبود. سطح‌ها بیشتر به رنگ و bump ساده وابسته بودند، مقیاس UV بین قطعات کوچک و دیوارهای بزرگ یکسان نبود، محیط سهم کافی در بازتاب مواد نداشت و هیچ قرارداد production برای BaseColor/Normal/AO/Roughness/Metallic وجود نداشت.

در این نسخه، pipeline تکسچر و متریال بازطراحی شده است. خانه، کاراکتر، حیوان، Portal، معدن و محیط اکنون از یک کتابخانه PBR مشترک استفاده می‌کنند؛ تکسچرها deterministic و قابل بازتولیدند و CI می‌تواند قرارداد آن‌ها را بررسی کند.

## تغییرات واقعی انجام‌شده

### ۱. کتابخانه PBR یازده‌گانه

برای این جنس‌ها مجموعه کامل ساخته شد:

- چوب
- گچ
- سنگ
- شینگل سقف
- فلز
- پارچه
- چرم
- زمین
- گیاه
- کریستال
- پوست

هر مجموعه چهار فایل authoring دارد:

- Base Color
- Tangent-space Normal
- ORM با چیدمان AO/Roughness/Metallic
- Height برای authoring و rebake آینده

در runtime فقط BaseColor، Normal و ORM بارگذاری می‌شوند. مجموعاً ۴۴ فایل authoring و ۳۳ فایل runtime وجود دارد.

### ۲. تولید بافت deterministic و tileable

فایل `scripts/generate_pbr_textures.py` با NumPy و Pillow تکسچرهای ۵۱۲×۵۱۲ را تولید می‌کند. نویزها periodic هستند تا seam واضح در تکرار دیده نشود. هر جنس منطق خودش را دارد؛ برای مثال:

- چوب: رگه، گره، حلقه و درز تخته
- سنگ: بلوک، ملات، لب‌پریدگی و اختلاف ارتفاع
- سقف: ردیف شینگل، overlap و درز
- پارچه: warp/weft و چین
- چرم: منفذ و خراش
- فلز: brushed grain، خش و tarnish
- زمین: ریشه و سنگ‌ریزه

### ۳. قرارداد رنگ و داده

BaseColor به‌عنوان sRGB و Normal/ORM به‌عنوان داده خطی تنظیم می‌شوند. این جداسازی جلوی تغییر اشتباه مقادیر roughness، metallic و جهت normal را می‌گیرد.

### ۴. UV و Texel Density

ابزار مدل‌سازی سه‌بعدی تغییر کرد:

- RoundedBox و Extrude از box projection مبتنی بر اندازه جهان استفاده می‌کنند.
- UV استوانه، کره، مخروط و Torus بر اساس ابعاد واقعی scale می‌شود.
- UV1 برای AO در تمام Meshهای PBR ساخته می‌شود.
- بعد از merge شدن خانه، attributeهای UV و UV1 حفظ می‌شوند.

در نتیجه یک بافت روی تیر کوچک و دیوار بزرگ دیگر به شکل متفاوت و کشیده نمایش داده نمی‌شود.

### ۵. جزئیات Macro و Micro

دو لایه shader به متریال‌ها اضافه شده است:

- Macro variation در فضای جهان برای شکستن تکرار روی سطوح بزرگ
- نمونه‌برداری دوم Normal و Roughness در مقیاس ریز برای خوانایی نمای نزدیک

مقدار هر لایه برای چوب، سنگ، پارچه، فلز، پوست و سایر جنس‌ها جداگانه تنظیم شده است. این روش بدون افزودن مجموعه texture دوم، جزئیات نزدیک را افزایش می‌دهد.

### ۶. متریال‌های Physical

- پارچه از Sheen استفاده می‌کند.
- چرم Clearcoat محدود دارد.
- کریستال از Clearcoat، IOR و Transmission محدود استفاده می‌کند.
- تمام جنس‌ها profile مستقل برای Normal strength، AO، Roughness و واکنش به محیط دارند.

### ۷. Image-Based Lighting

یک محیط PMREM به renderer اضافه شده تا فلز، چرم، کریستال و سطوح نیمه‌براق فقط به نور مستقیم وابسته نباشند. نور Hemisphere و Directional برای جلوگیری از over-lighting دوباره بالانس شدند.

### ۸. بارگذاری قبل از ورود به بازی

۳۳ تکسچر runtime هنگام Boot preload و decode می‌شوند و UI پیشرفت بارگذاری را نشان می‌دهد. بنابراین اولین Frame بازی با تکسچرهای سفید، ناقص یا در حال pop شدن نمایش داده نمی‌شود.

### ۹. Quality Tier واقعی

تنظیم کیفیت اکنون روی این موارد اثر دارد:

- سقف Pixel Ratio
- رزولوشن Shadow Map
- نوع فیلتر سایه

این تنظیمات بدون تغییر منطق gameplay اعمال می‌شوند.

### ۱۰. QA و Validation

ابزارهای جدید این موارد را بررسی می‌کنند:

- وجود ۴۴ تکسچر
- ابعاد ۵۱۲×۵۱۲
- bit depth و نوع کانال PNG
- وجود UV0 و UV1
- کامل بودن BaseColor/Normal/AO/Roughness/Metallic
- sRGB بودن BaseColor
- Linear بودن Normal و ORM
- Repeat wrapping
- Bounds و Triangle count مدل‌ها

### ۱۱. Artifact تک‌فایلی واقعی

سازنده Standalone اکنون تکسچرهای PBR، Spriteها و Fontها را هم به Data URI تبدیل می‌کند. فایل خروجی برای نمایش Art به فایل جانبی وابسته نیست؛ اتصال حساب همچنان به Backend نیاز دارد.

## اندازه و بودجه فعلی

- کتابخانه source شامل Height mapها: حدود ۵٫۹ مگابایت
- فایل‌های runtime PBR در Build: حدود ۴٫۸ مگابایت
- خانه: ۶۵ Mesh و حدود ۳۷٬۹۹۴ Triangle
- Hero: ۳۰ Mesh و حدود ۲٬۹۵۸ Triangle
- Pet: ۱۷ Mesh
- Portal: ۱۶ Mesh
- Mine: ۲۲ Mesh

## اعتبارسنجی اجراشده

- TypeScript: موفق
- `art:textures:validate`: موفق
- `art:validate`: موفق
- Vite production build: موفق
- Authority boundary: موفق
- ۱۰۳ تست کلاینت: موفق
- TypeScript source check سرور: موفق
- ۱۲۰ تست خالص سرور: موفق
- Dependency audit کلاینت و سرور: صفر آسیب‌پذیری شناخته‌شده

## محدودیت صادقانه

این ارتقا یک pipeline حرفه‌ای برای Assetهای procedural فعلی است، اما هنوز جای یک Hero کاملاً authored در Blender با UV منحصربه‌فرد، normal bake از High Poly، facial rig و animation set کامل را نمی‌گیرد. برای رسیدن به سطح نزدیک به بازی تجاری بزرگ، مرحله بعد باید DCC pipeline واقعی برای Hero و ساختمان‌های شاخص باشد؛ ساختار فعلی برای پذیرش آن Assetها آماده شده است.

فشرده‌سازی GPU با KTX2 نیز برای Deploy نهایی توصیه می‌شود. در محیط فعلی دانلود ابزار رسمی KTX به دلیل خطای DNS ممکن نشد، بنابراین فایل‌های runtime بدون ادعای دروغین همچنان PNG هستند. ساختار manifest و material library طوری جدا شده که جایگزینی loader در مرحله بعد محدود و کنترل‌شده باشد.

## فایل‌های کلیدی

- `scripts/generate_pbr_textures.py`
- `scripts/validate-pbr-textures.mjs`
- `scripts/validate-art3d.ts`
- `src/art3d/pbrTextureManifest.ts`
- `src/art3d/materials.ts`
- `src/art3d/modeling.ts`
- `src/render3d.ts`
- `src/main.ts`
- `docs/ART_PIPELINE_PRODUCTION.md`
- `docs/PBR_TEXTURE_LIBRARY_PREVIEW.jpg`
