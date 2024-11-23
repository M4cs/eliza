import {
    composeContext,
    elizaLogger,
    embeddingZeroVector,
    generateText,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
} from "@ai16z/eliza";
import { ClientBase } from "./base";

const warpcastPostTemplate = `{{timeline}}

# Knowledge
{{knowledge}}

About {{agentName}} (@{{warpcastUserName}}):
{{bio}}
{{lore}}
{{postDirections}}

{{providers}}

{{recentPosts}}

{{characterPostExamples}}

# Task: Generate a post in the voice and style of {{agentName}}, aka @{{warpcastUserName}}
Write a single sentence post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Try to write something totally different than previous posts. Do not add commentary or acknowledge this request, just write the post.
Your response should not contain any questions. Brief, concise statements only. No emojis. Use \\n\\n (double spaces) between statements.`;
const MAX_CAST_LENGTH = 280;

function truncateToCompleteSentence(text: string): string {
    if (text.length <= MAX_CAST_LENGTH) {
        return text;
    }

    // Attempt to truncate at the last period within the limit
    const truncatedAtPeriod = text.slice(
        0,
        text.lastIndexOf(".", MAX_CAST_LENGTH) + 1
    );
    if (truncatedAtPeriod.trim().length > 0) {
        return truncatedAtPeriod.trim();
    }

    // If no period is found, truncate to the nearest whitespace
    const truncatedAtSpace = text.slice(
        0,
        text.lastIndexOf(" ", MAX_CAST_LENGTH)
    );
    if (truncatedAtSpace.trim().length > 0) {
        return truncatedAtSpace.trim() + "...";
    }

    // Fallback: Hard truncate and add ellipsis
    return text.slice(0, MAX_CAST_LENGTH - 3).trim() + "...";
}

export class WarpcastPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    async start(postImmediately: boolean = false) {
        if (!this.client.profile) {
            await this.client.init();
        }

        const generateNewCastLoop = async () => {
            const lastPost = await this.runtime.cacheManager.get<{
                timestamp: number;
            }>(`warpcast/${this.client.profile.fid}/lastPost`);

            const lastPostTimestamp = lastPost?.timestamp ?? 0;
            const minMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MIN")) || 90;
            const maxMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MAX")) || 180;
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;

            if (Date.now() > lastPostTimestamp + delay) {
                await this.generateNewCast();
            }

            setTimeout(() => {
                generateNewCastLoop(); // Set up next iteration
            }, delay);

            elizaLogger.log(`Next cast scheduled in ${randomMinutes} minutes`);
        };

        if (postImmediately) {
            this.generateNewCast();
        }

        generateNewCastLoop();
    }

    async generateNewCast() {
        elizaLogger.log(`Generating a new cast`);

        try {
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "warpcast"
            );

            let homeTimeline: any[] = [];

            const cachedTimeline = await this.client.getCachedTimeline();

            if (cachedTimeline) {
                homeTimeline = cachedTimeline;
            } else {
                homeTimeline = await this.client.fetchHomeTimeline(10);
                await this.client.cacheTimeline(homeTimeline);
            }

            const formattedHomeTimeline =
                `# ${this.runtime.character.name}'s Home Timeline\n\n` +
                homeTimeline
                    .map((cast) => {
                        return `#${cast.hash}\n${cast.author.display_name} (@${cast.author.username})${cast.parent_hash ? `\nIn reply to: ${cast.parent_hash}` : ""}\n${cast.timestamp}\n\n${cast.text}\n---\n`;
                    })
                    .join("\n");

            const topics = this.runtime.character.topics.join(", ");

            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: stringToUuid("warpcast_generate_room"),
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics,
                        action: "",
                    },
                },
                {
                    warpcastUserName: this.client.profile.username,
                    timeline: formattedHomeTimeline,
                }
            );

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates?.warpcastPostTemplate ||
                    warpcastPostTemplate,
            });

            elizaLogger.debug(`Generate Post Prompt:\n` + context);

            const newCastContent = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            const formattedCast = newCastContent
                .replaceAll(/\\n/g, "\n")
                .trim();

            // Use the helper function to truncate to complete sentence
            const content = truncateToCompleteSentence(formattedCast);

            if (this.runtime.getSetting("WARPCAST_DRY_RUN") === "true") {
                elizaLogger.info(`Dry run: would have posted cast: ${content}`);
                return;
            }

            try {
                elizaLogger.log(`Posting new cast: ${content}`);
                elizaLogger.log(`Inside of generate new cast`);

                elizaLogger.log(
                    `Singer UUID: ${this.client.profile.signerUUID}`
                );
                elizaLogger.log(`text: ${content}`);
                const result = await this.client.neynarClient.publishCast({
                    signerUuid: this.client.profile.signerUUID,
                    text: content,
                });

                if (!result.success) {
                    throw new Error(`Failed to post new cast`);
                    return;
                }

                const castHash = result.cast.hash;

                const { cast } =
                    await this.client.neynarClient.lookupCastByHashOrWarpcastUrl(
                        {
                            identifier: castHash,
                            type: "hash",
                            viewerFid: this.client.profile.fid,
                        }
                    );

                await this.runtime.cacheManager.set(
                    `warpcast/${this.client.profile.fid}/lastPost`,
                    {
                        hash: cast.hash,
                        timestamp: Date.now(),
                    }
                );

                await this.client.cacheCast(cast);

                homeTimeline.push(cast);

                await this.client.cacheTimeline(homeTimeline);
                elizaLogger.log(`Casted:\n${cast.hash}`);

                const roomId = stringToUuid(
                    cast.thread_hash + "-" + this.runtime.agentId
                );

                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureParticipantInRoom(
                    this.runtime.agentId,
                    roomId
                );

                await this.runtime.messageManager.createMemory({
                    id: stringToUuid(cast.hash + "-" + this.runtime.agentId),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: newCastContent.trim(),
                        url: cast.hash,
                        source: "warpcast",
                    },
                    roomId,
                    embedding: embeddingZeroVector,
                    createdAt: new Date(cast.timestamp).getTime(),
                });
            } catch (error) {
                elizaLogger.error(`Failed posting cast:`, error);
            }
        } catch (error) {
            elizaLogger.error(`Failed posting cast:`, error);
        }
    }
}
