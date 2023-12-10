import { toParse } from "../parser";

export default {
  name: "$isObject",
  callback: async (ctx, event, database, error) => {
    ctx.argsCheck(1, error, "$isObject");
    const args = await ctx.getEvaluateArgs();

    return toParse(`${args[0]}`) === "object";
  },
};
