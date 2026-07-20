# گزارش بازطراحی HUD اقتصادی UNDRAL — Veilforge II

## هدف

این مرحله روی رابط داخل بازی، خوانایی منابع و نمایش اقتصادی تمرکز دارد. هیچ فایل یا منطق داخل پوشه `server/` تغییر نکرده است.

## تغییرات رابط داخل بازی

- پنل دائمی **Field Wallet** در کنار minimap اضافه شد.
- موجودی‌های زیر به‌صورت کارت‌های مستقل و زنده نمایش داده می‌شوند:
  - Crystal
  - Wood
  - Iron
  - Glowshroom
  - Meat
  - Hide
  - Feathers
  - Supply Crates
- برای افزایش منابع pulse سبز و برای کاهش منابع pulse قرمز همراه با مقدار تغییر نمایش داده می‌شود.
- دکمه `OPEN EXPEDITION PACK` مستقیماً Inventory را باز می‌کند.
- پنل منابع در دسکتاپ، موبایل و landscape چیدمان جداگانه و واکنش‌گرا دارد.
- HUD سلامت، نور و XP کنتراست بیشتر، نوار ضخیم‌تر و sweep ظریف دریافت کرد.
- hotbar با حالت hover، تاکید بیشتر روی Ability و رنگ Risk Tier بازطراحی شد.

## Gold Crowns

- نمایش **Gold Crowns** به بازی اضافه شد.
- نرخ نمایشی: `25 Gold Crowns = 1 canonical Crystal`.
- Crowns یک denomination رابط کاربری هستند و balance مستقل یا قابل جعل در کلاینت ایجاد نمی‌کنند.
- خرید، crafting، loot، مرگ و همه دستورات اقتصادی همچنان با Crystal و inventory معتبر سرور انجام می‌شوند.
- موجودی Crown و Crystal در HUD، Inventory و Merchant panel نمایش داده می‌شود.

## Inventory و Merchant

- بالای Inventory یک ledger بزرگ برای Crown، Crystal، Wood، Iron، Provisions و Crafting Stock اضافه شد.
- Merchant panel اکنون wallet فعلی، نرخ Crown/Crystal و توضیح server verification را نمایش می‌دهد.

## بهینه‌سازی

- DOM منابع تنها هنگام تغییر واقعی موجودی به‌روزرسانی می‌شود؛ بنابراین update loop بازی باعث نوشتن مداوم روی DOM نمی‌شود.
- انیمیشن‌های منابع و meter با Reduced Motion غیرفعال می‌شوند.

## کنترل کیفیت

- Server authority boundary: پاس شد.
- Test files: 17 پاس.
- Tests: 101 پاس.
- TypeScript و production build: پاس.
- Standalone artifact: ساخته شد.
- پوشه `server/`: دقیقاً بدون تغییر نسبت به نسخه ورودی.
- HTML IDs: تعداد 141، همگی یکتا و بدون تکرار.
