# گزارش ارتقای فرانت‌اند UNDRAL — Veilforge Pass

## هدف

این مرحله فقط لایهٔ فرانت‌اند، رابط کاربری و بازخوردهای دیداری را ارتقا می‌دهد. هیچ مسیر بک‌اند، schema، migration، قرارداد اقتصادی یا authority بازی تغییر نکرده است. مرورگر همچنان فقط وضعیت را نمایش می‌دهد و intent می‌فرستد؛ نتیجهٔ مبارزه، موجودی، پاداش، حرکت معتبر و مرگ همچنان در سرور تعیین می‌شوند.

## جهت هنری

هویت بصری تازه بر پایهٔ «اطلس زندهٔ فانتزی تاریک» ساخته شده است: فلز تیره، خطوط برنجی، نور سرزمین‌ها، حلقه‌های رون، نقشهٔ نجومی و ابزارهای expedition. هر یک از شش سرزمین رنگ، توضیح و سیگنال اطلس مخصوص خود را در صفحهٔ آغاز دارد، بدون اینکه انتخاب نمایشی آن داده‌ای از بازی را تغییر دهد.

## قابلیت‌های افزوده‌شده

### صفحهٔ آغاز

- اطلس تعاملی شش سرزمین با تم رنگی مستقل برای Witchlands، Green Land، Rainforest، Frostlands، Sunscorched Desert و Cinder Coast
- ذرات رون و حلقه‌های چرخان با تولید deterministic و بدون asset خارجی
- نور نقطه‌ای و parallax وابسته به اشاره‌گر
- نمایش مقیاس جهان: ۶ سرزمین، ۱۲۱ منطقه و ۱۲ dungeon
- World Cycle و هویت روایی قوی‌تر
- هماهنگی تم انتخاب‌شده با عنوان، ornament، progress و کارت‌های briefing

### داخل بازی

- قطب‌نمای مرکزی با نام مکان واقعی و risk tier دریافت‌شده از runtime
- hotbar خوانا برای Weapon، Attack، Ability، Interact و Sprint
- همگام‌سازی نام سلاح hotbar با HUD موجود
- رنگ پویا برای Sanctuary، Frontier، Fracture و Lost Territory
- vignette وضعیت سلامت و flash هنگام کاهش HP
- پشتیبانی همین بازخوردها در PvP runtime
- توقف intent محلی هنگام باز بودن پنل تنظیمات رابط، از جمله در PvP

### تنظیمات رابط

پنل «Interface Forge» به utility dock اضافه شد. تنظیمات فقط در localStorage همان دستگاه ذخیره می‌شوند:

- Reduced motion
- High contrast
- Compact expedition HUD
- HUD scale از ۸۲٪ تا ۱۱۸٪
- Atmospheric grain
- بازگردانی تنظیمات پیش‌فرض

این تنظیمات هیچ تأثیری بر منطق، سرعت، collision، پاداش یا authority ندارند.

### دسترس‌پذیری و پایداری

- احترام به `prefers-reduced-motion`
- امکان غیرفعال‌کردن حرکت‌های تزئینی از داخل بازی
- حفظ focus trap، Escape، scrim و ARIA پنل‌های قبلی
- حفظ سیاست Web Audio: فعال‌شدن صدا پس از gesture واقعی کاربر
- عدم استفاده از فونت، تصویر یا کتابخانهٔ خارجی جدید
- طراحی responsive برای دسکتاپ، موبایل و landscape کم‌ارتفاع

## فایل‌های اصلی تغییرکرده

- `index.html`
- `src/styles.css`
- `src/main.ts`
- `src/ui/shell.ts`
- `src/game.ts`
- `src/redZoneGame.ts`
- `src/ui/experience.ts` (جدید)

## کنترل کیفیت

- Server-authority boundary check: پاس
- ۱۷ فایل تست: پاس
- ۱۰۱ تست: پاس
- TypeScript: پاس
- Vite production build: پاس
- Standalone artifact: ساخته می‌شود با `npm run artifact`

## اجرا

```bash
npm ci
npm run dev
```

برای کنترل کامل:

```bash
npm run verify
npm run artifact
```
