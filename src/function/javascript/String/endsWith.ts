export default {
  name: "$endsWith",
  callback: async (ctx, event, database, error) => {
    ctx.argsCheck(2, error, "$endsWith");
    const args = await ctx.getEvaluateArgs();
    return `${args[0]}`.endsWith(args[1]);
  },
};
