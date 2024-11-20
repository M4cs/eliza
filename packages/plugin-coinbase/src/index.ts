<<<<<<< HEAD
import {
    composeContext,
    elizaLogger,
    generateObjectV2,
    ModelClass,
    Provider,
} from "@ai16z/eliza";
=======
import { CBCommerceClient } from "coinbase-api";
import { elizaLogger } from "@ai16z/eliza";
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    Plugin,
    State,
} from "@ai16z/eliza";
<<<<<<< HEAD
import { ChargeContent, ChargeSchema, isChargeContent } from "./types";
import { chargeTemplate, getChargeTemplate } from "./templates";

const url = "https://api.commerce.coinbase.com/charges";
interface ChargeRequest {
    name: string;
    description: string;
    pricing_type: string;
=======

export type ChargeParams = {
    buyer_locale?: string;
    cancel_url?: string;
    checkout_id?: string;
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
    local_price: {
        amount: string;
        currency: string;
    };
<<<<<<< HEAD
}

export async function createCharge(apiKey: string, params: ChargeRequest) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CC-Api-Key": apiKey,
            },
            body: JSON.stringify(params),
        });

        if (!response.ok) {
            throw new Error(`Failed to create charge: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error("Error creating charge:", error);
        throw error;
=======
    metadata?: {
        custom_field?: string;
        custom_field_two?: string;
    };
    pricing_type: string;
    redirect_url?: string;
};

export async function createCharge(
    client: CBCommerceClient,
    params: ChargeParams
) {
    try {
        const response = await client.createCharge({
            local_price: params.local_price,
            pricing_type: params.pricing_type,
            buyer_locale: params.buyer_locale,
            cancel_url: params.cancel_url,
            redirect_url: params.redirect_url,
            metadata: params.metadata,
        });

        console.log("Charge created successfully:", response);
    } catch (error) {
        console.error("Error creating charge:", error);
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
    }
}

// Function to fetch all charges
<<<<<<< HEAD
export async function getAllCharges(apiKey: string) {
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-CC-Api-Key": apiKey,
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch all charges: ${response.statusText}`
            );
        }

        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error("Error fetching charges:", error);
        throw error;
=======
export async function getAllCharges(client: CBCommerceClient) {
    try {
        const response = await client.getAllCharges();
        console.log("Fetched all charges:", response);
    } catch (error) {
        console.error("Error fetching charges:", error);
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
    }
}

