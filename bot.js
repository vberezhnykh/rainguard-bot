const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = 'ВАШ_ТОКЕН_ИЗ_BOTFATHER';
const CHAT_ID = 'ВАШ_ID_ЧАТА'; 
const LAT = 34.6593;
const LNG = 33.0038;
const ADDRESS = "Andrea Achillidi 10a, Zakaki, Limassol";

const bot = new Telegraf(BOT_TOKEN);

async function checkWeather(isManual = false, targetId = CHAT_ID) {
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

bot.start((ctx) => ctx.reply("Привет! Я RainGuard. Твой ID чата: " + ctx.chat.id + ". Вставь его в код!"));
bot.command('weather', (ctx) => checkWeather(true, ctx.chat.id));

cron.schedule('*/15 * * * *', () => checkWeather());

bot.launch();
console.log("RainGuard Bot started!");