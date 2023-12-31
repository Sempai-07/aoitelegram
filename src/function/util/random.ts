export default {
  name: "$random",
  callback: (context) => {
    context.argsCheck(2);
    const [min, max, useCache = true] = context.splits;
    if (context.isError) return;

    const cacheKey = `${min}_${max}`;

    if (useCache && context.random.has(cacheKey)) {
      return context.random.get(cacheKey);
    }

    const randomValue =
      Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min);

    if (useCache) {
      context.random.set(cacheKey, randomValue);
    }

    return `${randomValue}`;
  },
};
