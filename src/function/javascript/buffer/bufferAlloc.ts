export default {
  name: "$bufferAlloc",
  callback: (context) => {
    context.argsCheck(2);
    const [name, size, fill = 0, encoding = "utf8"] = context.splits;
    if (context.isError) return;

    if (!context.buffer.has(name)) {
      context.sendError(
        `The specified variable ${name} does not exist for the buffer`,
      );
      return;
    }

    const buffer = Buffer.alloc(size, fill, encoding);
    return context.buffer.set(name, buffer);
  },
};
