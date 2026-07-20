# گزارش ارتقای نهایی رندر و متریال UNDRAL

**تاریخ:** ۱۹ ژوئیهٔ ۲۰۲۶  
**دامنه:** کد واقعی پروژه، زمین، متریال‌ها، نورپردازی، شخصیت‌ها، پوشش گیاهی، آب، Post‑Processing، ابزار تولید Asset و QA گرافیکی.

## خلاصه

این نسخه دیگر فقط از چند `MeshStandardMaterial` و تکسچر تکرارشونده استفاده نمی‌کند. یک مسیر رندر چندلایه و کیفیت‌پذیر ساخته شده که شامل زمین PBR شش‌لایه، پوشش هندسی instanced، متریال‌های Physical انتخابی، نور محیطی PMREM، نورپردازی چندنقطه‌ای، آب فیزیکی و زنجیره کامل Post‑Processing است.

هدف این مرحله «افزایش جزئیات تصادفی» نبود؛ هدف ایجاد ابزار و قراردادهایی بود که بتوان با آن‌ها یک بازی قابل توسعه و قابل پروفایل ساخت.

## ۱. زمین چندلایه حرفه‌ای

فایل‌های اصلی:

- `src/art3d/advancedTerrainMaterial.ts`
- `src/art3d/terrainDetails.ts`
- `scripts/build_terrain_atlas.py`

شش جنس مستقل در یک Shader جهان‌محور ترکیب می‌شوند:

1. Grass
2. Dirt
3. Mud
4. Moss
5. Pebbles
6. Leaf Litter

برای هر جنس Base Color، Normal، ORM و Height وجود دارد. این ۲۴ ورودی در چهار Atlas فشرده شده‌اند تا تعداد samplerها کنترل شود. Blend نهایی بر اساس نویز کلان، metadata هر tile، رطوبت، مسیر، رنگ منطقه و ارتفاع سطح انجام می‌شود. Height-aware blending اجازه می‌دهد سنگ‌ریزه، گل و خاک به شکل طبیعی روی یکدیگر بنشینند و مرزها شبیه cross-fade تخت نباشند.

روی سطح Shader، یک لایه هندسی مستقل قرار گرفته است:

- چمن کوتاه
- علف بلند
- گل
- سنگ‌ریزه
- برگ خشک

همه با `InstancedMesh` ساخته می‌شوند. حرکت باد به‌جای چرخاندن کل گروه، در Vertex Shader و به‌صورت متفاوت برای هر instance محاسبه می‌شود.

## ۲. کتابخانه متریال توسعه‌یافته

تعداد خانواده‌های متریال از مجموعه اولیه به ۱۹ جنس افزایش یافت:

- wood, plaster, stone, roof, metal
- cloth, leather, skin, hair, fur
- ground, grass, dirt, mud, moss, pebble, leaflitter
- foliage, crystal

برای هر خانواده چهار تکسچر ۵۱۲×۵۱۲ تولید شده است:

- Base Color
- Tangent-Space Normal
- ORM
- Height

در مجموع ۷۶ تکسچر authoring و چهار Atlas زمین وجود دارد.

قابلیت‌های فیزیکی فقط در جنس‌هایی فعال شده‌اند که از نظر بصری ارزش دارند:

- فلز: anisotropy و clearcoat
- پارچه و خز: sheen
- چرم: clearcoat و specular کنترل‌شده
- مو: anisotropy و sheen
- پوست: specular ملایم
- کریستال: transmission، attenuation، iridescence و dispersion
- آب: IOR، transmission، thickness، absorption، clearcoat و Normal متحرک

این انتخاب از فعال‌کردن یک Shader بسیار سنگین برای تمام اشیای ساده جلوگیری می‌کند.

## ۳. نورپردازی و Image-Based Lighting

Renderer اکنون از PMREM و `RoomEnvironment` برای نور محیطی فیلترشده استفاده می‌کند. نور صحنه شامل این لایه‌ها است:

- نور جهت‌دار اصلی با سایه نرم
- Fill سرد
- Rim گرم
- Rim Light دنبال‌کننده برای Hero
- نورهای emissive خانه، Portal، معدن و آتش
- Fog و عمق اتمسفری

رزولوشن سایه بر اساس Graphics Quality تغییر می‌کند:

- Low: 1024
- Medium: 2048
- High: 4096

## ۴. Post‑Processing سینمایی

فایل:

- `src/rendering/postprocessing/CinematicPipeline3D.ts`

زنجیره رندر به این صورت است:

1. RenderPass
2. GTAOPass
3. UnrealBloomPass
4. SMAAPass
5. Grade/Vignette/Grain/Damage pass
6. OutputPass

Bloom محدود و انتخابی است تا کل تصویر خاکستری و مه‌آلود نشود. GTAO تماس زمین، زیر ایوان، پای شخصیت‌ها و شکست‌های معماری را تقویت می‌کند. SMAA لبه‌های مورب را بدون هزینه بالای supersampling تمیزتر می‌کند. شدت AO، Bloom، Grain و Resolution با tier گرافیکی تغییر می‌کند.

