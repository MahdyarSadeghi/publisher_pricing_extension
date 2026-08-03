# Publisher Pricing Extension

افزونه‌ی Chrome برای تحلیل RPM جایگاه‌های تبلیغاتی بر اساس داده‌های تاریخی.

## پیش‌نیازها

- Google Chrome یا مرورگرهای Chromium-based
- Git
- Node.js 18 یا جدیدتر (فقط برای بازسازی فایل داده)
- کلید OpenRouter (اختیاری، فقط برای بخش Pricing Agent)

## نصب روی سیستم شخصی

```bash
git clone https://github.com/MahdyarSadeghi/publisher_pricing_extension.git
cd publisher_pricing_extension
npm ci
```

فایل داده‌ی آماده داخل ریپو قرار دارد، بنابراین برای اجرای معمول افزونه نیازی به
ساخت مجدد داده نیست.

اگر می‌خواهید از Pricing Agent استفاده کنید، فایل تنظیمات محلی را بسازید:

### macOS / Linux

```bash
cp config.example.js config.js
```

### Windows PowerShell

```powershell
Copy-Item config.example.js config.js
```

سپس در `config.js` مقدار `YOUR_OPENROUTER_KEY_HERE` را با کلید OpenRouter خود
جایگزین کنید. این فایل در `.gitignore` است؛ آن را commit نکنید.

## بارگذاری افزونه در Chrome

1. آدرس `chrome://extensions` را باز کنید.
2. گزینه‌ی **Developer mode** را فعال کنید.
3. روی **Load unpacked** کلیک کنید.
4. پوشه‌ی اصلی همین ریپو (پوشه‌ای که `manifest.json` داخل آن است) را انتخاب کنید.
5. افزونه‌ی «ناشر من» را Pin کنید و در صفحه‌ی موردنظر روی آیکن آن بزنید.

بعد از هر تغییر کد، در صفحه‌ی Extensions روی دکمه‌ی **Reload** افزونه کلیک کنید
و صفحه‌ی مقصد را نیز Refresh کنید.

## بازسازی داده (اختیاری)

فایل Excel را با نام زیر قرار دهید:

```text
data/daily_position_details.xlsx
```

سپس اجرا کنید:

```bash
node build-data.js
```

خروجی در `data/publisher_data.json` نوشته می‌شود. جزئیات ستون‌های لازم در
[`data/README.txt`](data/README.txt) آمده است.

## نکات

- حالت پیش‌فرض از داده‌ی محلی `data/publisher_data.json` استفاده می‌کند و برای
  نمایش گزارش‌ها به VPN یا ورود سازمانی نیاز ندارد.
- قابلیت اتصال زنده به Trino به شبکه/VPN و گواهی داخلی سازمان وابسته است.
- افزونه مجوز دسترسی به همه‌ی URLها (`<all_urls>`) دارد؛ فقط از سورس مورداعتماد
  استفاده کنید.
- کلید OpenRouter در افزونه‌ی محلی قابل مشاهده است؛ از کلیدی با سقف مصرف محدود
  استفاده کنید و افزونه را همراه `config.js` منتشر نکنید.