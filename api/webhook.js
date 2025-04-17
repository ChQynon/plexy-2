// Этот файл нужен для Vercel - он служит точкой входа для вебхука
const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const express = require('express');
const axios = require('axios');

// Загрузка переменных окружения
dotenv.config();

// Инициализация бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA3WOrYYhw6FnePJX3EANcmwH6OvkZW9IE";

// Создание Express приложения
const app = express();

// Хранилище состояний пользователей
const userStates = {};

// Получить или создать состояние пользователя
function getUserState(userId) {
  if (!userStates[userId]) {
    userStates[userId] = {
      lastPlantData: null,
      lastMessage: null,
      lastImageUrl: null,
      lastImageBase64: null,
      lastPlantName: null,
      lastActionTime: 0,
      sessionStart: new Date(),
      messageCount: 0,
      currentState: null,
      conversationHistory: [],
      lastIdentifiedPlant: null
    };
  }
  return userStates[userId];
}

// Клавиатура для главного меню
const mainMenuKeyboard = () => {
  return {
    keyboard: [
      ['🌱 Определить растение', '🔍 Проблема с растением'],
      ['💊 Витамины и питание', '❓ Задать вопрос'],
      ['ℹ️ Помощь', '📝 Оставить отзыв'],
      ['👨‍💻 Создатели']
    ],
    resize_keyboard: true
  };
};

// Клавиатура для действий с растением
const createPlantActionKeyboard = () => {
  return {
    inline_keyboard: [
      [
        { text: '🌿 Советы по уходу', callback_data: 'care' },
        { text: '❗ Проблемы', callback_data: 'problems' }
      ],
      [
        { text: '💊 Витамины', callback_data: 'vitamins' },
        { text: '🌍 Происхождение', callback_data: 'origin' }
      ],
      [
        { text: '💧 Полив', callback_data: 'watering' },
        { text: '☀️ Освещение', callback_data: 'light' }
      ],
      [
        { text: '🌡️ Температура', callback_data: 'temp' },
        { text: '📚 Подробнее', callback_data: 'info' }
      ]
    ]
  };
};

// Функция для вызова Gemini API
async function callGeminiAPI(userState, systemPrompt, userPrompt) {
  try {
    // API запрос
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-thinking-exp-01-21:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: `Инструкции для тебя: ${systemPrompt}. Отвечай по-русски, без представлений и приветствий.` }]
          },
          {
            role: "user",
            parts: Array.isArray(userPrompt) 
              ? userPrompt 
              : [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }
    );
    
    // Обработка ответа
    let content = '';
    if (response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content) {
      content = response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response from Gemini API');
    }
    
    // Обработка форматирования
    content = content.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");  // Bold
    content = content.replace(/\*(.*?)\*/g, "<i>$1</i>");      // Italic
    content = content.replace(/__(.*?)__/g, "<u>$1</u>");      // Underline
    content = content.replace(/```(.*?)```/gs, "<pre>$1</pre>"); // Code blocks
    content = content.replace(/`(.*?)`/g, "<code>$1</code>");  // Inline code
    content = content.replace(/#{1,6} (.*?)(?:\n|$)/g, "<b>$1</b>\n"); // Headers
    
    // Удаление представлений в тексте
    content = content.replace(/(?:Здравствуйте|Привет|Добрый день)[!,.]?\s*/gi, '');
    content = content.replace(/(?:Я|это)?\s*PLEXY[,\s]+(эксперт|помощник|бот|специалист)[^\.]*?(?:Plexy Lab|PlexiLab)[.,]?\s*/gi, '');
    content = content.replace(/Я\s*—\s*PLEXY[,\s][^\.]*?(?:Plexy Lab|PlexiLab)[.,]?\s*/gi, '');
    content = content.replace(/Я\s*—\s*(?:большая языковая модель|модель|нейросеть)[^\.]*?(?:Google|OpenAI|Anthropic)[.,]?\s*/gi, '');
    
    return content;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Произошла ошибка при получении ответа. Пожалуйста, попробуйте позже.";
  }
}

