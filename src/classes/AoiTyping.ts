import { AoiClient } from "./AoiClient";
import { AoiManager } from "./AoiManager";
import { AwaitedEvent } from "../helpers/Awaited";
import { ContextFunction } from "../TaskCompleter";
import { Context as EventContext } from "telegramsjs";
import { ValueDatabase } from "../helpers/manager/TimeoutManager";
import {
  Update,
  UserFromGetMe,
  Message,
  MessageReactionUpdated,
  MessageReactionCountUpdated,
  CallbackQuery,
  InlineQuery,
  ShippingQuery,
  PreCheckoutQuery,
  Poll,
  PollAnswer,
  ChatMemberUpdated,
  ChatJoinRequest,
  MessageEntity,
  ChatBoostUpdated,
  ChatBoostRemoved,
} from "@telegram.ts/types";

interface CaptionableMessage {
  caption: string;
  caption_entities?: MessageEntity[];
}

interface EventDataMap<F> {
  update: (data: Update) => void;
  ready: (data: UserFromGetMe) => void;
  message: (data: Message & EventContext<F>) => void;
  "message:text": (data: Message.TextMessage & EventContext<F>) => void;
  message_reaction: (data: MessageReactionUpdated & EventContext<F>) => void;
  message_reaction_count: (
    data: MessageReactionCountUpdated & EventContext<F>,
  ) => void;
  edited_message: (data: Message & Update.Edited & EventContext<F>) => void;
  channel_post: (data: Message & Update.Channel & EventContext<F>) => void;
  edited_channel_post: (data: Message & Update.Edited & Update.Channel) => void;
  inline_query: (data: InlineQuery & EventContext<F>) => void;
  callback_query: (data: CallbackQuery & EventContext<F>) => void;
  "callback_query:data": (
    data: CallbackQuery & { data: string } & EventContext<F>,
  ) => void;
  shipping_query: (data: ShippingQuery & EventContext<F>) => void;
  pre_checkout_query: (data: PreCheckoutQuery & EventContext<F>) => void;
  poll: (data: Poll & EventContext<F>) => void;
  poll_answer: (data: PollAnswer & EventContext<F>) => void;
  chat_member: (data: ChatMemberUpdated & EventContext<F>) => void;
  my_chat_member: (data: ChatMemberUpdated & EventContext<F>) => void;
  chat_join_request: (data: ChatJoinRequest & EventContext<F>) => void;
  chat_boost: (data: ChatBoostUpdated & EventContext<F>) => void;
  removed_chat_boost: (data: ChatBoostRemoved & EventContext<F>) => void;
}

interface EventHandlers {
  timeout: (client: AoiClient, database: ValueDatabase) => void;
  awaited: (event: AwaitedEvent, data: unknown) => void;
  functionError: (
    client: AoiClient,
    eventContext: EventContext & { telegram: AoiClient },
  ) => void;
  addTimeout: (eventContext: ValueDatabase) => void;
}

interface LibDataFunction {
  name: string;
  callback: (context: ContextFunction) => unknown;
}

type DataFunction =
  | {
      name: string;
      type: "aoitelegram";
      version?: string;
      params?: string[];
      code: string;
    }
  | {
      name: string;
      type?: "js";
      version?: string;
      callback: (context: ContextFunction) => unknown;
    };

type DataEvent = {
  listen: string;
  type: string;
  once?: boolean;
  code?: string;
  callback?: (...args: unknown[]) => void;
};

type CombinedEventFunctions = EventHandlers & EventDataMap<Buffer>;

export { CombinedEventFunctions, LibDataFunction, DataFunction, DataEvent };
