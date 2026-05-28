const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const Video = mongoose.model('Video');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

let waitingFor = {};

bot.onText(/\/start/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, '❌ Not authorized');
  bot.sendMessage(msg.chat.id, `👋 Welcome Admin!\n\nCommands:\n/add - Add new video\n/delete - Delete a video\n/stats - View statistics\n/list - List all videos`);
});

bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const total = await Video.countDocuments();
  const views = await Video.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
  bot.sendMessage(msg.chat.id, `📊 Stats:\n🎬 Total Videos: ${total}\n👁 Total Views: ${views[0]?.total || 0}`);
});

bot.onText(/\/add/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  waitingFor[msg.chat.id] = { step: 'title' };
  bot.sendMessage(msg.chat.id, '📝 Send me the video *title*:', { parse_mode: 'Markdown' });
});

bot.onText(/\/list/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const videos = await Video.find().sort({ createdAt: -1 }).limit(10);
  if (videos.length === 0) return bot.sendMessage(msg.chat.id, 'No videos yet.');
  let text = '🎬 Last 10 videos:\n\n';
  videos.forEach((v, i) => {
    text += `${i + 1}. ${v.title}\nID: \`${v._id}\`\n\n`;
  });
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/delete/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  waitingFor[msg.chat.id] = { step: 'delete_id' };
  bot.sendMessage(msg.chat.id, '🗑 Send me the video *ID* to delete:\n(Use /list to find IDs)', { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== ADMIN_ID) return;
  if (!waitingFor[chatId] || msg.text?.startsWith('/')) return;

  const state = waitingFor[chatId];

  if (state.step === 'title') {
    waitingFor[chatId] = { step: 'iframe', title: msg.text };
    bot.sendMessage(chatId, '🔗 Now send the *iframe URL* (just the src link, not full iframe tag):', { parse_mode: 'Markdown' });
  } else if (state.step === 'iframe') {
    waitingFor[chatId] = { step: 'thumbnail', title: state.title, iframe: msg.text };
    bot.sendMessage(chatId, '🖼 Now send the *thumbnail image URL*:', { parse_mode: 'Markdown' });
 } else if (state.step === 'iframe') {
    let iframeUrl = msg.text;
    const srcMatch = msg.text.match(/src=["']([^"']+)["']/i);
    if (srcMatch) iframeUrl = srcMatch[1];
    waitingFor[chatId] = { step: 'thumbnail', title: state.title, iframe: iframeUrl };
    bot.sendMessage(chatId, '🖼 Now send the *thumbnail image URL*:', { parse_mode: 'Markdown' });
  } else if (state.step === 'delete_id') {
    try {
      await Video.findByIdAndDelete(msg.text.trim());
      delete waitingFor[chatId];
      bot.sendMessage(chatId, '✅ Video deleted!');
    } catch (e) {
      bot.sendMessage(chatId, '❌ Invalid ID. Try again.');
    }
  }
});

console.log('Bot is running...');
