import { Telegraf, Scenes, session, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { vitaminsModule } from './modules/vitamins';
import { plantsModule } from './modules/plants';
import { plantIdentificationModule } from './modules/plantIdentification';
import { helpCommand } from './commands/help';
import { startCommand } from './commands/start';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import express from 'express';

// Load environment variables
dotenv.config();

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Create temp directory for image storage if it doesn't exist
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Setup for webhook (Vercel deployment)
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const DEVELOPMENT = process.env.NODE_ENV !== 'production';

// Conversation history for each user
interface MessageHistory {
  role: string;
  content: string | any[];
}

// User states for FSM-like behavior
interface UserState {
  lastPlantData: any;
  lastVitaminData: any;
  lastMessage: string | null;
  lastImageUrl: string | null;
  lastImageBase64: string | null;
  lastPlantName: string | null;
  lastActionTime: number;
  sessionStart: Date;
  messageCount: number;
  currentState: string | null;
  conversationHistory: MessageHistory[];
  lastIdentifiedPlant: string | null;
}

const userStates: Record<number, UserState> = {};

// Get or create user state
function getUserState(userId: number): UserState {
  if (!userStates[userId]) {
    userStates[userId] = {
      lastPlantData: null,
      lastVitaminData: null,
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

// Gemini API call function
async function callGeminiAPI(userState: UserState, systemPrompt: string, userPrompt: string | any[], addToHistory: boolean = true): Promise<string> {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA3WOrYYhw6FnePJX3EANcmwH6OvkZW9IE";
    
    // Import the GoogleGenAI library
    const { GoogleGenAI } = require('@google/genai');
    
    // Initialize the API client
    const genAI = new GoogleGenAI(GEMINI_API_KEY);
    
    // Create a conversation
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-thinking-exp-01-21" });
    
    // Prepare the prompt
    const prompt = `Инструкции для тебя: ${systemPrompt}. Отвечай по-русски, без представлений и упоминаний, что ты PLEXY от Plexy Lab. Просто давай информацию без вступлений.`;
    
    // Prepare the chat
    const chat = model.startChat({
      history: userState.conversationHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
      })).slice(-5)
    });
    
    // Generate content
    const result = await chat.sendMessage(Array.isArray(userPrompt) 
      ? [{ text: prompt }, ...userPrompt]
      : [{ text: prompt }, { text: userPrompt }]
    );
    
    // Extract the response text
    let content = result.response.text();
    
    // Add to conversation history if required
    if (addToHistory) {
      // Add user prompt to history
      if (typeof userPrompt === 'string') {
        userState.conversationHistory.push({
          role: 'user',
          content: userPrompt
        });
      }
      
      // Add bot response to history
      userState.conversationHistory.push({
        role: 'model',
        content: content
      });
      
      // Limit history length
      if (userState.conversationHistory.length > 10) {
        userState.conversationHistory = userState.conversationHistory.slice(-10);
      }
    }
    
    // Process the text to handle formatting
    content = content.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");  // Bold
    content = content.replace(/\*(.*?)\*/g, "<i>$1</i>");      // Italic
    content = content.replace(/__(.*?)__/g, "<u>$1</u>");      // Underline
    content = content.replace(/```(.*?)```/gs, "<pre>$1</pre>"); // Code blocks
    content = content.replace(/`(.*?)`/g, "<code>$1</code>");  // Inline code
    content = content.replace(/#{1,6} (.*?)(?:\n|$)/g, "<b>$1</b>\n"); // Headers
    
    // Remove any ID references
    content = content.replace(/\b[iI][dD][ _]?\d+\b/g, '');
    content = content.replace(/\bс ID.*?\b/g, '');
    content = content.replace(/\bс идентификатором.*?\b/g, '');
    
    // Remove self-introductions
    content = content.replace(/Здравствуйте!?\s*(Я)?\s*PLEXY[,\s]+(эксперт|помощник|бот|специалист).*Plexy Lab[.,]?/gi, '');
    content = content.replace(/PLEXY[,\s]+(эксперт|помощник|бот|специалист).*Plexy Lab[,.]?/gi, '');
    content = content.replace(/Я\s*—\s*PLEXY[,\s]+(эксперт|помощник|бот|специалист).*Plexy Lab[.,]?/gi, '');
    
    return content;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Произошла ошибка при получении ответа. Пожалуйста, попробуйте позже.";
  }
}

// Set up middleware
bot.use(session());

// Register commands
bot.command('start', startCommand);
bot.command('help', helpCommand);

// Create inline keyboards
const createPlantActionKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🌿 Советы по уходу', 'care'),
      Markup.button.callback('❗ Проблемы', 'problems')
    ],
    [
      Markup.button.callback('💊 Витамины', 'vitamins'),
      Markup.button.callback('🌍 Происхождение', 'origin')
    ],
    [
      Markup.button.callback('💧 Полив', 'watering'),
      Markup.button.callback('☀️ Освещение', 'light')
    ],
    [
      Markup.button.callback('🌡️ Температура', 'temp'),
      Markup.button.callback('📚 Подробнее', 'info')
    ]
  ]);
};

