import {
    composeContext,
    Content,
    elizaLogger,
    generateMessageResponse,
    generateShouldRespond,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    messageCompletionFooter,
    ModelClass,
    shouldRespondFooter,
    State,
    stringToUuid,
} from "@ai16z/eliza";
import { ClientBase } from "./base";
import { buildConversationThread, publishCast, wait } from "./utils";
import { NotificationType } from "@neynar/nodejs-sdk/build/api";

export const warpcastMessageHandlerTemplate =
    `{{timeline}}

# Knowledge
{{knowledge}}

# Task: Generate a post for the character {{agentName}}.
About {{agentName}} (@{{warpcastUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

{{recentPosts}}


# Task: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{warpcastUserName}}) while using the thread of tweets as additional context:
Current Post:
{{currentPost}}
Thread of Tweets You Are Replying To:

{{formattedConversation}}

{{actions}}

# Task: Generate a post in the voice, style and perspective of {{agentName}} (@{{warpcastUserName}}). Include an action, if appropriate. {{actionNames}}:
{{currentPost}}
` + messageCompletionFooter;

export const warpcastShouldRespondTemplate =
    `# INSTRUCTIONS: Determine if {{agentName}} (@{{warpcastUserName}}) should respond to the message and participate in the conversation. Do not comment. Just respond with "true" or "false".

Response options are RESPOND, IGNORE and STOP .

{{agentName}} should respond to messages that are directed at them, or participate in conversations that are interesting or relevant to their background, IGNORE messages that are irrelevant to them, and should STOP if the conversation is concluded.

{{agentName}} is in a room with other users and wants to be conversational, but not annoying.
{{agentName}} should RESPOND to messages that are directed at them, or participate in conversations that are interesting or relevant to their background.
If a message is not interesting or relevant, {{agentName}} should IGNORE.
Unless directly RESPONDing to a user, {{agentName}} should IGNORE messages that are very short or do not contain much information.
If a user asks {{agentName}} to stop talking, {{agentName}} should STOP.
If {{agentName}} concludes a conversation and isn't part of the conversation anymore, {{agentName}} should STOP.

{{recentPosts}}

IMPORTANT: {{agentName}} (aka @{{warpcastUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.

{{currentPost}}

Thread of Tweets You Are Replying To:

{{formattedConversation}}

# INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
` + shouldRespondFooter;

export class WarpcastInteractionClient {
    client: ClientBase;
    runtime: IAgentRuntime;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    async start() {
        if (!this.client.profile) {
            await this.client.init();
        }
        const handleWarpcastInteractionsLoop = () => {
            this.handleWarpcastInteractions();
            setTimeout(
                handleWarpcastInteractionsLoop,
                (Math.floor(Math.random() * (5 - 2 + 1)) + 2) * 60 * 1000
            );
        };
        handleWarpcastInteractionsLoop();
    }

    private async handleWarpcastInteractions() {
        elizaLogger.log(`Checking Warpcast interactions`);

        const warpcastUsername = this.client.profile.username;

        try {
            const { notifications } =
                await this.client.neynarClient.fetchAllNotifications({
                    fid: this.client.profile.fid,
                    type: ["replies"],
                });

            const uniqueCastCandidates = [...new Set(notifications)];

            uniqueCastCandidates
                .sort((a, b) => a.cast.hash.localeCompare(b.cast.hash))
                .filter(
                    (notif) => notif.cast.author.fid !== this.client.profile.fid
                );

            for (const { cast } of uniqueCastCandidates) {
                if (
                    !this.client.lastCheckedCastHash ||
                    cast.hash != this.client.lastCheckedCastHash
                ) {
                    elizaLogger.log(`New Cast found`, cast.hash);

                    const roomId = stringToUuid(
                        cast.thread_hash + "-" + this.runtime.agentId
                    );

                    const userId =
                        cast.author.fid === this.client.profile.fid
                            ? this.runtime.agentId
                            : stringToUuid(cast.author.fid.toString());
                    await this.runtime.ensureConnection(
                        userId,
                        roomId,
                        cast.author.username,
                        cast.author.display_name,
                        "warpcast"
                    );

                    const thread = await buildConversationThread(
                        cast,
                        this.client
                    );

                    const message = {
                        content: { text: cast.text },
                        agentId: this.runtime.agentId,
                        userId,
                        roomId,
                    };

                    await this.handleCast({
                        cast,
                        message,
                        thread,
                    });

                    this.client.lastCheckedCastHash = cast.hash;
                }
            }

            await this.client.cacheLatestCheckedCastHash();

            elizaLogger.log(`Finished checking Warpcast interactions`);
        } catch (error) {
            elizaLogger.error(`Error handling Warpcast interactions:`, error);
        }
    }

