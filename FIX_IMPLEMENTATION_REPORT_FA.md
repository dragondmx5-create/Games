# گزارش اجرای اصلاحات پروژه UNDRAL

**تاریخ:** ۱۸ ژوئیهٔ ۲۰۲۶  
**مبنای کار:** گزارش جامع بازبینی امنیت، authority، concurrency، performance، lifecycle و deployment

## نتیجه اجرایی

تمام release blockerهای قطعی و بیشتر ایرادهای مستقیم گزارش‌شده اصلاح شدند. مواردی که نیازمند بازطراحی زیرساختی مستقل هستند، به‌صورت ایمن کاهش ریسک یافته‌اند اما در این patch به re-platform کامل تبدیل نشده‌اند.

## اصلاحات انجام‌شده

### ۱. بستن کامل Legacy Save Authority Bypass

- stateهای مرجع اولیه حساب در همان transaction ثبت‌نام ساخته می‌شوند.
- `PlayerInventory`، سلاح starter، `PlayerCombatState`، `PlayerWorldPosition` و `PlayerUnderworldState` از سمت سرور bootstrap می‌شوند.
- Save ارسالی کلاینت دیگر نمی‌تواند موجودی، سطح، تجهیزات، Pet یا موقعیت مرجع را ایجاد یا تغییر دهد.
- `canonicalizeSaveData` همیشه داده‌های ارزش‌دار را از جداول مرجع سرور projection می‌کند.
- fallback قدیمی که Save دلخواه را هنگام نبود inventory می‌پذیرفت حذف شد.

### ۲. احراز هویت و ابطال فوری Session/WebSocket

- access token اکنون به session واقعی با claim `sid` متصل است.
- هر درخواست احراز‌شده، معتبر و revoke نبودن session را در DB بررسی می‌کند.
- WebSocketها به registry کاربر/session ثبت می‌شوند و در موارد زیر بسته می‌شوند:
  - انقضای access token؛
  - logout؛
  - refresh/rotation؛
  - تغییر رمز؛
  - حذف حساب؛
  - تشخیص reuse شدن refresh token.
- JWT به `HS256`، issuer و audience صریح محدود شد.
- حداقل secret به ۳۲ کاراکتر افزایش یافت.
- ایمیل‌ها trim/lowercase می‌شوند و migration برای uniqueness بدون حساسیت به حروف اضافه شد.

### ۳. رفع Race ساخت اتاق‌ها

- ساخت اولیه PvP room به‌صورت single-flight انجام می‌شود.
- ساخت Combat room نیز single-flight شد.
- حذف room با identity guard انجام می‌شود تا یک instance قدیمی instance جدید را پاک نکند.
- جابه‌جایی async بازیکن میان Combat roomها پس از `await` دوباره اعتبارسنجی می‌شود.

### ۴. اصلاح Dungeon Movement

- cadence کلاینت از حدود 12.5Hz به 5Hz کاهش یافت.
- route حرکت limiter اختصاصی ۳۶۰ درخواست در دقیقه دارد و سهم عمومی API را مصرف نمی‌کند.
- حرکت دیگر برای هر frame یک `DungeonCommand` دائمی تولید نمی‌کند.
- revision و transaction مرجع برای حرکت حفظ شده است.

> حرکت Dungeon هنوز هر ۲۰۰ms وضعیت `DungeonRun` را persist می‌کند. انتقال کامل simulation به WebSocket/in-memory tick یک refactor معماری بعدی است، نه یک patch کوچک.

### ۵. کنترل payload ذخیره

- JSON عمومی API به 128KB محدود شد.
- `/api/save` parser اختصاصی 1MB دارد.
- schema ذخیره، payload سریال‌شده بزرگ‌تر از 900KB را با خطای معتبر رد می‌کند.
- تست payload مرزی اضافه شد.

### ۶. مجوز مکانی عملیات اقتصادی

- خرید و craft فقط هنگام حضور تازه و نزدیک merchant canonical پذیرفته می‌شوند.
- ورود Underworld علاوه بر region، فاصله واقعی تا portal canonical را بررسی می‌کند.

### ۷. WebSocket Performance و Lifecycle

- backpressure برای world، combat و PvP با سقف `bufferedAmount` اضافه شد.
- snapshotهای world presence به cadence ثابت 66ms coalesce می‌شوند.
- room خالی Combat دیگر snapshot/tick بیهوده اجرا نمی‌کند و واقعاً idle-evict می‌شود.
- map مربوط به attemptهای اتصال world پاک‌سازی می‌شود.
- timerهای presence در reset تست پاک می‌شوند.

### ۸. Client Resource Cleanup

- `Input.dispose()` listenerهای window را حذف می‌کند.
- `Renderer.dispose()` listenerها و منابع WebGL را آزاد می‌کند.
- `RedZoneGame.stop()` cleanup را idempotent اجرا می‌کند.
- `window.open` با `noopener,noreferrer` سخت‌سازی شد.
- متن‌های Black Market پیش از ورود به `innerHTML` escape می‌شوند.
- مفهوم دکمه New Expedition شفاف شد: موجودی/progression مرجع حساب reset نمی‌شود.