// Main menu keyboard
const mainMenuKeyboard = () => {
  return Markup.keyboard([
    ['🌱 Определить растение', '🔍 Проблема с растением'],
    ['💊 Витамины и питание', '❓ Задать вопрос'],
    ['ℹ️ Помощь', '📝 Оставить отзыв']
  ]).resize();
};

// Register modules
bot.use(vitaminsModule);
bot.use(plantsModule);
bot.use(plantIdentificationModule);

// Handle menu button clicks
bot.hears('🌱 Определить растение', (ctx) => {
  const userState = getUserState(ctx.from!.id);
  userState.currentState = 'waiting_for_photo';
  
  ctx.reply(
    'Отправьте фото растения, которое хотите определить',
    Markup.keyboard([['« Назад']]).resize()
  );
});

bot.hears('🔍 Проблема с растением', (ctx) => {
  const userState = getUserState(ctx.from!.id);
  userState.currentState = 'waiting_for_problem_description';
  
  ctx.reply(
    'Отправьте фото растения с проблемой и напишите краткое описание проблемы в подписи к фото',
    Markup.keyboard([['« Назад']]).resize()
  );
});

bot.hears('💊 Витамины и питание', (ctx) => {
  ctx.reply(
    'Раздел о витаминах и питании',
    Markup.keyboard([
      ['💊 Информация о витаминах', '🥗 Здоровое питание'],
      ['🩺 Симптомы авитаминоза', '💡 Советы по питанию'],
      ['« Главное меню']
    ]).resize()
  );
});

bot.hears('❓ Задать вопрос', (ctx) => {
  const userState = getUserState(ctx.from!.id);
  userState.currentState = 'waiting_for_question';
  
  ctx.reply(
    'Задайте ваш вопрос о растениях, витаминах или питании',
    Markup.keyboard([['« Назад']]).resize()
  );
});

bot.hears('ℹ️ Помощь', helpCommand);

bot.hears('📝 Оставить отзыв', (ctx) => {
  const userState = getUserState(ctx.from!.id);
  userState.currentState = 'waiting_for_feedback';
  
  ctx.reply(
    'Пожалуйста, напишите ваш отзыв или предложение по улучшению бота',
    Markup.keyboard([['« Назад']]).resize()
  );
});

bot.hears('« Назад', (ctx) => {
  const userState = getUserState(ctx.from!.id);
  userState.currentState = null;
  
  ctx.reply(
    'Главное меню',
    mainMenuKeyboard()
  );
});

bot.hears('« Главное меню', (ctx) => {
  const userState = getUserState(ctx.from!.id);
  userState.currentState = null;
  
  ctx.reply(
    'Главное меню',
    mainMenuKeyboard()
  );
});