    private async handleCast({
        cast,
        message,
        thread,
    }: {
        cast: any;
        message: Memory;
        thread: any[];
    }) {
        if (cast.author.fid === this.client.profile.fid) {
            elizaLogger.log(`No need to handle our own cast... skipping.`);
            return;
        }

        if (!message.content.text) {
            elizaLogger.log(`Skipping cast with no text`, cast.hash);
            return { text: "", action: "IGNORE" };
        }

        elizaLogger.log(`Processing Cast: ${cast.hash}`);

        const formatCast = (cast: any) => {
            return `  ID: $${cast.hash}
  From: ${cast.author.display_name} (@${cast.author.username})
  Text: ${cast.text}`;
        };
        const currentPost = formatCast(cast);

        let homeTimeline: any[] = [];

        const cachedTimeline = await this.client.getCachedTimeline();
        if (cachedTimeline) {
            homeTimeline = cachedTimeline;
        } else {
            homeTimeline = await this.client.fetchHomeTimeline(50);
            await this.client.cacheTimeline(homeTimeline);
        }

        elizaLogger.debug("Thread: ", thread);
        const formattedConversation = thread
            .map(
                (cast) => `@${cast.author.username} (${new Date(
                    cast.timestamp
                ).toLocaleString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                })}):
    ${cast.text}`
            )
            .join("\n\n");

        elizaLogger.debug("formattedConversation: ", formattedConversation);

        const formattedHomeTimeline =
            `# ${this.runtime.character.name}'s Home Timeline\n\n` +
            homeTimeline
                .map((cast) => {
                    return `ID: ${cast.hash}\nFrom: ${cast.author.display_name} (@${cast.author.username})${cast.parent_hash ? ` In reply to: ${cast.parent_hash}` : ""}\nText: ${cast.text}\n---\n`;
                })
                .join("\n");

        let state = await this.runtime.composeState(message, {
            neynarClient: this.client.neynarClient,
            warpcastUserName: this.runtime.getSetting("WARPCAST_USERNAME"),
            currentPost,
            formattedConversation,
            timeline: formattedHomeTimeline,
        });

        const castId = stringToUuid(cast.hash + "-" + this.runtime.agentId);
        const castExists =
            await this.runtime.messageManager.getMemoryById(castId);

        if (!castExists) {
            elizaLogger.log(`Cast does not exist, saving!`);
            const userId = stringToUuid(cast.author.fid.toString());
            const roomId = stringToUuid(
                cast.thread_hash + "-" + this.runtime.agentId
            );

            const message = {
                id: castId,
                agentId: this.runtime.agentId,
                content: {
                    text: cast.text,
                    url: cast.hash,
                    inReplyTo: cast.parent_hash
                        ? stringToUuid(
                              cast.parent_hash + "-" + this.runtime.agentId
                          )
                        : undefined,
                },
                userId,
                roomId,
                createdAt: new Date(cast.timestamp).getTime(),
            };
            this.client.saveRequestMessage(message, state);
        }

        const shouldRespondContext = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.warpcastShouldRespondTemplate ||
                this.runtime.character.templates?.shouldRespondTemplate ||
                warpcastShouldRespondTemplate,
        });

        const shouldRespond = await generateShouldRespond({
            runtime: this.runtime,
            context: shouldRespondContext,
            modelClass: ModelClass.SMALL,
        });

        if (shouldRespond !== "RESPOND") {
            elizaLogger.log(`Not responding in message`);
            return { text: "Response Decision:", action: shouldRespond };
        }

        const context = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.warpcastMessageHandlerTemplate ||
                this.runtime.character.templates?.messageHandlerTemplate ||
                warpcastMessageHandlerTemplate,
        });

        elizaLogger.debug(`Interactions prompt:\n` + context);

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.MEDIUM,
        });

        const removeQuotes = (str: string) =>
            str.replace(/^['"](.*)['"]$/, "$1");

        const stringId = stringToUuid(cast.hash + "-" + this.runtime.agentId);

        response.inReplyTo = stringId;

        response.text = removeQuotes(response.text);

        if (response.text) {
            try {
                const callback: HandlerCallback = async (response: Content) => {
                    const memories = await publishCast(
                        this.client,
                        response,
                        message.roomId,
                        this.client.profile.username,
                        cast.hash
                    );

                    return memories;
                };

                const responseMessages = await callback(response);

                state = (await this.runtime.updateRecentMessageState(
                    state
                )) as State;

                for (const responseMessage of responseMessages) {
                    if (
                        responseMessage ===
                        responseMessages[responseMessages.length - 1]
                    ) {
                        responseMessage.content.action = response.action;
                    } else {
                        responseMessage.content.action = "CONTINUE";
                    }
                    await this.runtime.messageManager.createMemory(
                        responseMessage
                    );
                }

                await this.runtime.evaluate(message, state);

                await this.runtime.processActions(
                    message,
                    responseMessages,
                    state
                );

                const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${cast.hash} - ${cast.author.username}: ${cast.text}\nAgent's Output:\n${response.text}`;

                await this.runtime.cacheManager.set(
                    `warpcast/cast_generation_${cast.hash}.text`,
                    responseInfo
                );

                await wait();
            } catch (error) {
                elizaLogger.error(`Error sending response cast: ${error}`);
            }
        }
    }
}
