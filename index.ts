import { channel } from 'diagnostics_channel';
import {
  Client,
  GuildEmojiManager,
  Message,
  MessageEmbed,
  ReactionCollector,
  TextChannel,
  User,
} from 'discord.js';
import { readFileSync, promises as fs } from 'fs';

type AmongMessage = { channelId: string; messageId: string; expires: number };
let watchingMessages: Array<AmongMessage> = [];

const amongUsColors = [
  'red',
  'black',
  'white',
  'rose',
  'blue',
  'cyan',
  'yellow',
  'pink',
  'purple',
  'orange',
  'banana',
  'coral',
  'lime',
  'green',
  'gray',
  'maroon',
  'brown',
  'tan',
];
const auEmojiNameSet = new Set(amongUsColors.map((x) => 'au' + x));

const client = new Client();
const {botId, token}  = JSON.parse(readFileSync('./config.json'));

const updateMessage = async (
  msg: Message,
  collector: ReactionCollector,
  expireTime: number,
  timeAfter: boolean
) => {
  if (msg.channel.type !== 'text') return;

  const emojis = await msg.channel.guild.emojis.cache.array();

  let caller = '';
  let closed: undefined | 'canceld' | 'expired' = undefined;
  let limit = '-';
  let minMembers = 9;
  let maxMembers = 10;
  let title = '-';
  let joinedMembers: Array<{ color: string; uid: string }> = [];
  let thinkingMembers: Array<string> = [];
  if (0 < msg.embeds.length) {
    if (msg.embeds[0].title) {
      title = msg.embeds[0].title;
    }

    const { fields } = msg.embeds[0];
    const statusField = fields.find((e) => e.name === 'ステータス');
    if (statusField && statusField.value.startsWith('クローズ')) {
      return;
    }

    const callerField = fields.find((e) => e.name === '募集者');
    if (callerField) {
      const matched = callerField.value.match(/^<@(\d+)>/);
      if (matched) {
        caller = matched[1];
      }
    }

    const limitField = fields.find((e) => e.name === '募集締切');
    if (limitField) {
      limit = limitField.value;
    }
    const membersField = fields.find((e) => e.name === '募集人数');
    if (membersField) {
      const matched1 = membersField.value.match(/^(\d+)名〜(\d+)名$/);
      const matched2 = membersField.value.match(/^(\d+)名$/);
      if (matched1) {
        const [n1, n2] = [parseInt(matched1[1], 10), parseInt(matched1[2], 10)];
        minMembers = Math.min(n1, n2);
        maxMembers = Math.max(n1, n2);
      } else if (matched2) {
        minMembers = maxMembers = parseInt(matched2[1], 10);
      }
    }
    const joinersField = fields.find((e) => e.name.startsWith('参加者'));
    if (joinersField) {
      for (const str of joinersField.value.split('\n')) {
        const matched = str.match(/<:au([a-z]+):\d+> <@(\d+)>/);
        if (matched) {
          joinedMembers.push({ color: matched[1], uid: matched[2] });
        }
      }
    }
    const thinkingField = fields.find((e) => e.name.startsWith('検討中'));
    if (thinkingField) {
      for (const str of thinkingField.value.split('\n')) {
        const matched = str.match(/<@(\d+)>/);
        if (matched) {
          thinkingMembers.push(matched[1]);
        }
      }
    }
  }
  const randomColorUsers: Array<string> = [];

  for (const unknownReaction of msg.reactions.cache
    .array()
    .filter(
      (x) => x.emoji.name !== '❌' && x.emoji.name !== '❓' && !auEmojiNameSet.has(x.emoji.name)
    )) {
    await unknownReaction.remove();
  }

  for (const reaction of msg.reactions.cache.array().filter((_) => _.count && _.count >= 2)) {
    await reaction.users.fetch();
    const users = reaction.users.cache.array();
    if (users.find((user) => user.id === botId) === undefined) {
      await reaction.remove();
      continue;
    }
    switch (reaction.emoji.name) {
      case '❌':
        for (const user of users.filter((u) => u.id !== botId)) {
          const found = joinedMembers.find((member) => member.uid === user.id);
          if (found) {
            joinedMembers = joinedMembers.filter((member) => member.uid !== user.id);
            for (const emoji of emojis.filter((e) => e.name === `au${found.color}`)) {
              await msg.react(emoji);
            }
          } else if (user.id === caller) {
            closed = 'canceld';
          }

          thinkingMembers = thinkingMembers.filter((memberId) => memberId !== user.id);
          await reaction.users.remove(user);
        }
        break;
      case '❓':
        for (const user of users.filter((u) => u.id !== botId)) {
          const found = joinedMembers.find((member) => member.uid === user.id);
          if (found) {
            joinedMembers = joinedMembers.filter((member) => member.uid !== user.id);
            for (const emoji of emojis.filter((e) => e.name === `au${found.color}`)) {
              await msg.react(emoji);
            }
          }
          if (!thinkingMembers.includes(user.id)) {
            thinkingMembers.push(user.id);
          }
          await reaction.users.remove(user);
        }
        break;
      default:
        if (auEmojiNameSet.has(reaction.emoji.name)) {
          const auColor = reaction.emoji.name.substring(2);
          for (const user of users.filter((u) => u.id !== botId)) {
            const found = joinedMembers.find((member) => member.uid === user.id);
            if (found) {
              joinedMembers = joinedMembers.filter((member) => member.uid !== user.id);
              for (const emoji of emojis.filter((e) => e.name === `au${found.color}`)) {
                await msg.react(emoji);
              }
            }
            if (
              joinedMembers.find((x) => x.color === auColor) ||
              maxMembers <= joinedMembers.length
            ) {
              randomColorUsers.push(user.id);
            } else {
              joinedMembers.push({ color: auColor, uid: user.id });
            }
            thinkingMembers = thinkingMembers.filter((memberId) => memberId !== user.id);
          }
          await reaction.remove();
        }
        break;
    }
    if (randomColorUsers.length > 0) {
      const availableColors = amongUsColors.filter(
        (color) => joinedMembers.find((m) => m.color === color) === undefined
      );
      while (
        availableColors.length > 0 &&
        randomColorUsers.length > 0 &&
        joinedMembers.length < maxMembers
      ) {
        const availableColor = availableColors.pop() as string;
        const randomUser = randomColorUsers.pop() as string;
        joinedMembers.push({ color: availableColor, uid: randomUser });
      }
      if (randomColorUsers.length > 0) {
        thinkingMembers = thinkingMembers.concat(randomColorUsers);
      }
    }
  }

  const joinedMembersField =
    joinedMembers.length === 0
      ? '-'
      : joinedMembers
          .map(({ color, uid }, i) => {
            const emoji = emojis.find((x) => x.name === `au${color}`);
            if (emoji) {
              return `<:${emoji.name}:${emoji.id}> <@${uid}>`;
            } else {
              return `<:au${color}:0000000000> <@${uid}>`;
            }
          })
          .join('\n');
  const thinkingMembersField =
    thinkingMembers.length === 0 ? '-' : thinkingMembers.map((uid, i) => `<@${uid}>`).join('\n');

  if (expireTime <= new Date().getTime()) {
    closed = 'expired';
  }

  const color = closed ? 0x000000 : minMembers <= joinedMembers.length ? 0x0000ff : 0x00ff00;
  let statusMsg = '';
  switch (closed) {
    case 'canceld':
      statusMsg = 'クローズ（募集者が中止した）';
      break;
    case 'expired':
      if (joinedMembers.length < minMembers) {
        statusMsg = 'クローズ（参加者不足により中止）';
      } else {
        statusMsg = 'クローズ（メンバー確定）';
      }
      break;
    default:
      if (joinedMembers.length < minMembers) statusMsg = '募集中（人数不足）';
      else if (maxMembers <= joinedMembers.length) statusMsg = '募集中（満員）';
      else statusMsg = '募集中';
      break;
  }

  await msg.edit(
    msg.content,
    new MessageEmbed()
      .setTitle(title)
      .setColor(color)
      .addField('募集者', `<@${caller}>`, true)
      .addField(
        '募集人数',
        minMembers === maxMembers ? `${minMembers}名` : `${minMembers}名〜${maxMembers}名`,
        true
      )
      .addField('募集締切', limit, true)
      .addField('ステータス', statusMsg, false)
      .addField(`参加者(${joinedMembers.length}名)`, joinedMembersField, true)
      .addField(`検討中(${thinkingMembers.length}名)`, thinkingMembersField, true)
  );
  if (closed !== undefined) {
    await msg.reactions.removeAll();
    collector.stop();
    watchingMessages = watchingMessages.filter(
      (x) => x.messageId !== msg.id || x.channelId !== msg.channel.id
    );
    await fs.writeFile('./among.json', JSON.stringify(watchingMessages));

    const userManager = msg.client.users;

    switch (closed) {
      case 'canceld':
        statusMsg = 'クローズ（募集者が中止した）';
        for (const uid of [caller, ...joinedMembers.map((x) => x.uid), ...thinkingMembers]) {
          try {
            const user = userManager.cache.get(uid) || (await userManager.fetch(uid));
            await user.send(`「${title}」の募集は募集者によって中止されました\n${msg.url}`);
          } catch (e) {
            console.error(e);
          }
        }
        break;
      case 'expired':
        if (joinedMembers.length < minMembers) {
          for (const uid of [...joinedMembers.map((x) => x.uid), ...thinkingMembers]) {
            try {
              const user = userManager.cache.get(uid) || (await userManager.fetch(uid));
              await user.send(`「${title}」の募集はメンバー不足により中止になりました\n${msg.url}`);
            } catch (e) {
              console.error(e);
            }
          }
        } else {
          for (const uid of [...joinedMembers.map((x) => x.uid)]) {
            try {
              const user = userManager.cache.get(uid) || (await userManager.fetch(uid));
              await user.send(`「${title}」の開催が確定しました\n${msg.url}`);
            } catch (e) {
              console.error(e);
            }
          }
          for (const uid of [...thinkingMembers]) {
            try {
              const user = userManager.cache.get(uid) || (await userManager.fetch(uid));
              await user.send(`検討中で出していた「${title}」の開催が確定しました\n${msg.url}`);
            } catch (e) {
              console.error(e);
            }
          }
        }
        break;
      default:
        if (joinedMembers.length < minMembers) statusMsg = '募集中';
        else statusMsg = '募集中（現在満員）';
        break;
    }
  } else if (timeAfter) {
    setTimeout(async () => {
      let fetched;
      try {
        fetched = await msg.channel.messages.fetch(msg.id);
      } catch (e) {
        console.error(e);
        collector.stop();
        watchingMessages = watchingMessages.filter(
          (x) => x.messageId !== msg.id || x.channelId !== msg.channel.id
        );
        await fs.writeFile('./among.json', JSON.stringify(watchingMessages));
      }
      if (fetched) {
        await updateMessage(fetched, collector, expireTime, true);
      }
    }, 10 * 60 * 1000);
  }
};

