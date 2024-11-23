import { IAgentRuntime } from "@ai16z/eliza";
import { z } from "zod";

export const warpcastEnvSchema = z.object({
    WARPCAST_DRY_RUN: z
        .string()
        .transform((val) => val.toLowerCase() === "true"),
    WARPCAST_FID: z.number().min(1, "Warpcast FID is required"),
    WARPCAST_USERNAME: z.string().min(1, "Warpcast Username is required"),
    NEYNAR_API_KEY: z.string().min(1, "Neynar API Key is required"),
    NEYNAR_SIGNER_UUID: z.string().min(1, "Neynar Signer UUID is required"),
});

export type WarpcastConfig = z.infer<typeof warpcastEnvSchema>;

export async function validateWarpcastConfig(
    runtime: IAgentRuntime
): Promise<WarpcastConfig> {
    try {
        const config = {
            WARPCAST_DRY_RUN:
                runtime.getSetting("WARPCAST_DRY_RUN") ||
                process.env.WARPCAST_DRY_RUN,
            WARPCAST_FID:
                parseInt(runtime.character.settings?.secrets?.WARPCAST_FID) ||
                parseInt(runtime.getSetting("WARPCAST_FID")) ||
                parseInt(process.env.WARPCAST_FID),
            WARPCAST_USERNAME:
                runtime.character.settings?.secrets?.WARPCAST_USERNAME ||
                runtime.getSetting("WARPCAST_USERNAME") ||
                process.env.WARPCAST_USERNAME,
            NEYNAR_API_KEY:
                runtime.character.settings?.secrets?.NEYNAR_API_KEY ||
                runtime.getSetting("NEYNAR_API_KEY") ||
                process.env.NEYNAR_API_KEY,
            NEYNAR_CLIENT_UUID:
                runtime.character.settings?.secrets?.NEYNAR_CLIENT_UUID ||
                runtime.getSetting("NEYNAR_CLIENT_UUID") ||
                process.env.NEYNAR_CLIENT_UUID,
            NEYNAR_SIGNER_UUID:
                runtime.character.settings?.secrets?.NEYNAR_SIGNER_UUID ||
                runtime.getSetting("NEYNAR_SIGNER_UUID") ||
                process.env.NEYNAR_SIGNER_UUID,
        };

        return warpcastEnvSchema.parse(config);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `Warpcast configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}
