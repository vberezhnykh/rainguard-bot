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

// Переменная для отслеживания состояния дождя
let wasRaining = false;

// --- СЕРВЕР ДЛЯ RENDER (Health Check) ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RainGuard Bot is running!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

const bot = new Telegraf(BOT_TOKEN);

// Кнопки меню (Reply Keyboard)
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
  if (!targetId || targetId === '') return;
  
  try {
    const data = await getWeather();
    const current = data.current;
    const hourly = data.hourly;
    
    const isRainingNow = current.precipitation > 0.1;
    const rainSoon = hourly.precipitation.slice(0, 12).some(p => p > 0.1);

    // Логика автоматических уведомлений (срабатывает раз в 15 минут)
    if (!isManual) {
      if (isRainingNow && !wasRaining) {
        // Дождь начался
        await bot.telegram.sendMessage(targetId, "🚨 СРОЧНО! Начинается дождь! Уберите вещи! 🧺🌧️\n📍 " + ADDRESS);
      } else if (!isRainingNow && wasRaining) {
        // Дождь закончился
        await bot.telegram.sendMessage(targetId, "☀️ Ура! Дождь закончился. Можно снова вывешивать вещи сушиться! 🧺🧤\n📍 " + ADDRESS);
      } else if (rainSoon && !isRainingNow && !wasRaining) {
        // Ожидается в ближайшие 12 часов (предупреждение)
        await bot.telegram.sendMessage(targetId, "⚠️ Внимание! В ближайшие 12 часов ожидается дождь. Не забудьте про вещи! ☁️");
      }
      // Обновляем состояние для следующей проверки
      wasRaining = isRainingNow;
    }

    if (isManual) {
      const msg = `📍 Погода (${ADDRESS}):\n🌡 Температура: ${current.temperature_2m}°C\n💧 Осадки: ${current.precipitation} мм\n💨 Ветер: ${current.wind_speed_10m} км/ч`;
      await bot.telegram.sendMessage(targetId, msg, mainMenu);
    }
  } catch (e) {
    console.error("Weather check failed:", e);
  }
}

bot.start((ctx) => {
  ctx.reply("✅ RainGuard активирован!\n\nЯ буду следить за дождем каждые 15 минут. Используй кнопки внизу для быстрой проверки!", mainMenu);
});

bot.hears('🌡️ Погода сейчас', (ctx) => checkWeather(true, ctx.chat.id));

bot.hears('🌙 Прогноз на ночь', async (ctx) => {
  try {
    const data = await getWeather();
    const tonightIndex = data.hourly.time.findIndex(t => t.includes('T22:00'));
    if (tonightIndex !== -1) {
      const temp = data.hourly.temperature_2m[tonightIndex];
      const prec = data.hourly.precipitation[tonightIndex];
      const wind = data.hourly.wind_speed_10m[tonightIndex];
      const status = prec > 0.1 ? "⚠️ Ожидается дождь!" : "✅ Будет сухо.";
      const msg = `🌙 Прогноз на 22:00:\n${status}\n🌡 Темп: ${temp}°C\n💧 Осадки: ${prec}мм\n💨 Ветер: ${wind}км/ч`;
      ctx.reply(msg, mainMenu);
    } else { ctx.reply("Прогноз на ночь пока не доступен."); }
  } catch (e) { ctx.reply("Ошибка получения прогноза."); }
});

bot.hears('ℹ️ Помощь', (ctx) => {
  ctx.reply("Я — твой помощник для защиты белья от дождя!\n\n📡 Проверяю погоду каждые 15 минут.\n🚨 Напишу, если начнется дождь.\n☀️ Напишу, когда он закончится.\n📍 Адрес мониторинга: " + ADDRESS, mainMenu);
});

// Планировщик: проверка каждые 15 минут
cron.schedule('*/15 * * * *', () => checkWeather());

bot.launch().then(() => console.log("RainGuard Bot is Live!"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));