// Обработка фотографий
bot.on('photo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userState = getUserState(userId);
    
    // Отправка уведомления о процессе
    const processingMessage = await ctx.reply('Анализирую изображение...');
    
    // Получение фото
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const fileLink = await ctx.telegram.getFileLink(photoId);
    
    // Загрузка изображения
    const imageResponse = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    const base64Image = imageBuffer.toString('base64');
    
    // Сохранение URL изображения
    userState.lastImageUrl = fileLink.href;
    userState.lastImageBase64 = base64Image;
    
    // Получение подписи
    const caption = ctx.message.caption || '';
    
    // Определение типа запроса (идентификация или проблема)
    const isPlantProblem = userState.currentState === 'waiting_for_problem_description' || 
                          caption.toLowerCase().includes('проблема') || 
                          caption.toLowerCase().includes('болезнь');
    
    // Формирование системного промпта
    let systemPrompt = isPlantProblem
      ? 'Определи растение на фото и опиши возможные проблемы, которые видны. Предложи методы решения. Не представляйся.'
      : 'Определи растение на фото, укажи его научное и обиходное название. Опиши основные характеристики и условия ухода. Не представляйся.';
    
    try {
      // Запрос к Gemini API с изображением
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-thinking-exp-01-21:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Инструкции для тебя: ${systemPrompt}. Четко укажи научное и обиходное название растения в начале ответа.`
                }
              ]
            },
            {
              role: "user",
              parts: [
                {
                  text: caption || 'Определи это растение и расскажи о нем'
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
          },
        }
      );
      
      let content = '';
      if (response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content) {
        content = response.data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Invalid response from Gemini API');
      }
      
      // Очистка контента от форматирования
      let cleanContent = content
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}/g, '')
        .replace(/`/g, '');
      
      // Поиск названия растения
      const namePatterns = [
        /(?:Научное название|Научное наименование|Латинское название):\s*([^\.,:;\n]+)/i,
        /(?:Название|Наименование|Растение называется):\s*([^\.,:;\n]+)/i,
        /(?:На фотографии|На фото)[^\.]*?(?:растение|цветок)\s+([^\.,:;\n]+)/i
      ];
      
      for (const pattern of namePatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
          userState.lastIdentifiedPlant = match[1].trim();
          break;
        }
      }
      
      // Форматирование ответа
      content = content.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
      content = content.replace(/\*(.*?)\*/g, "<i>$1</i>");
      content = content.replace(/#{1,6} (.*?)(?:\n|$)/g, "<b>$1</b>\n");
      
      // Удаление представлений
      content = content.replace(/(?:Здравствуйте|Привет|Добрый день)[!,.]?\s*/gi, '');
      content = content.replace(/(?:Я|это)?\s*PLEXY[,\s]+(эксперт|помощник|бот|специалист)[^\.]*?(?:Plexy Lab|PlexiLab)[.,]?\s*/gi, '');
      content = content.replace(/Я\s*—\s*(?:большая языковая модель|модель|нейросеть)[^\.]*?(?:Google|OpenAI|Anthropic)[.,]?\s*/gi, '');
      
      // Обновление сообщения с ответом
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        content,
        { parse_mode: 'HTML' }
      );
      
      // Отправка клавиатуры с дополнительными действиями
      await ctx.reply(
        'Что вы хотите узнать еще?',
        { reply_markup: createPlantActionKeyboard() }
      );
      
    } catch (error) {
      console.error('Error processing image:', error);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        'Извините, не удалось проанализировать изображение. Пожалуйста, попробуйте еще раз с более четким фото.'
      );
    }
    
  } catch (error) {
    console.error('Error handling photo:', error);
    await ctx.reply('Произошла ошибка при обработке изображения. Пожалуйста, попробуйте позже.');
  }
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  try {
    const userMessage = ctx.message.text;
    const userId = ctx.from.id;
    const userState = getUserState(userId);
    
    // Пропуск кнопок меню и команд
    const buttonResponses = [
      '🌱 Определить растение', '🔍 Проблема с растением',
      '💊 Витамины и питание', '❓ Задать вопрос',
      'ℹ️ Помощь', '📝 Оставить отзыв', '👨‍💻 Создатели',
      '« Назад', '« Главное меню',
      '💊 Информация о витаминах', '🥗 Здоровое питание',
      '🩺 Симптомы авитаминоза', '💡 Советы по питанию'
    ];
    
    if (buttonResponses.includes(userMessage) || userMessage.startsWith('/')) {
      if (userMessage === '🌱 Определить растение') {
        userState.currentState = 'waiting_for_photo';
        return ctx.reply('Отправьте фото растения, которое хотите определить', {
          reply_markup: { keyboard: [['« Назад']], resize_keyboard: true }
        });
      }
      
      if (userMessage === '🔍 Проблема с растением') {
        userState.currentState = 'waiting_for_problem_description';
        return ctx.reply('Отправьте фото растения с проблемой и напишите краткое описание проблемы в подписи к фото', {
          reply_markup: { keyboard: [['« Назад']], resize_keyboard: true }
        });
      }
      
      if (userMessage === '« Назад' || userMessage === '« Главное меню') {
        userState.currentState = null;
        return ctx.reply('Главное меню', {
          reply_markup: mainMenuKeyboard()
        });
      }
      
      if (userMessage === '👨‍💻 Создатели') {
        return ctx.reply('<b>Создатели бота:</b>\n\n@qynon Кенжеғали Нұрас\n@iapmon Сарсенбиғалиқызы Зере', {
          parse_mode: 'HTML',
          reply_markup: mainMenuKeyboard()
        });
      }
      
      if (userMessage === '/start') {
        const welcomeMessage = `
Привет! 👋 Я бот для определения растений.

Я могу помочь вам с:
🌱 Определением растений по фото
🔍 Диагностикой проблем с растениями
🍎 Информацией о витаминах и минералах
♻️ Использованием бытовых отходов для удобрений
❓ Решением типичных проблем с растениями

Отправьте фото растения для идентификации или используйте меню ниже:
        `;
        
        return ctx.reply(welcomeMessage, {
          reply_markup: mainMenuKeyboard()
        });
      }
      
      if (userMessage === 'ℹ️ Помощь' || userMessage === '/help') {
        return ctx.reply(
          'Я помогу вам определить растения и узнать о них больше.\n\n' +
          'Отправьте фото растения, и я расскажу, что это за растение, как за ним ухаживать.\n\n' +
          'Если у растения есть проблема, отправьте фото и описание проблемы в подписи.\n\n' +
          'Вы также можете узнать о витаминах и правильном питании в соответствующем разделе меню.',
          { reply_markup: mainMenuKeyboard() }
        );
      }
      
      if (userMessage === '📝 Оставить отзыв') {
        userState.currentState = 'waiting_for_feedback';
        return ctx.reply('Пожалуйста, напишите ваш отзыв или предложение по улучшению бота', {
          reply_markup: { keyboard: [['« Назад']], resize_keyboard: true }
        });
      }
      
      if (userMessage === '💊 Витамины и питание') {
        return ctx.reply(
          'Раздел о витаминах и питании',
          {
            reply_markup: {
              keyboard: [
                ['💊 Информация о витаминах', '🥗 Здоровое питание'],
                ['🩺 Симптомы авитаминоза', '💡 Советы по питанию'],
                ['« Главное меню']
              ],
              resize_keyboard: true
            }
          }
        );
      }
      
      if (userMessage === '💊 Информация о витаминах') {
        const processingMessage = await ctx.reply('Подготовка информации о витаминах...');
        
        const systemPrompt = 'Предоставь краткую, но полную информацию о витаминах, их функциях в организме, суточной потребности и в каких продуктах они содержатся. Составь список основных витаминов (A, группа B, C, D, E, K) с кратким описанием.';
        
        const response = await callGeminiAPI(userState, systemPrompt, 'Расскажи о витаминах, их функциях и пользе');
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          response,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      if (userMessage === '🥗 Здоровое питание') {
        const processingMessage = await ctx.reply('Подготовка информации о здоровом питании...');
        
        const systemPrompt = 'Предоставь информацию о принципах здорового питания, балансе питательных веществ, режиме питания и полезных привычках. Добавь примеры здоровых блюд.';
        
        const response = await callGeminiAPI(userState, systemPrompt, 'Расскажи о принципах здорового питания');
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          response,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      if (userMessage === '🩺 Симптомы авитаминоза') {
        const processingMessage = await ctx.reply('Подготовка информации о симптомах авитаминоза...');
        
        const systemPrompt = 'Опиши основные симптомы нехватки различных витаминов и минералов в организме, на какие признаки стоит обратить внимание и как восполнить дефицит естественным путем.';
        
        const response = await callGeminiAPI(userState, systemPrompt, 'Расскажи о симптомах авитаминоза');
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          response,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      if (userMessage === '💡 Советы по питанию') {
        const processingMessage = await ctx.reply('Подготовка советов по питанию...');
        
        const systemPrompt = 'Дай практические советы по улучшению рациона питания, которые легко внедрить в повседневную жизнь. Предложи список полезных перекусов, способы приготовления здоровой пищи и как сделать питание более сбалансированным.';
        
        const response = await callGeminiAPI(userState, systemPrompt, 'Дай практические советы по улучшению питания');
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          response,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      if (userMessage === '❓ Задать вопрос') {
        userState.currentState = 'waiting_for_question';
        return ctx.reply('Задайте ваш вопрос о растениях, витаминах или питании', {
          reply_markup: { keyboard: [['« Назад']], resize_keyboard: true }
        });
      }
      
      return;
    }
    
    // Обработка отзыва
    if (userState.currentState === 'waiting_for_feedback') {
      await ctx.reply('Спасибо за ваш отзыв! Мы обязательно учтем ваше мнение.');
      userState.currentState = null;
      return await ctx.reply('Главное меню', {
        reply_markup: mainMenuKeyboard()
      });
    }
    
    // Обработка вопросов об идентичности
    const lowerMessage = userMessage.toLowerCase();
    if (lowerMessage.includes('кто тебя создал') || 
        lowerMessage.includes('кто ты') || 
        lowerMessage.includes('что ты') || 
        lowerMessage.includes('какой ты') ||
        lowerMessage.includes('твой создатель')) {
      return await ctx.reply('Я бот для определения растений и предоставления советов по уходу за ними.');
    }
    
    if (lowerMessage.includes('как тебя зовут') || 
        lowerMessage.includes('твоё имя') || 
        lowerMessage.includes('твое имя') || 
        lowerMessage.includes('имя у тебя')) {
      return await ctx.reply('Я бот для определения растений и предоставления советов по уходу за ними.');
    }
    
    if (lowerMessage.includes('ты человек') || 
        lowerMessage.includes('ты бот') || 
        lowerMessage.includes('ты робот')) {
      return await ctx.reply('Я бот для определения растений и предоставления советов по уходу за ними.');
    }
    
    // Обработка обычных сообщений через AI
    const processingMessage = await ctx.reply('Обрабатываю ваш запрос...');
    
    const systemPrompt = 'Ты — эксперт по витаминам, минералам и уходу за растениями. ' +
                       'Ты предоставляешь информацию о функциях витаминов в организме, признаках дефицита и передозировки, ' +
                       'а также о том, как ухаживать за комнатными растениями. ' +
                       'Твои ответы должны быть информативными, но краткими.';
                       
    const response = await callGeminiAPI(userState, systemPrompt, userMessage);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      response,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Error processing message:', error);
    await ctx.reply('Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.');
  }
});

// Обработка callback-запросов (кнопок)
bot.action('care', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Советы по уходу за растением:');
  
  const systemPrompt = 'Дай краткие и полезные советы по уходу за растением (полив, освещение, температура, влажность, грунт и подкормка). Используй четкие формулировки. Не представляйся и не упоминай Plexy или Plexy Lab.';
  
  let userPrompt = 'Дай советы по уходу за растением';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Дай конкретные советы по уходу за растением ${userState.lastIdentifiedPlant}, основываясь на особенностях именно этого вида`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('problems', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Типичные проблемы растения:');
  
  const systemPrompt = 'Опиши 3-5 наиболее распространенных проблем с этим растением, их признаки и способы решения. Не представляйся.';
  
  let userPrompt = 'Опиши типичные проблемы растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Опиши типичные проблемы именно для ${userState.lastIdentifiedPlant}, с чем часто сталкиваются владельцы этого конкретного вида`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('vitamins', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Необходимые витамины и микроэлементы:');
  
  const systemPrompt = 'Расскажи о необходимых для этого растения витаминах и микроэлементах. Укажи признаки их недостатка и способы подкормки.';
  
  let userPrompt = 'Расскажи о необходимых витаминах и микроэлементах для растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о необходимых витаминах и микроэлементах для растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('origin', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Происхождение и история растения:');
  
  const systemPrompt = 'Расскажи об истории, происхождении и распространении этого растения. Включи интересные факты.';
  
  let userPrompt = 'Расскажи о происхождении и истории растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о происхождении и истории растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('watering', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Рекомендации по поливу:');
  
  const systemPrompt = 'Дай детальные рекомендации по поливу этого растения: частота, количество воды, особенности в разные сезоны.';
  
  let userPrompt = 'Дай подробные рекомендации по поливу растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Дай подробные рекомендации по поливу растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('light', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Требования к освещению:');
  
  const systemPrompt = 'Опиши требования к освещению для этого растения: интенсивность света, расположение относительно окон.';
  
  let userPrompt = 'Расскажи о требованиях к освещению для растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о требованиях к освещению для растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('temp', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Температурный режим:');
  
  const systemPrompt = 'Расскажи о температурном режиме для этого растения: оптимальная температура днем и ночью, минимальная допустимая температура.';
  
  let userPrompt = 'Расскажи о температурном режиме для растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о температурном режиме для растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('info', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Подробная информация о растении:');
  
  const systemPrompt = 'Предоставь подробную информацию о растении: его особенности, интересные факты, сложность ухода и практическое применение.';
  
  let userPrompt = 'Расскажи подробно о растении';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи подробно о растении ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

// Настройка webhook для Telegram
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

// Установка вебхука
bot.telegram.setWebhook('https://plexy-2.vercel.app/api/webhook')
  .then(() => {
    console.log('Webhook set successfully');
  })
  .catch(err => {
    console.error('Error setting webhook:', err);
  });

// Экспорт приложения для Vercel
module.exports = app; 