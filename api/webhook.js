// Это базовая версия вебхука для Vercel
const { Telegraf } = require('telegraf');
const express = require('express');

// Инициализация бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Создание Express приложения
const app = express();

// Простейшая клавиатура
const mainMenuKeyboard = {
  keyboard: [
    ['🌱 Определить растение', '💊 Витамины и питание'],
    ['👨‍💻 Создатели', 'ℹ️ Помощь']
  ],
  resize_keyboard: true
};

// Простая обработка команды /start
bot.start((ctx) => {
  ctx.reply(
    'Привет! Я бот для определения растений и предоставления информации о них. Отправьте фото растения или выберите опцию из меню.', 
    { reply_markup: mainMenuKeyboard }
  );
});

// Обработка фото растений
bot.on('photo', async (ctx) => {
  await ctx.reply('Получил вашу фотографию! Это работающая версия бота на Vercel.');
});

// Обработчик для кнопки "Создатели"
bot.hears('👨‍💻 Создатели', async (ctx) => {
  await ctx.reply(
    '<b>Создатели бота:</b>\n\n' +
    '• <b>@qynon</b> - <i>Кенжеғали Нұрас</i>\n' +
    '• <b>@iapmon</b> - <i>Сарсенбиғалиқызы Зере</i>\n\n' +
    'Спасибо за использование нашего бота!',
    { parse_mode: 'HTML' }
  );
});

// Обработчик для кнопки "Помощь"
bot.hears('ℹ️ Помощь', async (ctx) => {
  await ctx.reply(
    'Я помогу вам определить растения и узнать о них больше.\n\n' +
    'Отправьте фото растения, и я расскажу, что это за растение.\n\n' +
    'Скоро появятся дополнительные функции!'
  );
});

// Обработчик для кнопки "Определить растение"
bot.hears('🌱 Определить растение', async (ctx) => {
  await ctx.reply('Пожалуйста, отправьте фотографию растения, которое хотите определить.');
});

// Обработчик для кнопки "Витамины и питание"
bot.hears('💊 Витамины и питание', async (ctx) => {
  await ctx.reply('Раздел о витаминах и питании скоро будет доступен!');
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  
  // Если это не кнопка меню
  if (!['🌱 Определить растение', '💊 Витамины и питание', '👨‍💻 Создатели', 'ℹ️ Помощь'].includes(userMessage)) {
    await ctx.reply('Я понимаю команды меню и могу анализировать фотографии растений. Пожалуйста, воспользуйтесь меню или отправьте фото.', 
      { reply_markup: mainMenuKeyboard }
    );
  }
});

// Настройка Express для вебхука Telegram
app.use(express.json());
app.use(bot.webhookCallback('/api/webhook'));

// Проверка работоспособности
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// Корневой маршрут
app.get('/', (req, res) => {
  res.status(200).send('Telegram Bot is running');
});

// Экспорт приложения для Vercel
module.exports = app; 