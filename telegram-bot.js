const { Telegraf } = require('telegraf');
const db = require('./db.cjs');

const BOT_TOKEN = '8724412911:AAGQB7R_c3p5E-rjmeAp2FgvqTh5gDLfWXQ';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const bot = new Telegraf(BOT_TOKEN);

function isAdmin(ctx) {
  return ADMIN_CHAT_ID && String(ctx.chat.id) === String(ADMIN_CHAT_ID);
}

function formatNumber(num) {
  return new Intl.NumberFormat('ar-EG').format(num);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'SAR' }).format(amount);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ar-EG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

async function generateReport() {
  const stats = await db.getStats();

  let report = '📊 <b>تقرير AZMA اليومي</b>\n';
  report += `📅 ${new Date().toLocaleDateString('ar-EG')}\n\n`;

  report += '👥 <b>الزوار</b>\n';
  report += `├ إجمالي: ${formatNumber(stats.totalUsers)}\n\n`;

  report += '📦 <b>الطلبات</b>\n';
  report += `├ اليوم: ${formatNumber(stats.todayOrders)} (${formatCurrency(stats.todayRevenue)})\n`;
  report += `├ هذا الأسبوع: ${formatNumber(stats.weekOrders)} (${formatCurrency(stats.weekRevenue)})\n`;
  report += `├ هذا الشهر: ${formatNumber(stats.monthOrders)} (${formatCurrency(stats.monthRevenue)})\n`;
  report += `└ إجمالي: ${formatNumber(stats.totalOrders)} (${formatCurrency(stats.totalRevenue)})\n\n`;

  if (stats.topProducts.length > 0) {
    report += '🏆 <b>أفضل المنتجات</b>\n';
    stats.topProducts.forEach((p, i) => {
      report += `${i + 1}. ${p.productName} — ${p.count} طلبات (${formatCurrency(p.revenue)})\n`;
    });
    report += '\n';
  }

  if (stats.recentOrders.length > 0) {
    report += '🕐 <b>آخر 5 طلبات</b>\n';
    stats.recentOrders.forEach((o) => {
      report += `• ${o.productName} (${o.size}) — ${o.customerName} — ${formatCurrency(o.productPrice)} — ${formatDate(o.createdAt)}\n`;
    });
  }

  return report;
}

bot.command('start', (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('⛔ غير مصرح لك باستخدام هذا البوت.');
  }
  ctx.reply('👋 أهلاً بك! استخدم /report لعرض التقرير.');
});

bot.command('report', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('⛔ غير مصرح لك باستخدام هذا البوت.');
  }
  await ctx.replyWithChatAction('typing');
  try {
    const report = await generateReport();
    await ctx.reply(report, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('Report error:', e);
    await ctx.reply('❌ حدث خطأ أثناء إنشاء التقرير.');
  }
});

bot.command('stats', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('⛔ غير مصرح لك باستخدام هذا البوت.');
  }
  await ctx.replyWithChatAction('typing');
  try {
    const stats = await db.getStats();
    let msg = '📈 <b>إحصائيات سريعة</b>\n\n';
    msg += `👥 زوار: ${formatNumber(stats.totalUsers)}\n`;
    msg += `📦 طلبات: ${formatNumber(stats.totalOrders)}\n`;
    msg += `💰 إيرادات: ${formatCurrency(stats.totalRevenue)}\n`;
    msg += `📅 اليوم: ${formatNumber(stats.todayOrders)} طلبات\n`;
    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('Stats error:', e);
    await ctx.reply('❌ خطأ في جلب الإحصائيات.');
  }
});

bot.command('help', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '🤖 <b>أوامر البوت</b>\n\n' + '/report — تقرير كامل يومي\n' + '/stats — إحصائيات سريعة\n' + '/help — هذه الرسالة',
    { parse_mode: 'HTML' }
  );
});

bot.catch((err) => {
  console.error('Bot handler error:', err);
});

const RETRY_DELAY_MS = 15000;

function startBot() {
  // Self-scheduling retry: 409 = another polling instance holds the token (a
  // draining Railway container, or the bot started elsewhere). Telegraf aborts
  // on 409, so keep retrying until the other instance releases the token.
  console.log('🤖 Telegram bot connecting...');
  bot.launch().catch((e) => {
    console.error('🤖 Telegram bot launch failed (retrying in 15s):', e.message);
    setTimeout(startBot, RETRY_DELAY_MS);
  });
}

startBot();

process.once('SIGINT', () => {
  if (bot.polling) bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  if (bot.polling) bot.stop('SIGTERM');
});

module.exports = { bot, generateReport, startBot };
