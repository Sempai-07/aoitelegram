export default {
  name: "$setVar",
  callback: async (ctx, event, database, error) => {
    ctx.argsCheck(2, error);
    const args = await ctx.getEvaluateArgs();
    const defaultTable = args[2] || database.table[0];

    if (!(await database.has(defaultTable, args[0]))) {
      error.errorVar(args[0], "$setVar");
      return;
    }

    if (!(await database.hasTable(defaultTable))) {
      error.errorTable(defaultTable, "$setVar");
      return;
    }

    await database.set(defaultTable, args[0], args[1]);
    return undefined;
  },
};