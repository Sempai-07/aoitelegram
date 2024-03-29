import fs from "node:fs";
import path from "node:path";
import importSync from "import-sync";
import { AoijsError } from "./AoiError";
import { Update } from "@telegram.ts/types";
import { TaskCompleter } from "../TaskCompleter";
import { getObjectKey } from "../function/parser";
import { setInterval, clearInterval } from "node:timers";
import { AoiClient, DatabaseOptions } from "./AoiClient";
import { ContextEvent, CombinedEventFunctions } from "./AoiTyping";
import { TelegramBot, Collection, Context } from "telegramsjs";
import { AoiManager, KeyValueOptions } from "./AoiManager";
import { MongoDBManager, MongoDBManagerOptions } from "./MongoDBManager";
import {
  LibDataFunction,
  DataFunction,
  LibWithDataFunction,
} from "./AoiTyping";
import { version } from "../index";

type AllowedUpdates = ReadonlyArray<Exclude<keyof Update, "update_id">>;

const defaultAllowedUpdates = [
  "message",
  "edited_message",
  "channel_post",
  "message_reaction",
  "message_reaction_count",
  "edited_channel_post",
  "inline_query",
  "chosen_inline_result",
  "callback_query",
  "shipping_query",
  "pre_checkout_query",
  "poll_answer",
  "poll",
  "chat_member",
  "my_chat_member",
  "chat_join_request",
  "chat_boost",
  "removed_chat_boost",
] as AllowedUpdates;

/**
 * Configuration options for interacting with the Telegram API.
 */
interface TelegramOptions {
  /**
   * The maximum number of updates to fetch at once. Defaults to 100.
   */
  limit?: number;

  /**
   * The timeout for long polling in seconds. Defaults to 60 seconds.
   */
  timeout?: number;

  /**
   * An array of allowed update types to receive. Defaults to all updates.
   */
  allowed_updates?: AllowedUpdates;

  /**
   * An optional session object for managing user sessions.
   */
  session?: unknown;
}

/**
 * A class that provides additional functionality for handling commands and messages.
 */
class AoiBase extends TelegramBot {
  database: AoiManager | MongoDBManager = {} as AoiManager | MongoDBManager;
  disableFunctions: string[];
  availableFunctions: Collection<string, LibWithDataFunction> =
    new Collection();
  /**
   * Creates a new instance of AoiBase.
   * @param  token - The token for authentication.
   * @param {TelegramOptions} telegram - Configuration options for the Telegram integration.
   * @param {DatabaseOptions} options.database - Options for the database.
   * @param {string[]} options.disableFunctions - Functions that will be removed from the library's loading functions.
   * @param {boolean} [options.disableAoiDB] - Disabled built-in database.
   */
  constructor(
    token: string,
    telegram: TelegramOptions = {},
    database: DatabaseOptions = {},
    disableFunctions?: string[],
    disableAoiDB?: boolean,
  ) {
    if (!token) {
      throw new AoijsError(
        "AoiBase",
        "You did not specify the 'token' parameter",
      );
    }

    super(
      token,
      Array.isArray(telegram?.allowed_updates)
        ? telegram
        : { ...telegram, allowed_updates: defaultAllowedUpdates },
    );

    this.disableFunctions = disableFunctions || [];
    this.availableFunctions = loadFunctionsLib(
      path.join(__dirname, "../function/"),
      new Collection<string, LibWithDataFunction>(),
      disableFunctions || [],
    );

    if (!disableAoiDB) {
      if (database?.type === "KeyValue" || !database?.type) {
        this.database = new AoiManager(database as KeyValueOptions);
      } else if (database?.type === "MongoDB") {
        this.database = new MongoDBManager(database as MongoDBManagerOptions);
        this.database.createFunction(this);
      } else {
        throw new AoijsError(
          undefined,
          "the specified database type is incorrect; it should be either 'MongoDB' or 'KeyValue'",
        );
      }
    }
  }