// Handle vitamins and nutrition button clicks
bot.hears('💊 Информация о витаминах', async (ctx) => {
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  const processingMessage = await ctx.reply('Подготовка информации о витаминах...');
  
  const systemPrompt = 'Предоставь краткую, но полную информацию о витаминах, их функциях в организме, суточной потребности и в каких продуктах они содержатся. Составь список основных витаминов (A, группа B, C, D, E, K) с кратким описанием.';
  
  const response = await callGeminiAPI(userState, systemPrompt, 'Расскажи о витаминах, их функциях и пользе');
  
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    processingMessage.message_id,
    undefined,
    response,
    { parse_mode: 'HTML' }
  );
});

bot.hears('🥗 Здоровое питание', async (ctx) => {
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  const processingMessage = await ctx.reply('Подготовка информации о здоровом питании...');
  
  const systemPrompt = 'Предоставь информацию о принципах здорового питания, балансе питательных веществ, режиме питания и полезных привычках. Добавь примеры здоровых блюд.';
  
  const response = await callGeminiAPI(userState, systemPrompt, 'Расскажи о принципах здорового питания');
  
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    processingMessage.message_id,
    undefined,
    response,
    { parse_mode: 'HTML' }
  );
});

bot.hears('🩺 Симптомы авитаминоза', async (ctx) => {
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  const processingMessage = await ctx.reply('Подготовка информации о симптомах авитаминоза...');
  
  const systemPrompt = 'Опиши основные симптомы нехватки различных витаминов и минералов в организме, на какие признаки стоит обратить внимание и как восполнить дефицит естественным путем.';
  
  const response = await callGeminiAPI(userState, systemPrompt, 'Расскажи о симптомах авитаминоза');
  
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    processingMessage.message_id,
    undefined,
    response,
    { parse_mode: 'HTML' }
  );
});

bot.hears('💡 Советы по питанию', async (ctx) => {
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  const processingMessage = await ctx.reply('Подготовка советов по питанию...');
  
  const systemPrompt = 'Дай практические советы по улучшению рациона питания, которые легко внедрить в повседневную жизнь. Предложи список полезных перекусов, способы приготовления здоровой пищи и как сделать питание более сбалансированным.';
  
  const response = await callGeminiAPI(userState, systemPrompt, 'Дай практические советы по улучшению питания');
  
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    processingMessage.message_id,
    undefined,
    response,
    { parse_mode: 'HTML' }
  );
});

// Handle callback queries from inline buttons
bot.action('care', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Советы по уходу за растением:');
  
  const systemPrompt = 'Дай краткие и полезные советы по уходу за растением (полив, освещение, температура, влажность, грунт и подкормка). Используй четкие формулировки. Ответ должен быть кратким и структурированным. Не представляйся и не упоминай Plexy или Plexy Lab.';
  
  let userPrompt = 'Дай советы по уходу за растением';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Дай конкретные советы по уходу за растением ${userState.lastIdentifiedPlant}, основываясь на особенностях именно этого вида`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('problems', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Типичные проблемы растения:');
  
  const systemPrompt = 'Опиши 3-5 наиболее распространенных проблем с этим растением, их признаки и способы решения. Используй четкие формулировки. Не представляйся и не упоминай Plexy или Plexy Lab.';
  
  let userPrompt = 'Опиши типичные проблемы растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Опиши типичные проблемы именно для ${userState.lastIdentifiedPlant}, с чем часто сталкиваются владельцы этого конкретного вида`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('vitamins', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Необходимые витамины и микроэлементы:');
  
  const systemPrompt = 'Ты — PLEXY, эксперт по растениям от Plexy Lab. Расскажи о необходимых для этого растения витаминах и микроэлементах. Укажи признаки их недостатка и способы подкормки, включая использование бытовых отходов.';
  
  let userPrompt = 'Расскажи о необходимых витаминах и микроэлементах для растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о необходимых витаминах и микроэлементах для растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('origin', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Происхождение и история растения:');
  
  const systemPrompt = 'Ты — PLEXY, эксперт по растениям от Plexy Lab. Расскажи об истории, происхождении и распространении этого растения. Включи интересные факты о том, откуда оно родом и как попало в комнатную культуру.';
  
  let userPrompt = 'Расскажи о происхождении и истории растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о происхождении и истории растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('watering', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Рекомендации по поливу:');
  
  const systemPrompt = 'Ты — PLEXY, эксперт по растениям от Plexy Lab. Дай детальные рекомендации по поливу этого растения: частота, количество воды, особенности в разные сезоны, признаки недостатка и переизбытка влаги.';
  
  let userPrompt = 'Дай подробные рекомендации по поливу растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Дай подробные рекомендации по поливу растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('light', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Требования к освещению:');
  
  const systemPrompt = 'Ты — PLEXY, эксперт по растениям от Plexy Lab. Опиши требования к освещению для этого растения: интенсивность света, расположение относительно окон, потребность в защите от прямых лучей, признаки недостатка и избытка света.';
  
  let userPrompt = 'Расскажи о требованиях к освещению для растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о требованиях к освещению для растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('temp', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Температурный режим:');
  
  const systemPrompt = 'Ты — PLEXY, эксперт по растениям от Plexy Lab. Расскажи о температурном режиме для этого растения: оптимальная температура днем и ночью, минимальная допустимая температура, отношение к сквознякам и перепадам температур.';
  
  let userPrompt = 'Расскажи о температурном режиме для растения';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи о температурном режиме для растения ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