### ۹. Deployment و تنظیمات

- Node 22 در `engines` ریشه و سرور تثبیت شد.
- Prisma CLI به dependency runtime منتقل شد.
- Docker از `npx --no-install` استفاده می‌کند و در startup package دانلود نمی‌کند.
- `TRUST_PROXY` قابل تنظیم شد.
- `.env.example` و `docker-compose.yml` با secretهای قوی‌تر و JWT issuer/audience هماهنگ شدند.
- migration زیر اضافه شد:
  - `server/prisma/migrations/20260718120000_auth_hardening/migration.sql`

**هشدار migration:** اگر دو حساب موجود فقط در بزرگی/کوچکی حروف ایمیل تفاوت داشته باشند، migration عمداً متوقف می‌شود تا ادغام خودکار و مخرب انجام نشود. قبل از deploy این collisionها را دستی تعیین تکلیف کنید.

### ۱۰. تست و مستندات

- تست‌های legacy که رفتار ناامن را تثبیت می‌کردند به تست‌های ضدتقلب تبدیل شدند.
- تست registry سوکت احراز‌شده اضافه شد.
- `PROJECT_ISSUES.md`، `ROADMAP.md`، `ARCHITECTURE.md` و `AI_MAP.md` به‌روز شدند.

## وضعیت یافته‌های گزارش قبلی

| شناسه | وضعیت | توضیح |
|---|---|---|
| P0-01 | رفع شد | Save دیگر اقتصاد مرجع را bootstrap نمی‌کند |
| P0-02 | رفع شد | موقعیت starter فقط از سرور می‌آید |
| P0-03 | کاهش ریسک جدی | limiter اختصاصی و cadence 5Hz؛ WebSocket movement در refactor بعدی |
| P1-01 | رفع شد | single-flight PvP room |
| P1-02 | رفع شد | single-flight Combat room |
| P1-03 | رفع شد | session-bound JWT و socket revocation/expiry |
| P1-04 | کاهش ریسک | limit اختصاصی و validation 900KB؛ redesign ذخیره world delta باقی است |
| P1-05 | کاهش ریسک جدی | حذف command row هر حرکت و کاهش cadence؛ in-memory tick باقی است |
| P1-06 | رفع شد | Prisma قطعی در image و `--no-install` |
| P1-07 | رفع شد | merchant proximity authorization |
| P2-01 | رفع شد | portal proximity authorization |
| P2-02 | رفع شد | idle eviction واقعی |
| P2-03 | کاهش ریسک جدی | coalescing و backpressure؛ spatial delta protocol باقی است |
| P2-04 | رفع شد | cleanup map اتصال |
| P2-05 | رفع شد | dispose listener/GPU |
| P2-06 | بخشی رفع شد | trust proxy؛ limiter مشترک Redis برای چند replica باقی است |
| P2-07 | رفع شد | normalization و JWT hardening |
| P2-08 | رفع شد | مستندات وضعیت به‌روز شدند |
| P2-09 | برنامه‌ریزی‌شده | خردکردن orchestratorها و `packages/shared` یک refactor بزرگ مستقل است |
| P2-10 | رفع معنایی | UI دیگر reset کامل حساب را القا نمی‌کند |
| P3-01 | رفع شد | noopener و escape محتوای UI |

## اعتبارسنجی اجراشده

- `npm run check:authority` — موفق
- تست کلاینت — **۱۷ فایل / ۱۰۳ تست موفق**
- `npm run build` — موفق
- TypeScript source check سرور — موفق
- تست‌های خالص سرور — **۳۴ فایل / ۱۲۰ تست موفق**
- مجموع تست‌های اجراشده — **۲۲۳ تست موفق**
- audit وابستگی‌های production ریشه — صفر آسیب‌پذیری شناخته‌شده
- audit وابستگی‌های production سرور — صفر آسیب‌پذیری شناخته‌شده

## مواردی که در این محیط اجرا نشدند

`prisma generate` به دلیل خطای DNS محیط در دسترسی به `binaries.prisma.sh` انجام نشد. در نتیجه موارد زیر در همین محیط قابل تأیید نبودند:

- تست‌های integration متصل به PostgreSQL؛
- full server build وابسته به generated Prisma client؛
- Docker build و اجرای migration واقعی.

source typecheck سرور و تمام تست‌های pure موفق‌اند، اما قبل از production deploy این سه کنترل باید در CI یا محیط دارای دسترسی شبکه/PostgreSQL اجرا شوند.

## دستور پیشنهادی پیش از Deploy

```bash
cd server
npm ci
npx --no-install prisma generate
npx --no-install prisma migrate deploy
npm test
npm run build
```

برای Docker:

```bash
docker compose build --no-cache api
docker compose up -d
```

پس از deploy، login، refresh، logout، password change، اتصال world socket، ورود Dungeon، خرید merchant و ورود Underworld را با یک smoke test واقعی بررسی کنید.