const postAmongCallMessage = async (
  channel: TextChannel,
  author: User,
  title: string,
  minMembers: number,
  maxMembers: number,
  expireDate: Date
) => {
  const message = await channel.send(
    new MessageEmbed()
      .setTitle(title)
      .setColor(0x00ff00)
      .addField('募集者', `<@${author.id}>`, true)
      .addField(
        '募集人数',
        minMembers === maxMembers ? `${minMembers}名` : `${minMembers}名〜${maxMembers}名`,
        true
      )
      .addField(
        '募集締切',
        '`' +
          `${expireDate.getFullYear()}/${
            expireDate.getMonth() + 1
          }/${expireDate.getDate()} ${expireDate.getHours()}:${expireDate.getMinutes()}` +
          '`',
        true
      )
      .addField('ステータス', '募集中', false)
      .addField('参加者', '-', true)
      .addField('検討中', '-', true)
  );
  const tmp = new Set(amongUsColors.map((n) => 'au' + n));

  await message.react('❓');
  await message.react('❌');
  for (const emoji of channel.guild.emojis.cache.array().filter((x) => tmp.has(x.name))) {
    await message.react(emoji);
  }
  watchingMessages.push({
    channelId: channel.id,
    messageId: message.id,
    expires: expireDate.getTime(),
  });
  await fs.writeFile('./among.json', JSON.stringify(watchingMessages));
  const collector = message.createReactionCollector((reaction, user) => user.id !== botId);
  collector.on('collect', () => updateMessage(message, collector, expireDate.getTime(), false));
  setTimeout(
    async () =>
      updateMessage(
        await message.channel.messages.fetch(message.id),
        collector,
        expireDate.getTime(),
        true
      ),
    10 * 60 * 1000
  );
  console.log(`Success Post: ${channel.guild.name} - ${channel.name} [${title}]`);
};

