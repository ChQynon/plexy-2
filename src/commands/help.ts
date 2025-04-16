import { Context, Markup } from 'telegraf';

export const helpCommand = async (ctx: Context) => {
  const helpMessage = `
🌿 <b>PLEXY - Бот для определения растений и ухода за ними</b>

<b>Основные команды:</b>
/start - Запустить бота
/menu - Показать главное меню
/plant - Определить растение
/vitamins - Информация о витаминах
/help - Эта справка
/feedback - Оставить отзыв

<b>Что я умею:</b>
• Определять растения по фото
• Анализировать состояние растения
• Давать рекомендации по уходу
• Отвечать на вопросы о растениях
• Предоставлять информацию о витаминах

<b>Как пользоваться:</b>
1. Отправьте фото растения, чтобы получить информацию о нем
2. Выберите 'Проблема с растением' для анализа заболеваний
3. Используйте меню 'Витамины и питание' для получения информации о витаминах
4. Задавайте вопросы в свободной форме

Создан командой Plexy Lab 🔬
  `;
  
  await ctx.reply(
    helpMessage, 
    { 
      parse_mode: 'HTML',
      ...Markup.keyboard([
        ['🌱 Определить растение', '🔍 Проблема с растением'],
        ['💊 Витамины и питание', '❓ Задать вопрос'],
        ['ℹ️ Помощь', '📝 Оставить отзыв']
      ]).resize()
    }
  );
}; 