import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import connectDb from "./src/config/db.js";
import User from "./src/models/User.js";
import Event from "./src/models/Event.js";
import OpenAI from "openai";


// Configuring telegraf for telegram.
const bot = new Telegraf(process.env.BOT_TOKEN);


// Configuring OpenAI api.
const openai = new OpenAI({
    apiKey: process.env['OPENAI_KEY'], // This is the default and can be omitted
});


// Connecting mongodb
try {
    connectDb();
    console.log("Database connected successfully.")
} catch (err) {
    console.log(err);
    process.kill(process.pid, "SIGTERM");
}


bot.start(async (ctx) => {
    const from = ctx.update.message.from;

    console.log('from', from);

    try {
        await User.findOneAndUpdate({ tgId: from.id }, {
            $setOnInsert: {
                firstName: from.first_name,
                lastName: from.last_name,
                isBot: from.is_bot,
                username: from.username
            }
        }, {
            upsert: true,
            new: true
        })

        // Store the user information into database.
        await ctx.reply(`Hey! ${from.first_name}, Welcome. I will be writing highly engaging social media post for you. Just keep feeding me with the events throught the day. Let's shine on social media.`);

    }
    catch (err) {
        console.log(err);

        await ctx.reply("Facing difficulties!");
    }

})


bot.help((ctx) => {
    ctx.reply('For support contact @aniruddhsinghindia@gmail.com')
})


bot.command('generate', async (ctx) => {

    const from = ctx.update.message.from;

    const { message_id: waitingMessageId } = await ctx.reply(`Hey! ${from.first_name}, kindly wait for a moment. I am curating posts for you.`)

    const { message_id: loadingStickerMsgId } = await ctx.replyWithSticker('CAACAgIAAxkBAAMlZiTs435hKJ0MLTnd6h0WPevz2hMAAgEBAAJWnb0KIr6fDrjC5jQ0BA');

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const events = await Event.find({
        tgId: from.id,
        createdAt: {
            $gte: startOfDay,
            $lte: endOfDay,
        }
    })

    if (events.length === 0) {
        await ctx.deleteMessage(waitingMessageId);
        await ctx.deleteMessage(loadingStickerMsgId);
        await ctx.reply("No events for the day.");
        return;
    }
    console.log('events', events);


    // Make openai api call.
    try {
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Act as a senior copywriter, you write highly engaging posts for linkedin, facebook and twitter using provided thoughts/events throught the day.'
                },
                {
                    role: 'user',
                    content: `Write like a human, for humans. Craft three engaging socail media posts tailored for LinkedIn, Facebook and Twitter audiences. Use Simple language. Use given time labels just to understand the order of the event, don't mention the time in the posts. Each post should creatively highlight the following events. Ensure the tone is conversational and impactful. Focus on engaging the respective platform's audience, encouraging interaction, and driving interest in the events: ${events.map((event) => event.text).join(', ')}`
                },
            ],
            model: process.env.OPENAI_MODEL,
        })
        console.log('completion: ', chatCompletion);


        // Share token count.
        await User.findOneAndUpdate({
            tgId: from.id,
        }, {
            $inc: {
                promptTokens: chatCompletion.usage.prompt_tokens,
                completionTokens: chatCompletion.usage.completion_tokens
            }
        })

        await ctx.deleteMessage(waitingMessageId);
        await ctx.deleteMessage(loadingStickerMsgId);
        await ctx.reply(chatCompletion.choices[0].message.content);

    } catch (err) {
        console.log(err)
        ctx.reply(err);
        await ctx.reply("Facing difficulties...");
    }

})


bot.command('newchat', async (ctx) => {

    const from = ctx.update.message.from;

    try {

        await Event.deleteMany({
            tgId: from.id,
        })

        await ctx.reply("Now you can send new messages to create copyright for new post.");

    } catch (err) {
        console.log(err);
        await ctx.reply("Failed to create new conversation.");
    }
})


bot.on(message('text'), async (ctx) => {
    const from = ctx.update.message.from;

    const message = ctx.update.message.text;

    try {

        await Event.create({
            text: message,
            tgId: from.id,
        });

        await ctx.reply("Noted, Keep texting me your thoughts. To generate the posts, just enter the command: /generate");

    } catch (err) {
        console.log(err);
        await ctx.reply('Facing difficulties, please try again later.');
    }

});


bot.launch();


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))