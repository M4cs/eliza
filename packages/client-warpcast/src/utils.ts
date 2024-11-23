import { ClientBase } from "./base";
import {
    Content,
    elizaLogger,
    embeddingZeroVector,
    Memory,
    stringToUuid,
    UUID,
} from "@ai16z/eliza";

const MAX_CAST_LENGTH = 280;

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export async function buildConversationThread(
    cast: any,
    client: ClientBase,
    maxReplies: number = 10
): Promise<any[]> {
    const thread: any[] = [];
    const visited: Set<string> = new Set();

    async function processThread(currentCast: any, depth: number = 0) {
        elizaLogger.debug(`Processing cast:`, {
            hash: currentCast.hash,
            inReplyTo: currentCast.parent_hash,
            depth: depth,
        });

        if (!currentCast) {
            elizaLogger.debug(`No current cast found for thread building`);
            return;
        }

        if (depth >= maxReplies) {
            elizaLogger.debug(`Reached maximum reply depth`, depth);
            return;
        }

        const memory = await client.runtime.messageManager.getMemoryById(
            stringToUuid(currentCast.hash + "-" + client.runtime.agentId)
        );

        if (!memory) {
            const roomId = stringToUuid(
                currentCast.thread_hash + "-" + client.runtime.agentId
            );
            const userId = stringToUuid(currentCast.author.fid.toString());

            await client.runtime.ensureConnection(
                userId,
                roomId,
                currentCast.author.username,
                currentCast.author.display_name,
                "warpcast"
            );

            await client.runtime.messageManager.createMemory({
                id: stringToUuid(
                    currentCast.hash + "-" + client.runtime.agentId
                ),
                agentId: client.runtime.agentId,
                content: {
                    text: currentCast.text,
                    source: "warpcast",
                    url: cast.hash,
                    inReplyTo: cast.parent_hash
                        ? stringToUuid(
                              cast.parent_hash + "-" + client.runtime.agentId
                          )
                        : undefined,
                },
                createdAt: new Date(currentCast.timestamp).getTime(),
                roomId,
                userId,
                embedding: embeddingZeroVector,
            });
        }

        if (visited.has(currentCast.hash)) {
            elizaLogger.debug(`Already visited cast:`, currentCast.hash);
            return;
        }

        visited.add(currentCast.hash);
        thread.unshift(currentCast);

        elizaLogger.debug(`Current thread state:`, {
            length: thread.length,
            currentDepth: depth,
            castHash: currentCast.hash,
        });

        if (currentCast.parent_hash) {
            elizaLogger.debug(`Fetching parent cast:`, currentCast.parent_hash);

            try {
                const { cast: parentCast } =
                    await client.neynarClient.lookupCastByHashOrWarpcastUrl({
                        identifier: cast.parent_hash,
                        type: "hash",
                        viewerFid: client.profile.fid,
                    });

                if (parentCast) {
                    elizaLogger.debug(`Found parent cast:`, {
                        hash: parentCast.hash,
                        text: parentCast.text?.slice(0, 50),
                    });
                    await processThread(parentCast, depth + 1);
                } else {
                    elizaLogger.debug(
                        "No parent cast found for:",
                        currentCast.parent_hash
                    );
                }
            } catch (error) {
                elizaLogger.error("Error fetching parent tweet:", {
                    parent_hash: currentCast.parent_hash,
                    error,
                });
            }
        } else {
            elizaLogger.debug(
                "Reached end of reply chain at:",
                currentCast.hash
            );
        }
    }

    await processThread(cast, 0);

    elizaLogger.debug("Final thread build:", {
        totalCasts: thread.length,
        castHashes: thread.map((t) => ({
            hash: t.hash,
            text: t.text?.slice(0, 50),
        })),
    });

    return thread;
}

export async function publishCast(
    client: ClientBase,
    content: Content,
    roomId: UUID,
    warpcastUsername: string,
    inReplyTo: string
): Promise<Memory[]> {
    const castChunks = splitCastContent(content.text);

    const sentCasts: any[] = [];
    let previousCastId = inReplyTo;

    for (const chunk of castChunks) {
        const { cast: postResult } = await client.neynarClient.publishCast({
            signerUuid: client.profile.signerUUID,
            text: chunk.trim(),
            parent: inReplyTo,
        });

        const { cast } =
            await client.neynarClient.lookupCastByHashOrWarpcastUrl({
                identifier: postResult.hash,
                type: "hash",
                viewerFid: client.profile.fid,
            });

        sentCasts.push(cast);

        await wait(1000, 2000);
    }

    const memories: Memory[] = sentCasts.map((cast) => ({
        id: stringToUuid(cast.hash + "-" + client.runtime.agentId),
        agentId: client.runtime.agentId,
        userId: client.runtime.agentId,
        content: {
            text: cast.text,
            source: "warpcast",
            url: cast.hash,
            inReplyTo: cast.parent_hash
                ? stringToUuid(cast.parent_hash + "-" + client.runtime.agentId)
                : undefined,
        },
        roomId,
        embedding: embeddingZeroVector,
        createdAt: new Date(cast.timestamp).getTime(),
    }));

    return memories;
}

function splitCastContent(content: string): string[] {
    const maxLength = MAX_CAST_LENGTH;
    const paragraphs = content.split("\n\n").map((p) => p.trim());
    const tweets: string[] = [];
    let currentCast = "";

    for (const paragraph of paragraphs) {
        if (!paragraph) continue;

        if ((currentCast + "\n\n" + paragraph).trim().length <= maxLength) {
            if (currentCast) {
                currentCast += "\n\n" + paragraph;
            } else {
                currentCast = paragraph;
            }
        } else {
            if (currentCast) {
                tweets.push(currentCast.trim());
            }
            if (paragraph.length <= maxLength) {
                currentCast = paragraph;
            } else {
                // Split long paragraph into smaller chunks
                const chunks = splitParagraph(paragraph, maxLength);
                tweets.push(...chunks.slice(0, -1));
                currentCast = chunks[chunks.length - 1];
            }
        }
    }

    if (currentCast) {
        tweets.push(currentCast.trim());
    }

    return tweets;
}

function splitParagraph(paragraph: string, maxLength: number): string[] {
    const sentences = paragraph.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [
        paragraph,
    ];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length <= maxLength) {
            if (currentChunk) {
                currentChunk += " " + sentence;
            } else {
                currentChunk = sentence;
            }
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            if (sentence.length <= maxLength) {
                currentChunk = sentence;
            } else {
                // Split long sentence into smaller pieces
                const words = sentence.split(" ");
                currentChunk = "";
                for (const word of words) {
                    if (
                        (currentChunk + " " + word).trim().length <= maxLength
                    ) {
                        if (currentChunk) {
                            currentChunk += " " + word;
                        } else {
                            currentChunk = word;
                        }
                    } else {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim());
                        }
                        currentChunk = word;
                    }
                }
            }
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}