  /**
   * Register event listeners for the bot.
   * ```ts
   * bot.on("ready", client => {
   *  console.log(`Starting ${client.username}`);
   * });
   *
   * bot.on("message", message => {
   *  message.reply(`Hello ${message.first_name}`);
   * });
   * ```
   * @param event The event or an array of events to listen for.
   * @param listener The callback function to be executed when the event(s) occur.
   * @returns This instance of the bot for method chaining.
   */
  on<T extends keyof CombinedEventFunctions>(
    event: T,
    listener: CombinedEventFunctions[T],
  ): this;

  on(event: string, listener: (...data: any[]) => void) {
    super.on(event, listener);
    return this;
  }

  /**
   * Executes a block of code in response to a command.
   * @param command - The name of the command.
   * @param code - The code to be executed.
   * @param eventData - The context or user for executing the code.
   * @param useNative - The native functions to the command handler.
   */
  async evaluateCommand(
    command: string | { event: string },
    code: string,
    eventData: unknown,
    useNative?: Function[],
  ) {
    try {
      const taskCompleter = new TaskCompleter(
        code,
        eventData as ContextEvent,
        this as unknown as AoiClient,
        {
          name: typeof command === "string" ? command : command.event,
          hasCommand: typeof command === "string" ? true : false,
          hasEvent: typeof command === "string" ? false : true,
        },
        this.database,
        this.availableFunctions,
        [...this.availableFunctions.keys()],
        useNative,
      );
      return await taskCompleter.completeTask();
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Adds a data function or an array of data functions to the available functions.
   * @param dataFunction - The data function(s) to add.
   */
  addFunction(dataFunction: DataFunction | DataFunction[]) {
    if (Array.isArray(dataFunction)) {
      for (const func of dataFunction) {
        const functionName = func?.name?.toLowerCase();
        if (!functionName) {
          throw new AoijsError(
            "customFunction",
            "you did not specify the 'name' parameter",
          );
        }

        if (this.availableFunctions.has(functionName)) {
          throw new AoijsError(
            "customFunction",
            `the function "${functionName}" already exists; to overwrite it, use the <AoiClient>.editFunction method!`,
          );
        }

        if ((func?.version || 0) > version) {
          throw new AoijsError(
            "customFunction",
            `to load this function ${functionName}, the library version must be equal to or greater than ${func?.version || 0}`,
          );
        }

        this.availableFunctions.set(functionName, func);
      }
    } else {
      const functionName = dataFunction?.name?.toLowerCase();
      if (!functionName) {
        throw new AoijsError(
          "customFunction",
          "you did not specify the 'name' parameter",
        );
      }

      if (this.availableFunctions.has(functionName)) {
        throw new AoijsError(
          "customFunction",
          `the function "${functionName}" already exists; to overwrite it, use the <AoiClient>.editFunction method!`,
        );
      }

      if ((dataFunction?.version || 0) > version) {
        throw new AoijsError(
          "customFunction",
          `to load this function ${functionName}, the library version must be equal to or greater than ${dataFunction?.version || 0}`,
        );
      }

      this.availableFunctions.set(functionName, dataFunction);
    }
    return this;
  }

  /**
   * Ensures the registration of a data function or an array of data functions.
   * @param dataFunction - A single data function or an array of data functions.
   * @returns The AoiClient instance for method chaining.
   */
  ensureFunction(dataFunction: DataFunction | DataFunction[]) {
    if (Array.isArray(dataFunction)) {
      for (const func of dataFunction) {
        const functionName = func?.name?.toLowerCase();
        if (!functionName) {
          throw new AoijsError(
            "customFunction",
            "you did not specify the 'name' parameter",
          );
        }

        if ((func?.version || 0) > version) {
          throw new AoijsError(
            "customFunction",
            `to load this function ${functionName}, the library version must be equal to or greater than ${func?.version || 0}`,
          );
        }

        this.availableFunctions.set(functionName, func);
      }
    } else {
      const functionName = dataFunction?.name?.toLowerCase();
      if (!functionName) {
        throw new AoijsError(
          "customFunction",
          "you did not specify the 'name' parameter",
        );
      }

      if ((dataFunction?.version || 0) > version) {
        throw new AoijsError(
          "customFunction",
          `to load this function ${functionName}, the library version must be equal to or greater than ${dataFunction?.version || 0}`,
        );
      }

      this.availableFunctions.set(functionName, dataFunction);
    }
    return this;
  }

  /**
   * Removes function(s) from the available functions based on provided options.
   * @param functionName - The name of the function to remove or an array of function names.
   */
  removeFunction(functionName: string | string[]) {
    const functionNames = Array.isArray(functionName)
      ? functionName
      : [functionName];

    if (functionNames.length < 1) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'name' parameter",
      );
    }

    for (const name of functionNames) {
      const lowerCaseName = name.toLowerCase();
      const hasDeleted = this.availableFunctions.delete(lowerCaseName);
      if (!hasDeleted) {
        throw new AoijsError(
          "customFunction",
          `the function "${lowerCaseName}" does not exist or has already been deleted`,
        );
      }
    }
    return true;
  }

