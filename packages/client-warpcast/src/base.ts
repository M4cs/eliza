import { EventEmitter } from "events";
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import {
    Content,
    elizaLogger,
    embeddingZeroVector,
    IAgentRuntime,
    IImageDescriptionService,
    Memory,
    State,
    stringToUuid,
    UUID,
} from "@ai16z/eliza";

type WarpcastProfile = {
    fid: number;
    username: string;
    display_name?: string;
    bio: string;
    signerUUID?: string;
};

export class ClientBase extends EventEmitter {
    static _neynarClient: NeynarAPIClient;
    neynarClient: NeynarAPIClient;
    runtime: IAgentRuntime;
    directions: string;
    lastCheckedCastHash: string | null = null;
    imageDescriptionService: IImageDescriptionService;
    temperature: number = 0.5;

    profile: WarpcastProfile;

    callback: (self: ClientBase) => any = null;

    onReady() {
        throw new Error(
            "Not implemented in base class, please call from subclass"
        );
    }

    constructor(runtime: IAgentRuntime) {
        super();
        this.runtime = runtime;
        if (ClientBase._neynarClient) {
            this.neynarClient = ClientBase._neynarClient;
        } else {
            const apiKey =
                this.runtime.character.settings?.secrets?.NEYNAR_API_KEY ||
                this.runtime.getSetting("NEYNAR_API_KEY");
            if (!apiKey) {
                throw new Error("NEYNAR_API_KEY is not configured");
            }
            this.neynarClient = new NeynarAPIClient({
                apiKey:
                    this.runtime.character.settings?.secrets?.NEYNAR_API_KEY ||
                    this.runtime.getSetting("NEYNAR_API_KEY"),
            });
            ClientBase._neynarClient = this.neynarClient;
        }

        this.directions =
            "- " +
            this.runtime.character.style.all.join("\n- ") +
            "- " +
            this.runtime.character.style.post.join("\n- ");
    }

    async init() {
        const fid =
            parseInt(this.runtime.character.settings?.secrets?.WARPCAST_FID) ||
            parseInt(this.runtime.getSetting("WARPCAST_FID"));
        const signerUUID =
            this.runtime.character?.settings?.secrets?.NEYNAR_SIGNER_UUID ||
            this.runtime.getSetting("NEYNAR_SIGNER_UUID");

        if (!fid) {
            throw new Error("WARPCAST_FID is not configured");
        }

        if (!signerUUID) {
            throw new Error("NEYNAR_SIGNER_UUID is not configured");
        }

        elizaLogger.log("Verifying Neynar has access to FID");

        const data = await this.neynarClient.lookupSigner({
            signerUuid: signerUUID,
        });

        if (data.status === "approved" && data.fid === fid) {
            elizaLogger.log(`Successfully connected to FID: ${data.fid}`);
        } else if (data.status === "approved" && data.fid !== fid) {
            elizaLogger.warn(
                `Successfully accessed signer but mismatched FID! Not connecting.`
            );
            return;
        }

        this.profile = await this.fetchProfile(fid);

        if (this.profile) {
            elizaLogger.log(`Warpcast user FID:`, this.profile.fid);
            elizaLogger.log(
                `Warpcast Loaded:`,
                `- Username: @${this.profile.username}`,
                `- Display Name: ${this.profile.display_name}`,
                `- Bio: ${this.profile.bio}`
            );

            this.runtime.character.warpcastProfile = {
                fid: this.profile.fid,
                username: this.profile.username,
                display_name: this.profile.display_name,
                bio: this.profile.bio,
                signerUUID: signerUUID,
            };
            this.profile.signerUUID = signerUUID;
        } else {
            throw new Error("Failed to load Warpcast profile properly");
        }

        await this.loadLatestCheckedCastId();
        await this.populateTimeline();
    }

    async fetchHomeTimeline(count: number) {
        const homeTimeline = await this.neynarClient.fetchFeed({
            feedType: "filter",
            fids: this.profile.fid.toString(),
            viewerFid: this.profile.fid,
            limit: count,
        });

        return homeTimeline.casts;
    }

    async fetchSearchCasts(query: string, count: number, cursor?: string) {
        try {
            const data = await this.neynarClient.searchCasts({
                q: query,
                limit: count,
                cursor,
            });
            return data.result;
        } catch (error) {
            elizaLogger.error(`Error searching tweets:`, error);
        }
    }

    async loadLatestCheckedCastId() {}

    async getCachedCast(hash: string): Promise<any | undefined> {
        const cached = await this.runtime.cacheManager.get<any>(
            `warpcast/casts/${hash}`
        );
        return cached;
    }

