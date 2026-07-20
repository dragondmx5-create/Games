# گزارش بازسازی فرانت‌اند UNDRAL

## هدف

فرانت‌اند از حالت یک صفحهٔ آزمایشی متصل به کلاس بزرگ `Game` به یک پوستهٔ بازی منسجم، قابل‌استفاده و هماهنگ با بک‌اند server-authoritative ارتقا داده شد. موتور WebGL و منطق اصلی بازی حفظ شده‌اند تا بازنویسی UI باعث دو منبع حقیقت یا انتقال authority به مرورگر نشود.

## تغییرات اصلی

### طراحی و تجربه کاربری

- صفحهٔ ورود سینمایی و واکنش‌گرا با وضعیت واقعی اتصال به Realm
- HUD جدید برای موقعیت، سرزمین، ریسک، سلامتی، stamina، corruption، تجهیزات و منابع
- utility dock یکپارچه برای Journal، Inventory، Map، Graphics، Audio و Fullscreen
- پنل‌های بازطراحی‌شدهٔ Inventory، Merchant/Crafting، Map، Journal و Account
- سیستم toast برای موفقیت، خطا و هشدار
- نمایش وضعیت Online / Connecting / Reconnecting / Offline
- نمایش وضعیت Cloud save شامل Saving / Saved / Failed
- حالت‌های دسکتاپ، تبلت و موبایل به‌جای کوچک‌کردن سادهٔ UI دسکتاپ
- کنترل‌های لمسی واقعی و دسترس‌پذیر با عنصر `button` و ARIA
- مدیریت Escape، modal scrim، focus trap و جلوگیری از باز بودن چند پنل هم‌زمان

### اتصال به بک‌اند

- دریافت کاتالوگ canonical فروشگاه و crafting از سرور
- نمایش قیمت‌ها، هزینه‌ها و خروجی recipe بر اساس دادهٔ واقعی سرور
- fallback نمایشی محلی فقط زمانی که کاتالوگ سرور در دسترس نیست
- تفکیک سرویس‌های ضروری startup از قابلیت‌های اختیاری
- استفاده از حالت degraded برای Quest، Underway و proofها به‌جای متوقف کردن کل بازی
- Journal جدید برای نمایش Story، Daily/Quest و Expedition/Dungeon state
- همگام‌سازی HUD با inventory revision و داده‌های canonical
- حذف ذخیرهٔ تکراری پس از خرید Black Market

### پایداری

- رفع crash اولیه ناشی از نبود `#graphics-btn`
- رفع نمایش اشتباه تب Craft در Black Market
- رفع race در progress صفحهٔ شروع هنگام قطع بودن backend
- جلوگیری از نمایش rotate hint روی صفحهٔ عنوان
- افزودن تست قرارداد DOM؛ هر `getElementById` ثابت باید در HTML وجود داشته باشد
- به‌روزرسانی سازندهٔ standalone برای inline کردن فایل CSS جداشده

## معماری جدید

فایل‌های افزوده‌شده:

- `src/styles.css` — design system و layout کامل
- `src/ui/events.ts` — event boundary بین runtime و UI
- `src/ui/shell.ts` — مدیریت پوسته، پنل‌ها، وضعیت اتصال، اعلان‌ها و accessibility
- `src/ui/economyPresentation.ts` — تبدیل کاتالوگ canonical سرور به view model نمایشی
- `src/__tests__/domContract.test.ts` — جلوگیری از تکرار crashهای ناشی از DOM ناقص

## نتیجهٔ کنترل کیفیت

- Server-authority boundary check: پاس
- Test files: 17 پاس
- Tests: 101 پاس
- TypeScript: پاس
- Vite production build: پاس
- Standalone artifact: ساخته شد

## اجرا

```bash
npm ci
npm run dev
```

بک‌اند توسعه باید روی `http://localhost:8787` اجرا شود؛ Vite مسیرهای `/api` و `/ws` را به آن proxy می‌کند.

برای build متصل به backend خارجی:

```bash
VITE_API_URL=https://your-server.example npm run artifact
```

نسخهٔ `dist/undral-standalone.html` بدون backend فعال صفحه را باز می‌کند، اما چون حساب کاربری اجباری است، ورود به بازی تا اتصال به Realm غیرفعال می‌ماند.

## محدودهٔ این مرحله

پوسته، معماری UI، دسترسی به قابلیت‌ها، همگام‌سازی server state و کیفیت تعامل بازسازی شده‌اند. موتور WebGL، spriteها و assetهای هنری موجود حفظ شده‌اند؛ تولید یک asset pack هنری کاملاً جدید برای تمام حیوان‌ها، NPCها، شهرها و biomeها پروژهٔ محتوایی مستقلی است و داخل این بازسازی کدنویسی نشده است.
