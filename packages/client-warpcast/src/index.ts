import { Client, elizaLogger, IAgentRuntime } from "@ai16z/eliza";
import { ClientBase } from "./base";
import { WarpcastPostClient } from "./post";
import { validateWarpcastConfig } from "./environment";
import { WarpcastInteractionClient } from "./interactions";

class WarpcastManager {
    client: ClientBase;
    post: WarpcastPostClient;
    interaction: WarpcastInteractionClient;

    constructor(runtime: IAgentRuntime) {
        this.client = new ClientBase(runtime);
        this.post = new WarpcastPostClient(this.client, runtime);
        this.interaction = new WarpcastInteractionClient(this.client, runtime);
    }
}

export const WarpcastClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        await validateWarpcastConfig(runtime);

        elizaLogger.log(`Warpcast Client Starting...`);

        const manager = new WarpcastManager(runtime);

        await manager.client.init();

        await manager.post.start();

        await manager.interaction.start();

        return manager;
    },

    async stop(runtime: IAgentRuntime) {
        elizaLogger.warn(`No need to stop Warpcast Client`);
    },
};
