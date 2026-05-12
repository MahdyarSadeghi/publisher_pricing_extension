تنها سورس داده: daily_position_details.xlsx
این فایل را در همین پوشه قرار دهید، سپس اجرا کنید:

  node build-data.js

خروجی: data/publisher_data.json (توسط extension استفاده می‌شود)

ستون‌های مورد نیاز:
  date              تاریخ (YYYY-MM-DD)
  publisher_id      شناسه پابلیشر
  position_id       شناسه جایگاه
  total_adv_cost    هزینه تبلیغ — تنها ستون هزینه مجاز (RPM)
  publisher_name    نام پابلیشر
  description       توضیح جایگاه
  position_type     نوع جایگاه
  page_views        تعداد نمایش صفحه
  app_id            شناسه App یکتانت (مثال: GKCUwSyc)
  device            نوع دستگاه: mobile | desktop | all

ستون‌های ممنوع (نادیده گرفته می‌شوند):
  fixed_adv_cost / billboard_adv_cost
