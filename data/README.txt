فایل داده‌های تاریخی پابلیشر را اینجا قرار دهید.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
نام فایل اصلی: daily_position_details.xlsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ستون‌های مورد نیاز:
  date            تاریخ (فرمت YYYY-MM-DD)
  publisher_id    شناسه پابلیشر
  position_id     شناسه جایگاه
  position_class  کلاس جایگاه
  total_adv_cost  هزینه تبلیغ (فقط این ستون در محاسبه RPM استفاده می‌شود)
  publisher_name  نام پابلیشر
  description     توضیح جایگاه
  position_type   نوع جایگاه
  page_views      تعداد نمایش صفحه
  category        دسته‌بندی
  app_id          شناسه App یکتانت (مثال: GKCUwSyc)
  device          نوع دستگاه: mobile | desktop | all

ستون‌های ممنوع (استفاده نمی‌شوند):
  fixed_adv_cost      ← نادیده گرفته می‌شود
  billboard_adv_cost  ← نادیده گرفته می‌شود

برای ساخت publisher_data.json:
  node build-data.js

اگر daily_position_details.xlsx وجود نداشت، از publisher_data.xlsx استفاده می‌شود.
