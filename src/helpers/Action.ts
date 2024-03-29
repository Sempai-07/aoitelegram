import { AoijsError } from "../classes/AoiError";
import { AoiClient } from "../classes/AoiClient";

interface ActionDescription {
  data: string;
  answer?: boolean;
  code: string;
  useNative?: Function[];
  [key: string]: unknown;
}

/**
 * Filters an array of `ActionDescription` objects based on a specified search parameter.
 * @param array - The array of `ActionDescription` objects to filter.
 * @param search - The value to search for within the `data` property of each object.
 * @returns An array containing only the `ActionDescription` objects whose `data` property matches the specified search value.
 */
function filterToParams(array: ActionDescription[], search: string) {
  return array.filter((action) => action.data === search);
}

/**
 * Class representing an action handler for AoiClient.
 */
class Action {
  /**
   * Array of registered actions.
   */
  actions: ActionDescription[] = [];

  /**
   * Instance of AoiClient used for communication with the Telegram API.
   */
  telegram: AoiClient;

  /**
   * Creates a new instance of ActionHandler.
   * @param telegram Instance of AoiClient used for communication with the Telegram API.
   */
  constructor(telegram: AoiClient) {
    this.telegram = telegram;
  }

  /**
   * Registers a new action.
   * @param action Action description object.
   * @returns This ActionHandler instance for method chaining.
   */
  register(action: ActionDescription) {
    this.actions.push(action);
    return this;
  }

  /**
   * Starts handling incoming callback queries.
   */
  handler() {
    this.telegram.on("callback_query:data", async (query) => {
      const queryData = query.data;
      if (!this.actions.length) return;
      const actions = filterToParams(this.actions, queryData);

      if (!actions.length) return;

      for (const actionDescription of actions) {
        if (actionDescription.answer) {
          await query.answerCallbackQuery().catch(() => console.log);
        }

        await this.telegram.evaluateCommand(
          { event: "callback_query" },
          actionDescription.code,
          query,
          actionDescription.useNative,
        );
      }
    });
  }
}

export { Action, ActionDescription };