const installEmojis = async (emojis: GuildEmojiManager) => {
  const installedEmojiNames = emojis.cache.array().map((x) => x.name);

  for (const color of amongUsColors) {
    const name = `au${color}`;
    if (!installedEmojiNames.includes(name)) {
      await emojis.create(`./crew/${color}.png`, name);
    }
  }
};

(async () => {
  watchingMessages = JSON.parse((await fs.readFile('./among.json')).toString());

  client.on('ready', async () => {
    console.log('I am ready!');

    for (const a of watchingMessages) {
      const channel = await client.channels.fetch(a.channelId);
      if (!channel.isText()) return;
      try {
        const message = await channel.messages.fetch(a.messageId);
        const collector = message.createReactionCollector((reaction, user) => user.id !== botId);
        collector.on('collect', (r) => updateMessage(r.message, collector, a.expires, false));
        updateMessage(message, collector, a.expires, true);
      } catch (e) {
        console.error(`get error: ${a.channelId}, ${a.messageId}`);

        watchingMessages = watchingMessages.filter(
          (x) => x.messageId !== a.messageId || x.channelId !== a.channelId
        );
        await fs.writeFile('./among.json', JSON.stringify(watchingMessages));
      }
    }
  });

  client.on('message', async (message) => {
    if (message.channel.type !== 'text' || message.author.bot) {
      return;
    }

    if (message.content.includes('?amongus')) {
      try {
        await installEmojis(message.channel.guild.emojis);
        for (const line of message.content.split('\n')) {
          const matched = line.match(/^\?amongus\s*(.+)$/);
          if (!matched) {
            continue;
          }

          const calls = matched[1].split(/[,、]/);
          for (const call of calls) {
            // ?amongus 8/28 21:00 -12h 8-8 Ariship 特殊ルール
            const matched = call.match(
              /^\s*([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(\d+)-(\d+)\s+([^\s].*)\s*$/
            );
            if (!matched) {
              await message.reply(`エラー: 書式が異なります '${call}'`);
              continue;
            }
            const today = new Date();
            let openDate;
            {
              const dayStr = matched[1].match(/^(\d+)\/(\d+)$/);
              if (!dayStr) {
                await message.reply(`エラー: '${matched[1]}' は無効な日付表現です`);
                continue;
              }
              const [month, date] = [parseInt(dayStr[1], 10), parseInt(dayStr[2], 10)];

              const timeStr = matched[2].match(/^(\d+):(\d+)$/);
              if (!timeStr) {
                await message.reply(`エラー: '${matched[2]}' は無効な時間表現です`);
                continue;
              }
              const [hours, minutes] = [parseInt(timeStr[1], 10), parseInt(timeStr[2], 10)];
              openDate = new Date(today.getFullYear(), month - 1, date, hours, minutes, 0, 0);
              if (openDate.getTime() < today.getTime()) {
                openDate.setFullYear(today.getFullYear() + 1);
              }
            }
            let expireDate = new Date(openDate.getTime());
            {
              const diffStr = matched[3].match(/^-(\d+[dhm])*$/);
              if (!diffStr) {
                await message.reply(`エラー: '${matched[3]}' は無効な締切指定です`);
                continue;
              }
              for (const diff of matched[3].substring(1).split(/(?<=[hmd])/)) {
                const tmp = diff.match(/(\d+)([hmd])/);
                if (!tmp) {
                  continue;
                }
                const n = parseInt(tmp[1], 10);
                switch (tmp[2]) {
                  case 'd':
                    expireDate.setDate(expireDate.getDate() - n);
                    break;
                  case 'h':
                    expireDate.setHours(expireDate.getHours() - n);
                    break;
                  case 'm':
                    expireDate.setMinutes(expireDate.getMinutes() - n);
                    break;
                }
              }
              if (expireDate.getTime() <= today.getTime()) {
                await message.reply(`エラー: 募集締切が過去の日時です`);
                continue;
              }
            }

            await postAmongCallMessage(
              message.channel,
              message.author,
              `${openDate.getFullYear()}/${matched[1]} ${matched[2]}  ${matched[6].trim()}`,
              parseInt(matched[4], 10),
              parseInt(matched[5], 10),
              expireDate
            );
          }
        }
      } catch (e) {
        console.error(e);
        await message.channel.send('エラー');
      }
    }
  });

  client.login(token);
})();
