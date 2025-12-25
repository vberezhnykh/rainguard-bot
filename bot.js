const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const http = require('http');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = '8540069219:AAGZivvxcbLIekiSbUvfzIdpsHryneY2Zhg';
const CHAT_ID = 'ВАШ_ID_ЧАТА'; 
const LAT = 34.6593;
const LNG = 33.0038;
const ADDRESS = "Andrea Achillidi 10a, Zakaki, Limassol";

// --- ФЕЙКОВЫЙ СЕРВЕР ДЛЯ RENDER ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RainGuard Bot is alive!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

const bot = new Telegraf(BOT_TOKEN);

async function checkWeather(isManual = false, targetId = CHAT_ID) {
  // Если ID еще не настроен в коде, бот не сможет слать уведомления по расписанию
  if (!targetId || targetId === 'ВАШ_ID_ЧАТА' || targetId === '') {
    if (!isManual) console.log("Уведомление не отправлено: CHAT_ID не настроен. Напишите /start боту.");
    return;
  }
  
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,precipitation,wind_speed_10m&hourly=temperature_2m,precipitation,wind_speed_10m&timezone=auto`;
    const { data } = await axios.get(url);
    
    const current = data.current;
    const hourly = data.hourly;
    
    const rainSoon = hourly.precipitation.slice(0, 12).some(p => p > 0.1);
    const isRainingNow = current.precipitation > 0;

    if (isRainingNow && !isManual) {
      await bot.telegram.sendMessage(targetId, "🚨 СРОЧНО! По адресу " + ADDRESS + " начинается дождь! Уберите вещи! 🧺🌧️");
    } else if (rainSoon && !isManual) {
      await bot.telegram.sendMessage(targetId, "⚠️ Внимание! В ближайшие 12 часов ожидается дождь. Не забудьте про вещи на улице. ☁️");
    } else if (isManual) {
      const msg = `📍 Погода (${ADDRESS}):\n🌡 Темп: ${current.temperature_2m}°C\n💧 Осадки: ${current.precipitation}мм\n💨 Ветер: ${current.wind_speed_10m}км/ч`;
      await bot.telegram.sendMessage(targetId, msg);
    }
  } catch (e) {
    console.error("Weather error:", e);
  }
}

bot.start((ctx) => {
  const msg = "✅ Бот подключен!\n\nТвой Chat ID: " + ctx.chat.id + "\n\nСкопируй это число, вставь в настройки на сайте и обнови bot.js, чтобы я мог присылать тебе автоматические предупреждения о дожде! 🧺";
  ctx.reply(msg);
});

bot.command('weather', (ctx) => checkWeather(true, ctx.chat.id));

// Проверка каждые 15 минут
cron.schedule('*/15 * * * *', () => checkWeather());

bot.launch().then(() => {
  console.log("RainGuard Bot successfully started!");
}).catch(err => {
  console.error("FATAL ERROR: Check your BOT_TOKEN!", err.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));