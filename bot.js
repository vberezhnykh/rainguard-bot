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

// Порог осадков (мм), выше которого поднимаем панику
const RAIN_THRESHOLD = 0.5; 

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
  res.end('RainGuard Bot v2.7 Precision is Live!\n');
}).listen(port, () => {
  console.log(`[System] Server monitoring port ${port}`);
});

const bot = new Telegraf(BOT_TOKEN);

bot.catch((err) => console.error(`[Bot Error] ${err.message}`));

const mainMenu = Markup.keyboard([
  ['🌡️ Погода сейчас', '🌙 Прогноз на ночь'],
  ['ℹ️ Помощь']
]).resize();

async function getWeather() {
  // Добавили weather_code для точности
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation,weather_code&timezone=auto`;
  const { data } = await axios.get(url);
  return data;
}

// Пояснение кодов погоды WMO (51+ это дождь разной силы)
function isActuallyRaining(code, precipitation) {
  const isRainyCode = code >= 51; // 51-67 морось/дождь, 80-82 ливни
  return isRainyCode && precipitation >= RAIN_THRESHOLD;
}

async function checkWeather(isManual = false, targetId = CHAT_ID) {
  try {
    const data = await getWeather();
    const current = data.current;
    
    const rainingNow = isActuallyRaining(current.weather_code, current.precipitation);

    if (isManual) {
      const rainStatus = current.precipitation > 0 ? `💧 Осадки: ${current.precipitation} мм` : "☀️ Осадков нет";
      const msg = `📍 Погода прямо сейчас:\n🌡 Температура: ${current.temperature_2m}°C\n${rainStatus}\n💨 Ветер: ${current.wind_speed_10m} км/ч`;
      await bot.telegram.sendMessage(targetId, msg, mainMenu);
    } else {
      if (rainingNow && !wasRaining) {
        await bot.telegram.sendMessage(targetId, `🚨 ВНИМАНИЕ! Обнаружен дождь (${current.precipitation} мм). Рекомендуется убрать вещи! 🧺🌧️`);
      } else if (!rainingNow && wasRaining) {
        await bot.telegram.sendMessage(targetId, "☀️ Дождь прекратился. Можно сушить вещи! 🧺");
      }
      wasRaining = rainingNow;
    }
  } catch (e) { console.error("Check failed:", e.message); }
}

bot.start((ctx) => ctx.reply("✅ RainGuard v2.7 (Precision) готов!", mainMenu));

bot.command('debug', async (ctx) => {
  const data = await getWeather();
  const c = data.current;
  ctx.reply(`🛠 DEBUG INFO:\nCode: ${c.weather_code}\nPrec: ${c.precipitation}mm\nThreshold: ${RAIN_THRESHOLD}mm`);
});

bot.hears('🌡️ Погода сейчас', (ctx) => checkWeather(true, ctx.chat.id));

bot.hears('🌙 Прогноз на ночь', async (ctx) => {
  try {
    const data = await getWeather();
    const tonightIndex = data.hourly.time.findIndex(t => t.includes('T22:00'));
    if (tonightIndex !== -1) {
      const prec = data.hourly.precipitation[tonightIndex];
      const code = data.hourly.weather_code[tonightIndex];
      const willRain = isActuallyRaining(code, prec);
      const status = willRain ? "⚠️ Вероятен дождь!" : "✅ Должно быть сухо.";
      ctx.reply(`🌙 Прогноз на 22:00:\n${status}\n🌡 Темп: ${data.hourly.temperature_2m[tonightIndex]}°C\n💧 Осадки: ${prec}мм`, mainMenu);
    }
  } catch (e) { ctx.reply("Ошибка прогноза."); }
});

bot.hears('ℹ️ Помощь', (ctx) => ctx.reply("Я слежу за дождем с порогом чувствительности 0.5мм."));

cron.schedule('*/15 * * * *', () => checkWeather());

async function startBot(retries = 5) {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log("🚀 RainGuard v2.7 Precision успешно запущен!");
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