    async cacheCast(cast: any): Promise<void> {
        if (!cast) {
            elizaLogger.warn(`Cast is undefined, skipping cache`);
            return;
        }

        this.runtime.cacheManager.set(`warpcast/casts/${cast.hash}`, cast);
    }

    async getCachedMentions(): Promise<any[] | undefined> {
        return await this.runtime.cacheManager.get<any[]>(
            `warpcast/${this.profile.fid}/mentions`
        );
    }

    async cacheMentions(mentions: any[]) {
        await this.runtime.cacheManager.set(
            `warpcast/${this.profile.fid}/mentions`,
            mentions,
            { expires: 10 * 1000 }
        );
    }

    async getCachedTimeline(): Promise<any[] | undefined> {
        return await this.runtime.cacheManager.get<any[]>(
            `warpcast/${this.profile.fid}/timeline`
        );
    }

    async cacheTimeline(timeline: any[]) {
        await this.runtime.cacheManager.set(
            `warpcast/${this.profile.fid}/timeline`,
            timeline,
            { expires: 10 * 1000 }
        );
    }

    async getCachedProfile(fid: number) {
        return await this.runtime.cacheManager.get<WarpcastProfile>(
            `warpcast/${fid}/profile`
        );
    }

    async cacheProfile(fid: number, profile: WarpcastProfile) {
        await this.runtime.cacheManager.set<WarpcastProfile>(
            `warpcast/${fid}/profile`,
            profile
        );
    }

    async fetchProfile(fid: number): Promise<WarpcastProfile> {
        const cached = await this.getCachedProfile(fid);
        if (cached) {
            return cached;
        }

        try {
            const data = await this.neynarClient.fetchBulkUsers({
                fids: [fid],
            });

            if (data.users.length === 0) {
                elizaLogger.warn(`Tried to find user by FID but couldn't!`);
                return undefined;
            }

            const profile = data.users[0];

            const formattedProfile: WarpcastProfile = {
                fid: profile.fid,
                username: profile.username,
                display_name: profile.display_name,
                bio: profile.profile.bio.text,
            };

            await this.cacheProfile(fid, formattedProfile);
            return formattedProfile;
        } catch (error) {
            elizaLogger.error(`Error fetching Warpcast profile:`, error);

            return undefined;
        }
    }

    async saveRequestMessage(message: Memory, state: State) {
        if (message.content.text) {
            const recentMessage = await this.runtime.messageManager.getMemories(
                {
                    roomId: message.roomId,
                    agentId: this.runtime.agentId,
                    count: 1,
                    unique: false,
                }
            );

            if (
                recentMessage.length > 0 &&
                recentMessage[0].content === message.content
            ) {
                elizaLogger.warn(`Message already saved...`, recentMessage[0]);
            } else {
                await this.runtime.messageManager.createMemory({
                    ...message,
                    embedding: embeddingZeroVector,
                });
            }

            await this.runtime.evaluate(message, {
                ...state,
                neynarClient: this.neynarClient,
            });
        }
    }

    async loadLatestCheckedCastHash(): Promise<void> {
        const latestCheckedCastHash =
            await this.runtime.cacheManager.get<string>(
                `warpcast/${this.profile.fid}/latest_checked_cast_hash`
            );

        if (latestCheckedCastHash) {
            this.lastCheckedCastHash = latestCheckedCastHash;
        }
    }

    async cacheLatestCheckedCastHash() {
        if (this.lastCheckedCastHash) {
            await this.runtime.cacheManager.set<string>(
                `warpcast/${this.profile.fid}/latest_checked_cast_has`,
                this.lastCheckedCastHash
            );
        }
    }