bot.action('info', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const userState = getUserState(userId);
  
  await ctx.reply('Подробная информация о растении:');
  
  const systemPrompt = 'Ты — PLEXY, эксперт по растениям от Plexy Lab. Предоставь подробную информацию о растении: его особенности, интересные факты, сложность ухода и практическое применение.';
  
  let userPrompt = 'Расскажи подробно о растении';
  if (userState.lastIdentifiedPlant) {
    userPrompt = `Расскажи подробно о растении ${userState.lastIdentifiedPlant}`;
  }
  
  const response = await callGeminiAPI(userState, systemPrompt, userPrompt);
  await ctx.reply(response, { parse_mode: 'HTML' });
});

// Handle text messages with AI
bot.on('text', async (ctx) => {
  try {
    const userMessage = ctx.message.text;
    const userId = ctx.from!.id;
    const userState = getUserState(userId);
    
    // Skip processing for button responses and commands
    const buttonResponses = [
      '🌱 Определить растение', '🔍 Проблема с растением',
      '💊 Витамины и питание', '❓ Задать вопрос',
      'ℹ️ Помощь', '📝 Оставить отзыв',
      '« Назад', '« Главное меню',
      '💊 Информация о витаминах', '🥗 Здоровое питание',
      '🩺 Симптомы авитаминоза', '💡 Советы по питанию'
    ];
    
    if (buttonResponses.includes(userMessage) || userMessage.startsWith('/')) {
      return;
    }
    
    // Handle feedback
    if (userState.currentState === 'waiting_for_feedback') {
      await ctx.reply('Спасибо за ваш отзыв! Мы обязательно учтем ваше мнение.');
      
      // Return to main menu
      userState.currentState = null;
      return await ctx.reply('Главное меню', mainMenuKeyboard());
    }
    
    // Handle identity questions directly
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
    
    // Notify user that we're processing their request
    const processingMessage = await ctx.reply('Обрабатываю ваш запрос...');
    
    // Store the last message
    userState.lastMessage = userMessage;
    userState.messageCount++;
    
    // Call Gemini API
    const systemPrompt = 'Ты — эксперт по витаминам, минералам и уходу за растениями. ' +
                         'Ты предоставляешь информацию о функциях витаминов в организме, признаках дефицита и передозировки, ' +
                         'а также о том, как ухаживать за комнатными растениями с использованием бытовых отходов. ' +
                         'Твои ответы должны быть информативными, но краткими. ' +
                         'Если запрос не связан с этими темами, вежливо скажи, что можешь помочь только с вопросами о витаминах и уходе за растениями.';
                         
    const response = await callGeminiAPI(userState, systemPrompt, userMessage);
    
    // Edit the processing message with the AI response
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
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

// Handle photo messages
bot.on('photo', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const userState = getUserState(userId);
    const isPlantProblem = userState.currentState === 'waiting_for_problem_description';
    
    // Send processing message
    const processingMessage = await ctx.reply('Анализирую изображение...');
    
    // Get the photo file ID (highest quality)
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    
    // Get file path from Telegram
    const fileLink = await ctx.telegram.getFileLink(photoId);
    
    // Download the image
    const imageResponse = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    
    // Save the image temporarily
    const imagePath = path.join(tempDir, `${photoId}.jpg`);
    fs.writeFileSync(imagePath, imageBuffer);
    
    // Store the image URL in user state
    userState.lastImageUrl = fileLink.href;
    
    // Convert image to base64
    const base64Image = imageBuffer.toString('base64');
    userState.lastImageBase64 = base64Image;
    
    // Get caption if any
    const caption = ctx.message.caption || '';
    let systemPrompt = '';
    
    if (isPlantProblem || caption.toLowerCase().includes('проблема') || caption.toLowerCase().includes('болезнь') || caption.toLowerCase().includes('вредитель')) {
      systemPrompt = 'Определи растение на фото и опиши возможные проблемы, которые видны (пожелтение листьев, пятна, вредители и т.д.). Предложи методы решения с использованием натуральных средств и бытовых отходов. Если на фото нет растения или проблем не видно, вежливо сообщи об этом. Не представляйся и не упоминай Plexy или Plexy Lab. Не используй фразы приветствия.';
    } else {
      systemPrompt = 'Определи растение на фото, предоставь его научное и обиходное название. Опиши основные характеристики растения, условия ухода (полив, освещение, почва), и какие удобрения и витамины ему необходимы. Если на фото нет растения, вежливо сообщи об этом. Не представляйся и не упоминай Plexy или Plexy Lab. Не используй фразы приветствия.';
    }
    
    // Call Gemini API for image analysis
    try {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA3WOrYYhw6FnePJX3EANcmwH6OvkZW9IE";
      
      // Import required libraries
      const { GoogleGenAI } = require('@google/genai');
      const mime = require('mime');
      
      // Initialize the API client
      const genAI = new GoogleGenAI(GEMINI_API_KEY);
      
      // Get the generative model
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-thinking-exp-01-21" });
      
      // Create the prompt parts with the image
      const imageParts = [
        {
          text: `Инструкции для тебя: ${systemPrompt}. Отвечай по-русски, без вступлений, приветствий и представлений. Давай содержательную информацию сразу. Четко укажи научное и обиходное название растения в начале ответа.`
        },
        {
          text: caption || 'Определи это растение и расскажи о нем'
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image
          }
        }
      ];
      
      // Generate content
      const result = await model.generateContent({
        contents: [{ role: "user", parts: imageParts }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      });
      
      // Get the response
      const response = result.response;
      let content = response.text();
      
      // Clean up the content first to remove formatting that might interfere with extraction
      let cleanContent = content
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}/g, '')
        .replace(/`/g, '');
      
      // Extract plant name more aggressively with different patterns
      const namePatterns = [
        /(?:Научное название|Научное наименование|Латинское название|Латинское наименование):\s*([^\.,:;\n]+)/i,
        /(?:Название|Наименование|Растение называется):\s*([^\.,:;\n]+)/i,
        /(?:На фотографии|На фото)[^\.]*?(?:растение|цветок)\s+([^\.,:;\n]+)/i,
        /(?:растение|это)\s+([^\.,:;\n]+)/i
      ];
      
      let plantName = null;
      for (const pattern of namePatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
          plantName = match[1].trim();
          if (plantName) break;
        }
      }
      
      if (plantName) {
        // Clean the plant name from any remaining markdown or extra characters
        plantName = plantName
          .replace(/^\s+|\s+$/g, '')         // Trim whitespace
          .replace(/[*_#`]/g, '')            // Remove markdown chars
          .replace(/\(.*?\)/g, '')           // Remove content in parentheses
          .replace(/\s{2,}/g, ' ')           // Replace multiple spaces with single space
          .trim();
        
        userState.lastIdentifiedPlant = plantName;
        console.log("Identified plant:", plantName);
      }
      
      // Process the text to handle formatting
      content = content.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");  // Bold
      content = content.replace(/\*(.*?)\*/g, "<i>$1</i>");      // Italic
      content = content.replace(/__(.*?)__/g, "<u>$1</u>");      // Underline
      content = content.replace(/```(.*?)```/gs, "<pre>$1</pre>"); // Code blocks
      content = content.replace(/`(.*?)`/g, "<code>$1</code>");  // Inline code
      content = content.replace(/#{1,6} (.*?)(?:\n|$)/g, "<b>$1</b>\n"); // Headers
      
      // Remove any ID references
      content = content.replace(/\b[iI][dD][ _]?\d+\b/g, '');
      content = content.replace(/\bс ID.*?\b/g, '');
      content = content.replace(/\bс идентификатором.*?\b/g, '');
      
      // Remove all self-introductions and mentions of PLEXY or Plexy Lab
      content = content.replace(/(?:Здравствуйте|Привет|Добрый день)[!,.]?\s*/gi, '');
      content = content.replace(/(?:Я|это)?\s*PLEXY[,\s]+(эксперт|помощник|бот|специалист)[^\.]*?(?:Plexy Lab|PlexiLab)[.,]?\s*/gi, '');
      content = content.replace(/Я\s*—\s*PLEXY[,\s][^\.]*?(?:Plexy Lab|PlexiLab)[.,]?\s*/gi, '');
      content = content.replace(/Я\s*—\s*(?:большая языковая модель|модель|нейросеть)[^\.]*?(?:Google|OpenAI|Anthropic)[.,]?\s*/gi, '');
      content = content.replace(/Я\s*(?:был[а]?|являюсь)[^\.]*?(?:разработан|создан|обучен)[^\.]*?(?:Google|OpenAI|Anthropic)[.,]?\s*/gi, '');
      
      // Edit the processing message with the AI response
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMessage.message_id,
        undefined,
        content,
        { parse_mode: 'HTML' }
      );
      
      // Add to conversation history
      userState.conversationHistory.push({
        role: 'user',
        content: caption || 'Определи это растение и расскажи о нем'
      });
      
      userState.conversationHistory.push({
        role: 'model',
        content: content
      });
      
      // Ask if the user wants to know more with inline keyboard
      await ctx.reply(
        'Что вы хотите узнать еще?',
        createPlantActionKeyboard()
      );
      
    } catch (error) {
      console.error('Error processing image with Gemini:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMessage.message_id,
        undefined,
        'Извините, не удалось проанализировать изображение. Пожалуйста, попробуйте еще раз с более четким фото.'
      );
    }
    
    // Clean up temporary file
    fs.unlinkSync(imagePath);
  } catch (error) {
    console.error('Error processing photo:', error);
    await ctx.reply('Произошла ошибка при обработке изображения. Пожалуйста, попробуйте позже.');
  }
});

// Start bot
if (DEVELOPMENT) {
  // Development mode - use polling
  bot.launch()
    .then(() => {
      console.log('Bot is running in development mode (polling)');
    })
    .catch((err) => {
      console.error('Error starting bot:', err);
    });
} else {
  // Production mode - use webhook
  const app = express();
  
  // Set the bot API endpoint
  app.use(bot.webhookCallback('/api/webhook'));
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
  });
  
  app.get('/', (req, res) => {
    res.status(200).send('Telegram Bot is running. Send POST requests to /api/webhook.');
  });
  
  // Set webhook
  bot.telegram.setWebhook(WEBHOOK_URL)
    .then(() => {
      console.log(`Webhook set to ${WEBHOOK_URL}`);
      
      // Start Express server for local testing (not needed on Vercel)
      if (process.env.START_SERVER === 'true') {
        app.listen(PORT, () => {
          console.log(`Express server is listening on ${PORT}`);
        });
      }
    })
    .catch(err => {
      console.error('Error setting webhook:', err);
    });
    
  // Export express app for Vercel
  module.exports = app;
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 