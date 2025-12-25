const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const http = require('http');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = '8540069219:AAGZivvxcbLIekiSbUvfzIdpsHryneY2Zhg';
const CHAT_ID = '309261147'; 
const LAT = 34.6593;
const LNG = 33.0038;
const ADDRESS = "Andrea Achillidi 10a, Zakaki, Limassol";

// --- СЕРВЕР ДЛЯ RENDER (Health Check) ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RainGuard Bot is running!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

const bot = new Telegraf(BOT_TOKEN);

// Функция получения погоды
async function getWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,precipitation,wind_speed_10m&hourly=temperature_2m,precipitation,wind_speed_10m&timezone=auto`;
  const { data } = await axios.get(url);
  return data;
}

async function checkWeather(isManual = false, targetId = CHAT_ID) {
  if (!targetId || targetId === 'ВАШ_ID_ЧАТА' || targetId === '') {
    if (!isManual) console.log("CHAT_ID не настроен. Напишите /start боту.");
    return;
  }
  
  try {
    const data = await getWeather();
    const current = data.current;
    const hourly = data.hourly;
    
    const rainSoon = hourly.precipitation.slice(0, 12).some(p => p > 0.1);
    const isRainingNow = current.precipitation > 0;

    if (isRainingNow && !isManual) {
      await bot.telegram.sendMessage(targetId, "🚨 СРОЧНО! По адресу " + ADDRESS + " начинается дождь! Уберите вещи! 🧺🌧️");
    } else if (rainSoon && !isManual) {
      await bot.telegram.sendMessage(targetId, "⚠️ Внимание! В ближайшие 12 часов ожидается дождь. Не забудьте про вещи на улице. ☁️");
    } else if (isManual) {
      const msg = `📍 Текущая погода (${ADDRESS}):\n🌡 Темп: ${current.temperature_2m}°C\n💧 Осадки: ${current.precipitation}мм\n💨 Ветер: ${current.wind_speed_10m}км/ч`;
      await bot.telegram.sendMessage(targetId, msg);
    }
  } catch (e) {
    console.error("Weather error:", e);
  }
}

// Команда /start для получения ID
bot.start((ctx) => {
  const msg = "✅ Бот на связи!\n\nТвой Chat ID: " + ctx.chat.id + "\n\nСкопируй это число, вставь его в поле 'Chat ID' на сайте и обнови bot.js. Это нужно, чтобы я мог присылать тебе уведомления автоматически! 🧺";
  ctx.reply(msg);
});

// Команда /weather - текущая погода
bot.command('weather', (ctx) => checkWeather(true, ctx.chat.id));

// Команда /tonight - погода на ночь (22:00)
bot.command('tonight', async (ctx) => {
  try {
    const data = await getWeather();
    const tonightIndex = data.hourly.time.findIndex(t => t.includes('T22:00'));
    if (tonightIndex !== -1) {
      const temp = data.hourly.temperature_2m[tonightIndex];
      const prec = data.hourly.precipitation[tonightIndex];
      const wind = data.hourly.wind_speed_10m[tonightIndex];
      const msg = `🌙 Прогноз на ночь (22:00):\n🌡 Темп: ${temp}°C\n💧 Осадки: ${prec}мм\n💨 Ветер: ${wind}км/ч`;
      ctx.reply(msg);
    } else {
      ctx.reply("Не удалось найти прогноз на эту ночь.");
    }
  } catch (e) {
    ctx.reply("Ошибка при получении прогноза.");
  }
});

// Проверка каждые 15 минут
cron.schedule('*/15 * * * *', () => checkWeather());

bot.launch().then(() => {
  console.log("RainGuard Bot successfully started!");
}).catch(err => {
  console.error("FATAL ERROR: Check your BOT_TOKEN!", err.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));