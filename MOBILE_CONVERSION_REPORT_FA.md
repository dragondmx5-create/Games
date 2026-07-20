# گزارش تبدیل UNDRAL به اپ واقعی موبایل

این پروژه از حالت صرفاً وب/PWA به یک پروژهٔ Native قابل ساخت برای Android با
Capacitor تبدیل شده است. خروجی Android این پروژه APK یا AAB واقعی است که مثل
هر برنامهٔ دیگر روی گوشی نصب می‌شود. رابط و موتور WebGL2 موجود داخل Android
System WebView اجرا می‌شوند و پوسته، جهت صفحه، تمام‌صفحه، آیکن، Splash و بسته‌بندی
توسط پروژهٔ Native Android کنترل می‌شود.

## تغییرات انجام‌شده

- اضافه‌شدن Capacitor 8 و پروژهٔ کامل `android/`.
- اجرای اجباری بازی در حالت افقی (`sensorLandscape`).
- حالت Immersive واقعی و مخفی‌شدن نوارهای سیستم با کد Native Java.
- آیکن و Splash اختصاصی UNDRAL برای تراکم‌های مختلف Android.
- پشتیبانی از safe-area و جلوگیری از بازشدن تب مرورگر در نسخهٔ Native.
- اضافه‌شدن تنظیمات Native برای Screen Orientation و Status Bar.
- اضافه‌شدن فرمان‌های `android:debug`، `android:bundle` و `mobile:sync`.
- اضافه‌شدن GitHub Actions برای ساخت و تحویل APK نصب‌شدنی.
- اصلاح CORS و Origin Guard بک‌اند برای پذیرش هم‌زمان Origin وب و اپ موبایل.
- اضافه‌شدن تست برای Originهای متعدد، از جمله Origin نسخهٔ Capacitor/iOS.

## نتیجهٔ اعتبارسنجی

- Client authority check: موفق
- Client tests: ۱۳۵ تست موفق
- Client TypeScript/Vite production build: موفق
- Server source typecheck: موفق
- Server pure tests: ۱۳۴ تست موفق
- Capacitor Doctor: Android looking great
- Capacitor sync: موفق

## نکتهٔ ضروری برای آنلاین‌شدن

این بازی server-authoritative است؛ بنابراین اپ بدون یک سرور عمومی HTTPS قابل
بازی آنلاین نیست. پیش از ساخت، آدرس واقعی سرور را در `.env.production.local`
قرار دهید:

```env
VITE_API_URL=https://api.example.com
CAPACITOR_HOSTNAME=app.example.com
```

و روی سرور:

```env
COOKIE_SECURE=true
CORS_ORIGIN=https://game.example.com,https://app.example.com,capacitor://app.example.com
```

## ساخت APK

ساده‌ترین مسیر، workflow موجود در `.github/workflows/android-apk.yml` است.
پروژه را روی GitHub قرار دهید، وارد Actions شوید، workflow با نام
`Build installable Android APK` را اجرا کنید و URL واقعی API را وارد کنید.
فایل خروجی با نام artifact `undral-android-debug-apk` قابل دریافت خواهد بود.

ساخت محلی نیز با Android Studio یا Android SDK انجام می‌شود:

```bash
npm ci --ignore-scripts
npm run android:debug
```

مسیر خروجی:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## وضعیت فایل APK در این تحویل

سورس Native و فرایند ساخت کامل آماده است، اما خود فایل APK در محیط فعلی تولید
نشد؛ چون Android SDK در محیط نصب نبود و دسترسی Gradle به مخازن خارجی با خطای
DNS مسدود بود. همچنین آدرس واقعی API پروژه ارائه نشده بود و ساخت APK با endpoint
خالی، یک فایل نصب‌شدنی اما غیرقابل‌بازی تولید می‌کرد. Workflow داخل پروژه هر دو
مورد را در محیط GitHub Actions حل می‌کند.
