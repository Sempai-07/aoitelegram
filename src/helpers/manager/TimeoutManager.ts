import { setTimeout } from "node:timers";
import { EventEmitter } from "node:events";
import { KeyValue } from "@aoitelegram/database";
import { AoijsError } from "../../classes/AoiError";
import { AoiClient } from "../../classes/AoiClient";
import { DatabaseOptions } from "../../classes/AoiManager";

interface ValueDatabase {
  id: string;
  milliseconds: number;
  data: object;
  date: number;
}

/**
 * A class responsible for managing timeouts and associated actions.
 */
class TimeoutManager extends KeyValue<string, ValueDatabase> {
  /**
   * A reference to the AoiClient instance.
   */
  private telegram: AoiClient;

  /**
   * Constructs a new TimeoutManager instance.
   * @param telegram The AoiClient instance.
   * @param options Configuration options for the database connection.
   */
  constructor(telegram: AoiClient, options: DatabaseOptions = {}) {
    super({ ...options, tables: ["timeout"] });
    this.telegram = telegram;

    /**
     * Handles the 'ready' event, which is emitted when the database connection is established.
     */
    this.on("ready", () => {
      this.forEach("timeout", (value, key) => {
        const timeoutData = this.get("timeout", key);

        if (!timeoutData) return;

        const remainingTime =
          timeoutData.date + timeoutData.milliseconds - Date.now();

        if (remainingTime > 0) {
          setTimeout(() => {
            this.telegram.emit("timeout", this.telegram, timeoutData);
            this.delete("timeout", timeoutData.id);
          }, timeoutData.milliseconds);
        } else {
          this.telegram.emit("timeout", this.telegram, timeoutData);
          this.delete("timeout", timeoutData.id);
        }
      });
    });

    /**
     * Handles the 'addTimeout' event, which is emitted when a new timeout is scheduled.
     * @param context The context object containing timeout details.
     */
    this.telegram.on("addTimeout", (context) => {
      if (!context) return;
      if (context.milliseconds <= 5000) {
        throw new AoijsError(
          "timeout",
          `the specified time should be greater than 5000 milliseconds. Timeout ID: ${context.id}`,
        );
      }

      setTimeout(() => {
        this.telegram.emit("timeout", this.telegram, context);
        this.delete("timeout", context.id);
      }, context.milliseconds);
    });

    this.connect();
  }

  /**
   * Adds a new timeout with the specified ID, milliseconds, and data.
   * @param id The unique identifier of the timeout.
   * @param options The options for the timeout, including milliseconds and data.
   */
  addTimeout(
    id: string,
    options: {
      milliseconds: number;
      data: object;
    },
  ) {
    const data = {
      ...options,
      id,
      date: Date.now(),
    };
    this.telegram.emit("addTimeout", data);
    this.set("timeout", id, data);
  }
}

export { TimeoutManager, ValueDatabase };