// Function to fetch details of a specific charge
<<<<<<< HEAD
export async function getChargeDetails(apiKey: string, chargeId: string) {
    const getUrl = `${url}${chargeId}`;

    try {
        const response = await fetch(getUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-CC-Api-Key": apiKey,
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch charge details: ${response.statusText}`
            );
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(
            `Error fetching charge details for ID ${chargeId}:`,
            error
        );
        throw error;
=======
export async function getChargeDetails(
    client: CBCommerceClient,
    chargeId: string
) {
    try {
        const response = await client.getCharge({
            charge_code_or_charge_id: chargeId,
        });
        console.log("Charge details:", response);
    } catch (error) {
        console.error("Error fetching charge details:", error);
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
    }
}

export const createCoinbaseChargeAction: Action = {
    name: "CREATE_CHARGE",
    similes: [
        "MAKE_CHARGE",
        "INITIATE_CHARGE",
        "GENERATE_CHARGE",
        "CREATE_TRANSACTION",
        "COINBASE_CHARGE",
    ],
    description: "Create a charge using Coinbase Commerce.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const coinbaseCommerceKeyOk = !!runtime.getSetting(
            "COINBASE_COMMERCE_KEY"
        );

        // Ensure Coinbase Commerce API key is available
        return coinbaseCommerceKeyOk;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Composing state for message:", message);
<<<<<<< HEAD
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const context = composeContext({
            state,
            template: chargeTemplate,
        });

        const chargeDetails = await generateObjectV2({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: ChargeSchema,
        });
        if (!isChargeContent(chargeDetails.object)) {
            throw new Error("Invalid content");
        }
        const charge = chargeDetails.object as ChargeContent;
        if (!charge || !charge.price || !charge.type) {
=======
        state = (await runtime.composeState(message)) as State;

        const chargeDetails = message.content.data as ChargeParams; // Safely typecast or validate the incoming data
        if (
            !chargeDetails ||
            !chargeDetails.local_price ||
            !chargeDetails.pricing_type
        ) {
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
            callback(
                {
                    text: "Invalid charge details provided.",
                },
                []
            );
            return;
        }

        elizaLogger.log("Charge details received:", chargeDetails);

        // Initialize Coinbase Commerce client
<<<<<<< HEAD

        try {
            // Create a charge
            const chargeResponse = await createCharge(
                runtime.getSetting("COINBASE_COMMERCE_KEY"),
                {
                    local_price: {
                        amount: charge.price.toString(),
                        currency: charge.currency,
                    },
                    pricing_type: charge.type,
                    name: charge.name,
                    description: charge.description,
                }
            );
=======
        const commerceClient = new CBCommerceClient({
            apiKey: runtime.getSetting("COINBASE_COMMERCE_KEY"),
        });

        try {
            // Create a charge
            const chargeResponse = await commerceClient.createCharge({
                local_price: chargeDetails.local_price,
                pricing_type: chargeDetails.pricing_type,
                buyer_locale: chargeDetails.buyer_locale || "en-US",
                cancel_url: chargeDetails.cancel_url,
                redirect_url: chargeDetails.redirect_url,
                metadata: chargeDetails.metadata || {},
            });
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)

            elizaLogger.log(
                "Coinbase Commerce charge created:",
                chargeResponse
            );

            callback(
                {
                    text: `Charge created successfully: ${chargeResponse.hosted_url}`,
                    attachments: [
                        {
                            id: crypto.randomUUID(),
<<<<<<< HEAD
                            url: chargeResponse.id,
=======
                            url: chargeResponse.hosted_url,
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                            title: "Coinbase Commerce Charge",
                            description: `Charge ID: ${chargeResponse.id}`,
                            text: `Pay here: ${chargeResponse.hosted_url}`,
                            source: "coinbase",
                        },
                    ],
                },
                []
            );
        } catch (error) {
            elizaLogger.error(
                "Error creating Coinbase Commerce charge:",
                error
            );
            callback(
                {
                    text: "Failed to create a charge. Please try again.",
                },
                []
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
<<<<<<< HEAD
                    text: "Create a charge for $10.00 USD to Chris for dinner",
=======
                    text: "Create a charge for $10.00",
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                    data: {
                        local_price: {
                            amount: "10.00",
                            currency: "USD",
                        },
                        pricing_type: "fixed_price",
                        buyer_locale: "en-US",
                        cancel_url: "https://example.com/cancel",
                        redirect_url: "https://example.com/success",
                    },
                },
            },
            {
                user: "{{agentName}}",
                content: {
<<<<<<< HEAD
                    text: "Charge created successfully: {{charge.id}} for {{charge.amount}} {{charge.currency}}",
=======
                    text: "Charge created successfully: https://commerce.coinbase.com/charges/123456",
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                    action: "CREATE_CHARGE",
                },
            },
        ],
    ],
} as Action;

export const getAllChargesAction: Action = {
    name: "GET_ALL_CHARGES",
    similes: ["FETCH_ALL_CHARGES", "RETRIEVE_ALL_CHARGES", "LIST_ALL_CHARGES"],
    description: "Fetch all charges using Coinbase Commerce.",
    validate: async (runtime: IAgentRuntime) => {
        const coinbaseCommerceKeyOk = !!runtime.getSetting(
            "COINBASE_COMMERCE_KEY"
        );

        // Ensure Coinbase Commerce API key is available
        return coinbaseCommerceKeyOk;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
<<<<<<< HEAD
        try {
            elizaLogger.log("Composing state for message:", message);
            if (!state) {
                state = (await runtime.composeState(message)) as State;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }
            const charges = await getAllCharges(
                runtime.getSetting("COINBASE_COMMERCE_KEY")
            );
=======
        const commerceClient = new CBCommerceClient({
            apiKey: runtime.getSetting("COINBASE_COMMERCE_KEY"),
        });

        try {
            const charges = await commerceClient.getAllCharges();
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)

            elizaLogger.log("Fetched all charges:", charges);

            callback(
                {
                    text: `Successfully fetched all charges. Total charges: ${charges.length}`,
                },
                []
            );
        } catch (error) {
            elizaLogger.error("Error fetching all charges:", error);
            callback(
                {
                    text: "Failed to fetch all charges. Please try again.",
                },
                []
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Fetch all charges" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Successfully fetched all charges.",
                    action: "GET_ALL_CHARGES",
                },
            },
        ],
    ],
} as Action;

export const getChargeDetailsAction: Action = {
    name: "GET_CHARGE_DETAILS",
    similes: ["FETCH_CHARGE_DETAILS", "RETRIEVE_CHARGE_DETAILS", "GET_CHARGE"],
    description: "Fetch details of a specific charge using Coinbase Commerce.",
    validate: async (runtime: IAgentRuntime) => {
        const coinbaseCommerceKeyOk = !!runtime.getSetting(
            "COINBASE_COMMERCE_KEY"
        );

        // Ensure Coinbase Commerce API key is available
        return coinbaseCommerceKeyOk;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
<<<<<<< HEAD
        elizaLogger.log("Composing state for message:", message);
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const context = composeContext({
            state,
            template: getChargeTemplate,
        });
        const chargeDetails = await generateObjectV2({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: ChargeSchema,
        });
        if (!isChargeContent(chargeDetails.object)) {
            throw new Error("Invalid content");
        }
        const charge = chargeDetails.object as ChargeContent;
        if (!charge.id) {
=======
        const { chargeId } = options;

        if (!chargeId) {
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
            callback(
                {
                    text: "Missing charge ID. Please provide a valid charge ID.",
                },
                []
            );
            return;
        }

<<<<<<< HEAD
        try {
            const chargeDetails = await getChargeDetails(
                runtime.getSetting("COINBASE_COMMERCE_KEY"),
                charge.id
            );
=======
        const commerceClient = new CBCommerceClient({
            apiKey: runtime.getSetting("COINBASE_COMMERCE_KEY"),
        });

        try {
            const chargeDetails = await commerceClient.getCharge({
                charge_code_or_charge_id: chargeId,
            });
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)

            elizaLogger.log("Fetched charge details:", chargeDetails);

            callback(
                {
<<<<<<< HEAD
                    text: `Successfully fetched charge details for ID: ${charge.id}`,
=======
                    text: `Successfully fetched charge details for ID: ${chargeId}`,
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                    attachments: [
                        {
                            id: crypto.randomUUID(),
                            url: chargeDetails.hosted_url,
<<<<<<< HEAD
                            title: `Charge Details for ${charge.id}`,
=======
                            title: `Charge Details for ${chargeId}`,
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                            description: `Details: ${JSON.stringify(chargeDetails, null, 2)}`,
                            source: "coinbase",
                            text: "",
                        },
                    ],
                },
                []
            );
        } catch (error) {
            elizaLogger.error(
<<<<<<< HEAD
                `Error fetching details for charge ID ${charge.id}:`,
=======
                `Error fetching details for charge ID ${chargeId}:`,
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                error
            );
            callback(
                {
<<<<<<< HEAD
                    text: `Failed to fetch details for charge ID: ${charge.id}. Please try again.`,
=======
                    text: `Failed to fetch details for charge ID: ${chargeId}. Please try again.`,
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                },
                []
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Fetch details of charge ID: 123456",
                },
            },
            {
                user: "{{agentName}}",
                content: {
<<<<<<< HEAD
                    text: "Successfully fetched charge details. {{charge.id}} for {{charge.amount}} {{charge.currency}} to {{charge.name}} for {{charge.description}}",
=======
                    text: "Successfully fetched charge details.",
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
                    action: "GET_CHARGE_DETAILS",
                },
            },
        ],
    ],
};

<<<<<<< HEAD
export const chargeProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory) => {
        const charges = await getAllCharges(
            runtime.getSetting("COINBASE_COMMERCE_KEY")
        );
        return charges.data;
    },
};

=======
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
export const coinbaseCommercePlugin: Plugin = {
    name: "coinbaseCommerce",
    description:
        "Integration with Coinbase Commerce for creating and managing charges.",
    actions: [
        createCoinbaseChargeAction,
        getAllChargesAction,
        getChargeDetailsAction,
    ],
    evaluators: [],
<<<<<<< HEAD
    providers: [chargeProvider],
=======
    providers: [],
>>>>>>> f60c5360 (Implement Coinbase Commerce Provider)
};