    private async populateTimeline() {
        elizaLogger.debug(`Populating warpcast timeline...`);

        const cached = await this.getCachedTimeline();

        if (cached) {
            const existingMemories =
                await this.runtime.messageManager.getMemoriesByRoomIds({
                    agentId: this.runtime.agentId,
                    roomIds: cached.map((cast) =>
                        stringToUuid(
                            cast.thread_hash + "-" + this.runtime.agentId
                        )
                    ),
                });

            const existingMemoryIds = new Set(
                existingMemories.map((memory) => memory.id.toString())
            );

            const someCachedCastsExist = cached.some((cast) => {
                existingMemoryIds.has(
                    stringToUuid(cast.hash + "-" + this.runtime)
                );
            });

            if (someCachedCastsExist) {
                const castsToSave = cached.filter(
                    (cast) =>
                        !existingMemoryIds.has(
                            stringToUuid(cast.hash + "-" + this.runtime.agentId)
                        )
                );

                console.log({
                    processingCasts: castsToSave
                        .map((cast) => cast.hash)
                        .join(","),
                });

                for (const cast of castsToSave) {
                    elizaLogger.log(`Saving Cast: ${cast.hash}`);

                    const roomId = stringToUuid(
                        cast.thread_hash + "-" + this.runtime.agentId
                    );

                    const userId =
                        cast.author.fid === this.profile.fid
                            ? this.runtime.agentId
                            : stringToUuid(cast.author.fid.toString());

                    if (cast.author.fid === this.profile.fid) {
                        await this.runtime.ensureConnection(
                            this.runtime.agentId,
                            roomId,
                            this.profile.username,
                            this.profile.display_name,
                            "warpcast"
                        );
                    } else {
                        await this.runtime.ensureConnection(
                            userId,
                            roomId,
                            cast.author.username,
                            cast.author.display_name,
                            "warpcast"
                        );
                    }

                    const content = {
                        text: cast.text,
                        url: cast.hash,
                        source: "warpcast",
                        inReplyTo: cast.parent_hash
                            ? stringToUuid(
                                  cast.parent_hash + "-" + this.runtime.agentId
                              )
                            : undefined,
                    } as Content;

                    elizaLogger.log(`Creating memory for cast: ${cast.hash}`);

                    const memory =
                        await this.runtime.messageManager.getMemoryById(
                            stringToUuid(cast.hash + "-" + this.runtime.agentId)
                        );
                    if (memory) {
                        elizaLogger.log(
                            `Memory already exists, skipping timeline population`
                        );
                        break;
                    }

                    await this.runtime.messageManager.createMemory({
                        id: stringToUuid(
                            cast.hash + "-" + this.runtime.agentId
                        ),
                        userId,
                        content,
                        agentId: this.runtime.agentId,
                        roomId,
                        embedding: embeddingZeroVector,
                        createdAt: new Date(cast.timestamp).getTime(),
                    });

                    await this.cacheCast(cast);
                }

                elizaLogger.log(
                    `Populated ${castsToSave.length} missing tweets from the cache.`
                );
                return;
            }
        }

        const timeline = await this.fetchHomeTimeline(cached ? 10 : 50);

        const mentionsAndInteractions = await this.fetchSearchCasts(
            `${this.runtime.getSetting("WARPCAST_USERNAME")}`,
            20
        );

        const allCasts: any[] = [...timeline, ...mentionsAndInteractions.casts];

        const castHashesToCheck = new Set<string>();
        const roomIds = new Set<UUID>();

        for (const cast of allCasts) {
            castHashesToCheck.add(cast.hash);
            roomIds.add(
                stringToUuid(cast.thread_hash + "-" + this.runtime.agentId)
            );
        }

        const existingMemories =
            await this.runtime.messageManager.getMemoriesByRoomIds({
                agentId: this.runtime.agentId,
                roomIds: Array.from(roomIds),
            });

        const existingMemoryIds = new Set<UUID>(
            existingMemories.map((memory) => memory.id)
        );

        const castsToSave = allCasts.filter(
            (cast) =>
                !existingMemoryIds.has(
                    stringToUuid(cast.hash + "-" + this.runtime.agentId)
                )
        );

        elizaLogger.debug({
            processingCasts: castsToSave.map((cast) => cast.hash).join(","),
        });

        await this.runtime.ensureUserExists(
            this.runtime.agentId,
            this.profile.username,
            this.runtime.character.name,
            "warpcast"
        );

        for (const cast of castsToSave) {
            elizaLogger.log(`Saving cast: ${cast.hash}`);

            const roomId = stringToUuid(
                cast.thread_hash + "-" + this.runtime.agentId
            );

            const userId =
                cast.author.fid === this.profile.fid
                    ? this.runtime.agentId
                    : stringToUuid(cast.author.fid.toString());

            if (cast.author.fid === this.profile.fid) {
                await this.runtime.ensureConnection(
                    this.runtime.agentId,
                    roomId,
                    this.profile.username,
                    this.profile.display_name,
                    "warpcast"
                );
            } else {
                await this.runtime.ensureConnection(
                    userId,
                    roomId,
                    cast.author.username,
                    cast.author.display_name,
                    "warpcast"
                );
            }

            const content = {
                text: cast.text,
                url: cast.hash,
                source: "warpcast",
                inReplyTo: cast.parent_hash
                    ? stringToUuid(cast.parent_hash)
                    : undefined,
            } as Content;

            await this.runtime.messageManager.createMemory({
                id: stringToUuid(cast.hash + "-" + this.runtime.agentId),
                userId,
                content: content,
                agentId: this.runtime.agentId,
                roomId,
                embedding: embeddingZeroVector,
                createdAt: new Date(cast.timestamp).getTime(),
            });

            await this.cacheCast(cast);
        }

        await this.cacheTimeline(timeline);
        await this.cacheMentions(mentionsAndInteractions.casts);
    }
}
