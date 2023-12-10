import ms from "ms";
import { formatTime, replaceData } from "../parser";

export default {
  name: "$globalCooldown",
  callback: async (ctx, event, database, error) => {
    ctx.argsCheck(2, error, "$globalCooldown");
    const args = await ctx.getEvaluateArgs();
    const userId = event.from?.id || event.message?.from.id;
    const commandName = ctx.fileName;
    const defaultTable = args[5] || database.table[0];
    ctx.checkArgumentTypes(args, error, ["string", "string"]);

    const cooldownKey = `${userId}_${commandName}_${ms(args[0])}`;
    const userCooldown = (await database.get(defaultTable, cooldownKey)) || 0;
    const cooldown = userCooldown + +ms(args[0]) - Date.now();
    if (cooldown > 0) {
      if (ctx.replyMessage)
        event.reply(replaceData(formatTime(cooldown).units, args[1]));
      else event.send(replaceData(formatTime(cooldown).units, args[1]));
      return true;
    } else {
      await database.set(defaultTable, cooldownKey, Date.now());
    }
  },
};