  /**
   * Edits or adds a data function to the available functions.
   * @param dataFunction - A single DataFunction or an array of DataFunction objects.
   * @returns Returns true after successfully editing or adding the function(s).
   */
  editFunction(dataFunction: DataFunction | DataFunction[]) {
    const functionsToEdit = Array.isArray(dataFunction)
      ? dataFunction
      : [dataFunction];

    if (!functionsToEdit.length) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'name' parameter",
      );
    }

    for (const func of functionsToEdit) {
      const lowerCaseName = func?.name?.toLowerCase();
      if (!this.availableFunctions.has(lowerCaseName)) {
        throw new AoijsError(
          "customFunction",
          `the function "${lowerCaseName}" does not exist; you can only modify functions that have been added recently`,
        );
      }

      this.availableFunctions.set(lowerCaseName, func);
    }

    return true;
  }

  /**
   * Retrieves a function from the available functions.
   * @param functionName - A single function name or an array of function names.
   * @returns Returns the requested function(s).
   */
  getFunction(functionName: string | string[]) {
    const functionNames = Array.isArray(functionName)
      ? functionName
      : [functionName];

    if (functionNames.length < 1) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'name' parameter",
      );
    }

    if (functionNames.length > 1) {
      return functionNames.map((name) => this.availableFunctions.get(name));
    } else {
      return this.availableFunctions.get(functionNames[0]);
    }
  }

  /**
   * Checks if the specified function(s) exist(s).
   * @param functionName - The name of the function or an array of function names.
   * @returns True if the function(s) exist(s), otherwise throws an AoijsError.
   */
  hasFunction(functionName: string | string[]) {
    if (Array.isArray(functionName)) {
      return functionName.map((fun) => ({
        name: fun,
        result: this.availableFunctions.has(fun),
      }));
    } else if (typeof functionName === "string") {
      return this.availableFunctions.has(functionName);
    } else {
      throw new AoijsError(
        "customFunction",
        `the specified type should be "string | string[]`,
      );
    }
  }

  /**
   * Gets the count of available functions.
   * @returns The number of functions currently available.
   */
  get countFunction() {
    return this.availableFunctions.size;
  }

  /**
   * Executes a command in a loop at a specified interval.
   * @param options - Loop configuration options.
   * @param options.every - Interval in milliseconds for executing the code.
   * @param options.code - The command code to be executed in the loop.
   * @param options.useNative - The native functions to the command handler.
   */
  loopCommand(options: {
    every?: number;
    code: string;
    useNative?: Function[];
  }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }

    let currentIndex = 1;
    const intervalId = setInterval(async () => {
      this.ensureFunction([
        {
          name: "$break",
          callback: () => clearInterval(intervalId),
        },
        {
          name: "$continue",
          callback: (context) => (context.isError = true),
        },
        {
          name: "$index",
          callback: () => currentIndex,
        },
      ]);

      await this.evaluateCommand(
        { event: "loop" },
        options.code,
        this,
        options.useNative,
      );
      currentIndex++;
    }, options.every || 60000);
    return this;
  }

  /**
   * Registers a code block to be executed when the bot is ready.
   * @param options - Command options.
   * @param options.code - The code to be executed when the bot is ready.
   * @param options.useNative - The native functions to the command handler.
   */
  readyCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("ready", async (ctx) => {
      await this.evaluateCommand(
        { event: "ready" },
        options.code,
        {
          ...ctx,
          telegram: this,
        },
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to a message.
   * @param options - Command options.
   * @param options.code - The code to be executed when a message is received.
   * @param options.useNative - The native functions to the command handler.
   */
  messageCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("message", async (ctx) => {
      await this.evaluateCommand(
        { event: "message" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to a callback_query.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when a callback_query is received.
   * @param options.useNative - The native functions to the command handler.
   */
  callbackQueryCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("callback_query", async (ctx) => {
      await this.evaluateCommand(
        { event: "callback_query" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to a message_reaction.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when a message_reaction is received.
   * @param options.useNative - The native functions to the command handler.
   */
  messageReactionCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("message_reaction", async (ctx) => {
      await this.evaluateCommand(
        { event: "message_reaction" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to a message_reaction_count.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when a message_reaction_count is received.
   * @param options.useNative - The native functions to the command handler.
   */
  messageReactionCountCommand(options: {
    code: string;
    useNative?: Function[];
  }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("message_reaction_count", async (ctx) => {
      await this.evaluateCommand(
        { event: "message_reaction_count" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an edited_message event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an edited_message event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  editedMessageCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("edited_message", async (ctx) => {
      await this.evaluateCommand(
        { event: "edited_message" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an channel_post event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an channel_post event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  channelPostCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("channel_post", async (ctx) => {
      await this.evaluateCommand(
        { event: "channel_post" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an edited_channel_post event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an edited_channel_post event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  editedChannelPostCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("edited_channel_post", async (ctx) => {
      await this.evaluateCommand(
        { event: "edited_channel_post" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an inline_query event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an inline_query event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  inlineQueryCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("inline_query", async (ctx) => {
      await this.evaluateCommand(
        { event: "inline_query" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an shipping_query event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an shipping_query event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  shippingQueryCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("shipping_query", async (ctx) => {
      await this.evaluateCommand(
        { event: "shipping_query" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an pre_checkout_query event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an pre_checkout_query event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  preCheckoutQueryCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("pre_checkout_query", async (ctx) => {
      await this.evaluateCommand(
        { event: "pre_checkout_query" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an poll event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an poll event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  pollCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("poll", async (ctx) => {
      await this.evaluateCommand(
        { event: "poll" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an poll_answer event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an poll_answer event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  pollAnswerCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("poll_answer", async (ctx) => {
      await this.evaluateCommand(
        { event: "poll_answer" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an chat_member event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an chat_member event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  chatMemberCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("chat_member", async (ctx) => {
      await this.evaluateCommand(
        { event: "chat_member" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an my_chat_member event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an my_chat_member event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  myChatMemberCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("my_chat_member", async (ctx) => {
      await this.evaluateCommand(
        { event: "my_chat_member" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an chat_join_request event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an chat_join_request event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  chatJoinRequestCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("chat_join_request", async (ctx) => {
      await this.evaluateCommand(
        { event: "chat_join_request" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to a chat_boost.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when a chat_boost is received.
   * @param options.useNative - The native functions to the command handler.
   */
  chatBoostCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("chat_boost", async (ctx) => {
      await this.evaluateCommand(
        { event: "chat_boost" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to a removed_chat_boost.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when a removed_chat_boost is received.
   * @param options.useNative - The native functions to the command handler.
   */
  removedChatBoostCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.on("removed_chat_boost", async (ctx) => {
      await this.evaluateCommand(
        { event: "removed_chat_boost" },
        options.code,
        ctx,
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an variables create event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an create event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  variableCreateCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.database.on("create", async (newVariable) => {
      this.ensureFunction({
        name: "$newVariable",
        callback: (context) => {
          const result = getObjectKey(newVariable, context.inside as string);
          return typeof result === "object" ? JSON.stringify(result) : result;
        },
      });
      await this.evaluateCommand(
        { event: "variableCreate" },
        options.code,
        {
          newVariable,
          telegram: this,
        },
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an variables updated event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an updated event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  variableUpdateCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.database.on("update", async (variable) => {
      this.ensureFunction({
        name: "$variable",
        callback: (context) => {
          const result = getObjectKey(variable, context.inside as string);
          return typeof result === "object" ? JSON.stringify(result) : result;
        },
      });
      await this.evaluateCommand(
        { event: "variableUpdate" },
        options.code,
        {
          variable,
          telegram: this,
        },
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Registers a code block to be executed in response to an variables delete event.
   * @param  options - Command options.
   * @param  options.code - The code to be executed when an delete event is received.
   * @param options.useNative - The native functions to the command handler.
   */
  variableDeleteCommand(options: { code: string; useNative?: Function[] }) {
    if (!options?.code) {
      throw new AoijsError(
        "parameter",
        "you did not specify the 'code' parameter",
      );
    }
    this.database.on("delete", async (oldVariable) => {
      this.ensureFunction({
        name: "$oldVariable",
        callback: (context) => {
          const result = getObjectKey(oldVariable, context.inside as string);
          return typeof result === "object" ? JSON.stringify(result) : result;
        },
      });
      await this.evaluateCommand(
        { event: "variableDelete" },
        options.code,
        {
          oldVariable,
          telegram: this,
        },
        options.useNative,
      );
    });
    return this;
  }

  /**
   * Set variables in the database.
   * @param  options - Key-value pairs of variables to set.
   * @param  options.tables - The database table to use.
   */
  async variables(
    options: { [key: string]: unknown },
    tables?: string | string[],
  ) {
    await this.database.variables(options, tables);
  }
}

/**
 * Reads and processes JavaScript files containing functions from a specified directory.
 * @param dirPath - The path to the directory containing JavaScript files.
 * @param functionsArray - An array to store processed data functions.
 * @param disableFunctions - An array of function names to be disabled.
 */
function loadFunctionsLib(
  dirPath: string,
  availableFunctions: Collection<string, LibWithDataFunction>,
  disableFunctions: string[],
) {
  const processFile = (itemPath: string) => {
    try {
      const dataFunction = require(itemPath).default;
      if (!dataFunction?.name && typeof !dataFunction?.callback !== "function")
        return;
      const dataFunctionName = dataFunction.name.toLowerCase();
      if (disableFunctions.includes(dataFunctionName)) return;

      availableFunctions.set(dataFunctionName, dataFunction);
    } catch (error) {
      console.error(error);
    }
  };

  const processItem = (item: string) => {
    const itemPath = path.join(dirPath, item);
    try {
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        loadFunctionsLib(itemPath, availableFunctions, disableFunctions);
      } else if (itemPath.endsWith(".js")) {
        processFile(itemPath);
      }
    } catch (error) {
      console.error(error);
    }
  };

  try {
    const items = fs.readdirSync(dirPath);
    items.map(processItem);
    return availableFunctions;
  } catch (error) {
    console.error(error);
    return availableFunctions;
  }
}

export { AoiBase, TelegramOptions };
