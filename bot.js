const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const http = require('http');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID; 
const LAT = 34.6593;
const LNG = 33.0038;
const ADDRESS = "Andrea Achillidi 10a, Zakaki, Limassol";
const APP_URL = process.env.RENDER_EXTERNAL_URL;

const RAIN_THRESHOLD = 0.5; // Минимальный порог в мм

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ ОШИБКА: Проверьте переменные BOT_TOKEN и CHAT_ID!');
  process.exit(1);
}

let wasRaining = false;

// --- СЕРВЕР ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200);
    return res.end('ok');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RainGuard Bot v2.8 Smart Forecast is Live!\n');
}).listen(port, () => {
  console.log(`[System] Server monitoring port ${port}`);
});

const bot = new Telegraf(BOT_TOKEN);

bot.catch((err) => console.error(`[Bot Error] ${err.message}`));

const mainMenu = Markup.keyboard([
  ['🌡️ Погода сейчас', '📅 Прогноз на день'],
  ['🌙 Прогноз на ночь', 'ℹ️ Помощь']
]).resize();

async function getWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation,weather_code&timezone=auto`;
  const { data } = await axios.get(url);
  return data;
}

function isActuallyRaining(code, precipitation) {
  return code >= 51 && precipitation >= RAIN_THRESHOLD;
}

async function checkWeather(isManual = false, targetId = CHAT_ID) {
  try {
    const data = await getWeather();
    const current = data.current;
    const rainingNow = isActuallyRaining(current.weather_code, current.precipitation);

    if (isManual) {
      const msg = `📍 Погода сейчас:\n🌡 ${current.temperature_2m}°C\n${current.precipitation > 0 ? '💧 Осадки: ' + current.precipitation + ' мм' : '☀️ Осадков нет'}\n💨 Ветер: ${current.wind_speed_10m} км/ч`;
      await bot.telegram.sendMessage(targetId, msg, mainMenu);
    } else {
      if (rainingNow && !wasRaining) {
        await bot.telegram.sendMessage(targetId, `🚨 ВНИМАНИЕ! Начался дождь (${current.precipitation} мм). Уберите вещи! 🧺🌧️`);
      } else if (!rainingNow && wasRaining) {
        await bot.telegram.sendMessage(targetId, "☀️ Дождь прекратился. Можно сушить вещи! 🧺");
      }
      wasRaining = rainingNow;
    }
  } catch (e) { console.error("Check failed:", e.message); }
}

bot.start((ctx) => ctx.reply("✅ RainGuard v2.8 (Smart Forecast) готов к работе!", mainMenu));

bot.hears('🌡️ Погода сейчас', (ctx) => checkWeather(true, ctx.chat.id));

bot.hears('📅 Прогноз на день', async (ctx) => {
  try {
    const data = await getWeather();
    const next12Hours = data.hourly.time.slice(0, 12);
    const rainTimes = [];
    let maxTemp = -99;

    next12Hours.forEach((time, i) => {
      const prec = data.hourly.precipitation[i];
      const code = data.hourly.weather_code[i];
      if (isActuallyRaining(code, prec)) {
        const hour = new Date(time).getHours();
        rainTimes.push(`${hour}:00`);
      }
      if (data.hourly.temperature_2m[i] > maxTemp) maxTemp = data.hourly.temperature_2m[i];
    });

    let msg = `📅 Прогноз на ближайшие 12 часов:\n🌡 Макс. температура: ${maxTemp}°C\n\n`;
    if (rainTimes.length > 0) {
      msg += `⚠️ Внимание! Дождь ожидается в: ${rainTimes.join(', ')}. Спланируйте сушку вещей! 🧺🌧️`;
    } else {
      msg += `☀️ Дождя не ожидается. Отличный день для стирки! ✅`;
    }
    ctx.reply(msg, mainMenu);
  } catch (e) { ctx.reply("Ошибка прогноза на день."); }
});

bot.hears('🌙 Прогноз на ночь', async (ctx) => {
  try {
    const data = await getWeather();
    const rainTimes = [];
    
    // Сканируем с 22:00 сегодня до 07:00 завтра
    data.hourly.time.forEach((time, i) => {
      const date = new Date(time);
      const hour = date.getHours();
      // Упрощенная логика выбора ночных часов из массива (первые 24 часа)
      const isNight = hour >= 22 || hour <= 7;
      if (isNight && i < 24) {
        const prec = data.hourly.precipitation[i];
        const code = data.hourly.weather_code[i];
        if (isActuallyRaining(code, prec)) {
          rainTimes.push(`${hour}:00`);
        }
      }
    });

    let msg = `🌙 Прогноз на ночь (22:00 - 07:00):\n\n`;
    if (rainTimes.length > 0) {
      msg += `🚨 Внимание! Ночью будет дождь в: ${rainTimes.join(', ')}. Уберите вещи с вечера! 🧺🌧️`;
    } else {
      msg += `✅ Ночь будет сухой. Можно оставлять вещи на улице! 🌙☀️`;
    }
    ctx.reply(msg, mainMenu);
  } catch (e) { ctx.reply("Ошибка прогноза на ночь."); }
});

bot.hears('ℹ️ Помощь', (ctx) => ctx.reply("Я — RainGuard v2.8. Помогаю беречь белье!\n\n- На день: прогноз на 12 часов.\n- На ночь: проверка с 22:00 до 07:00."));

cron.schedule('*/15 * * * *', () => checkWeather());

async function startBot(retries = 5) {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log("🚀 RainGuard v2.8 успешно запущен!");
  } catch (err) {
    if (err.message.includes('409') && retries > 0) {
      setTimeout(() => startBot(retries - 1), 5000);
    }
  }
}

startBot();

if (APP_URL) {
  setInterval(() => axios.get(APP_URL).catch(() => {}), 10 * 60 * 1000);
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