## ۵. Hero و Pet

Hero procedural از حدود ۳۰ قطعه ساده به ۵۶ Mesh و حدود ۵۰۵۸ Triangle افزایش یافت. اجزای جدید شامل موارد زیر است:

- cuirass چندلایه
- بندهای مورب
- کیف‌ها و ابزار کمربند
- زانوبند و قطعات فلزی
- مدالیون و کریستال
- Hood و لایه‌های مو
- بینی و گوش
- Backpack و bedroll
- غلاف شمشیر و potion

متریال مو، پوست، پارچه، چرم و فلز از Shader response متفاوت استفاده می‌کنند. Pet نیز saddle bag، حلقه‌های فلزی، چراغ و متریال خز مستقل دارد.

این هنوز جایگزین یک کاراکتر authored در Blender با Sculpt، Unique UV، Skeleton، Facial Rig و انیمیشن‌های حرفه‌ای نیست؛ اما سطح Asset procedural و زیرساخت متریال آن به‌طور محسوس بالاتر رفته است.

## ۶. آب و محیط

آب از سطح شفاف ساده به متریال فیزیکی تغییر کرد:

- IOR برابر تقریباً 1.333
- transmission
- thickness
- attenuation color/distance
- clearcoat
- specular response
- دو حرکت مستقل Normal برای شکست تکرار

کریستال‌ها و Portal از transmission، emissive و ویژگی‌های Physical کنترل‌شده استفاده می‌کنند.

## ۷. ابزارهای جدید

- تولیدکننده ۱۹ مجموعه PBR
- سازنده خودکار Atlas زمین با gutter
- اعتبارسنج تکسچر، اندازه، کانال و نام‌گذاری
- اعتبارسنج قراردادهای Advanced Rendering
- اعتبارسنج UV0/UV1 و پوشش PBR مدل‌ها
- Quality tier برای Terrain، Post‑FX، سایه و پوشش گیاهی
- GPU shader smoke harness برای کامپایل واقعی GLSL در WebGL

## ۸. اعتبارسنجی اجراشده

| بررسی | نتیجه |
|---|---|
| Authority boundary | موفق |
| تست کلاینت | ۱۰۳ تست موفق |
| تست خالص سرور | ۱۲۰ تست موفق |
| مجموع تست‌ها | ۲۲۳ تست موفق |
| TypeScript کلاینت | موفق |
| TypeScript source سرور | موفق |
| Production build | موفق |
| PBR texture validation | ۷۶ تکسچر و ۴ Atlas موفق |
| Advanced rendering contract | موفق |
| Model/UV/PBR validation | موفق |
| GPU shader smoke | موفق، WebGL error نهایی صفر |
| npm audit کلاینت | صفر آسیب‌پذیری production شناخته‌شده |
| npm audit سرور | صفر آسیب‌پذیری production شناخته‌شده |
| Standalone artifact | موفق |

در GPU smoke test، Shader زمین، متریال‌های Physical، باد instanced و GTAO/Bloom/SMAA با Chromium و SwiftShader واقعاً کامپایل و رندر شدند؛ فقط extension اختیاری `KHR_parallel_shader_compile` در SwiftShader در دسترس نبود.

## ۹. اندازه خروجی و محدودیت‌ها

- JavaScript اصلی: حدود ۱٫۱۵ مگابایت minified و ۳۲۱ کیلوبایت gzip
- Standalone تک‌فایلی: حدود ۲۳٫۶ مگابایت
- Vite درباره chunk بزرگ‌تر از ۵۰۰ کیلوبایت هشدار می‌دهد
- Textureهای فعلی PNG هستند و هنوز به KTX2 تبدیل نشده‌اند
- Standalone بدون `VITE_API_URL` معتبر، ورود و backend آنلاین ندارد
- نتیجه نهایی باید روی GPUهای هدف و موبایل‌های واقعی پروفایل شود

## ۱۰. مرحله بعد برای سطح AAA/AA مستقل

1. Hero و دشمن‌ها با Blender/GLB، Unique UV، normal bake و skeletal animation جایگزین شوند.
2. LOD و animation compression برای مدل‌ها اضافه شود.
3. Textureها پس از تست روی GPUهای هدف به KTX2/Basis Universal تبدیل شوند.
4. Main bundle با dynamic import و code splitting خرد شود.
5. GPU profiling برای draw calls، fill rate، shader variants و VRAM انجام شود.
6. Terrain chunk streaming و culling فضایی برای نقشه‌های بزرگ‌تر اضافه شود.

## حکم نهایی

این نسخه یک ارتقای واقعی در کد Renderer است: زمین چندلایه، متریال Physical انتخابی، نور محیطی، پوشش هندسی، آب فیزیکی و Post‑Processing اکنون ابزارهای reusable هستند، نه ترفندهای ثابت برای یک Screenshot. محدودیت اصلی بعدی دیگر Shader پایه نیست؛ کیفیت Asset authored و پروفایل سخت‌افزار هدف است.
