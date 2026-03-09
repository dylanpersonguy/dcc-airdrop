import type { BotContext } from './middleware';
import type { InlineKeyboard } from 'grammy';

/**
 * Edit the current message if triggered by a callback query,
 * otherwise send a new reply. Falls back to reply if edit fails.
 */
export function editOrReply(
  ctx: BotContext,
  text: string,
  opts: { parse_mode?: string; reply_markup?: InlineKeyboard },
): Promise<unknown> {
  return ctx.callbackQuery
    ? ctx.editMessageText(text, opts as any).catch(() => ctx.reply(text, opts as any))
    : ctx.reply(text, opts as any);
}
