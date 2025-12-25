const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const http = require('http');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = '8540069219:AAGZivvxcbLIekiSbUvfzIdpsHryneY2Zhg';
const CHAT_ID = '309261147'; 
const LAT = 34.6593;
const LNG = 33.0038;
const ADDRESS = "Andrea Achillidi 10a, Zakaki, Limassol";
const APP_URL = process.env.RENDER_EXTERNAL_URL; // Render сам подставит URL

let wasRaining = false;

// --- СЕРВЕР И КИП-АЛАЙВ ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200);
    return res.end('ok');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RainGuard Bot is Live!\n');
}).listen(port, () => {
  console.log(`[System] Server monitoring port ${port}`);
});

// Функция самопрозвона (Keep-Alive)
function keepAlive() {
  if (!APP_URL) return;
  setInterval(async () => {
    try {
      await axios.get(APP_URL);
      console.log('[System] Self-ping successful - Stayin\' alive!');
    } catch (e) {
      console.log('[System] Self-ping failed, but that\'s okay.');
    }
  }, 10 * 60 * 1000); // Каждые 10 минут
}

const bot = new Telegraf(BOT_TOKEN);

// Глобальная обработка ошибок
bot.catch((err, ctx) => {
  console.error(`[Error] Critical bot error for ${ctx.updateType}:`, err);
});

bot.use(async (ctx, next) => {
  if (ctx.message) {
    console.log(`[Incoming] ${ctx.from.first_name}: "${ctx.message.text || 'media'}"`);
  }
  return next();
});

const mainMenu = Markup.keyboard([
  ['🌡️ Погода сейчас', '🌙 Прогноз на ночь'],
  ['ℹ️ Помощь']
]).resize();

async function getWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,precipitation,wind_speed_10m&hourly=temperature_2m,precipitation,wind_speed_10m&timezone=auto`;
  const { data } = await axios.get(url);
  return data;
}

async function checkWeather(isManual = false, targetId = CHAT_ID) {
  if (!targetId) return;
  try {
    const data = await getWeather();
    const current = data.current;
    const hourly = data.hourly;
    
    const isRainingNow = current.precipitation > 0.1;
    const rainSoon = hourly.precipitation.slice(0, 12).some(p => p > 0.1);

    if (!isManual) {
      if (isRainingNow && !wasRaining) {
        await bot.telegram.sendMessage(targetId, "🚨 СРОЧНО! Начинается дождь! Уберите вещи! 🧺🌧️");
      } else if (!isRainingNow && wasRaining) {
        await bot.telegram.sendMessage(targetId, "☀️ Дождь закончился! Можно сушить вещи. 🧺");
      } else if (rainSoon && !isRainingNow && !wasRaining) {
        await bot.telegram.sendMessage(targetId, "⚠️ Внимание! Ожидается дождь в ближайшие 12 часов. ☁️");
      }
      wasRaining = isRainingNow;
    }

    if (isManual) {
      const msg = `📍 Погода:\n🌡 ${current.temperature_2m}°C\n💧 Осадки: ${current.precipitation} мм`;
      await bot.telegram.sendMessage(targetId, msg, mainMenu);
    }
  } catch (e) { console.error("Check failed:", e.message); }
}

bot.start((ctx) => ctx.reply("✅ RainGuard v2.4 готов!", mainMenu));
bot.command('status', (ctx) => ctx.reply(`🤖 Статус: Online\n🌐 URL: ${APP_URL || 'Not set'}`));

bot.hears('🌡️ Погода сейчас', (ctx) => checkWeather(true, ctx.chat.id));
bot.hears('ℹ️ Помощь', (ctx) => ctx.reply("Я слежу за дождем 24/7."));

cron.schedule('*/15 * * * *', () => checkWeather());

(async () => {
  try {
    console.log("Starting RainGuard v2.4 (Keep-Alive)...");
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    keepAlive();
    console.log("Bot is fully operational!");
  } catch (err) {
    console.error("Launch fatal:", err.message);
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
