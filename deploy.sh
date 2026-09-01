#!/bin/bash

set -e


echo "🚀 جاري حفظ التعديلات وإعداد التحديث..."

git add .
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
git commit -m "Auto Update Azma Settings: $TIMESTAMP" || echo "لا يوجد تغييرات جديدة للحفظ."
echo "⚡ جاري رفع التحديث مباشرة إلى سيرفر Railway..."
railway up --detach
echo "✅ تم رفع التحديث لسيرفر Railway بنجاح!"