import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const UCP_AGENT_PROFILE =
  "https://ucp-agent-profile.facetimefy.com/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json";

const createCartInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  cart: z
    .object({
      line_items: z
        .array(
          z.object({
            quantity: z
              .number()
              .int()
              .min(1)
              .describe("The quantity to add for this line item."),
            item: z.object({
              id: z
                .string()
                .describe("The full Shopify product variant GID (e.g., gid://shopify/ProductVariant/12345) for this line item.")
            })
          })
        )
        .describe(
          "Array of items to add to the cart. Each item must include quantity and an item object with the product variant GID."
        ),
      context: z
        .object({
          address_country: z.string().optional().describe("Localization hint for the buyer country."),
          address_region: z.string().optional().describe("Localization hint for the buyer region."),
          postal_code: z.string().optional().describe("Localization hint for the buyer postal code.")
        })
        .describe(
          "Localization hints including address_country, address_region, and postal_code. Merchants may use these as a signal for pricing, availability, and currency estimates, but context is not authoritative for shipping — collect a shipping address through Checkout MCP when the buyer is ready to purchase. If omitted, the merchant falls back to geo-IP."
        )
        .optional(),
      attribution: z
        .object({
          referring_domain: z.string().optional(),
          click_id_tag: z.string().optional(),
          click_id_value: z.string().optional(),
          activity_id_tag: z.string().optional(),
          activity_id_value: z.string().optional(),
          utm_campaign: z.string().optional(),
          utm_source: z.string().optional(),
          utm_medium: z.string().optional(),
          utm_content: z.string().optional(),
          utm_term: z.string().optional()
        })
        .describe(
          "Optional attribution metadata. Supported fields include referring_domain, click_id_tag, click_id_value, activity_id_tag, activity_id_value, utm_campaign, utm_source, utm_medium, utm_content, and utm_term."
        )
        .optional(),
      buyer: z
        .object({})
        .passthrough()
        .describe("Optional buyer information for personalized estimates.")
        .optional(),
      signals: z
        .object({})
        .passthrough()
        .describe("Optional platform-provided environment data for authorization and abuse prevention.")
        .optional()
    })
    .describe("The cart object containing the cart data.")
});

const updateCartInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  id: z.string().describe("The ID of the cart to update (e.g. gid://shopify/Cart/cart_abc123)."),
  cart: z
    .object({
      line_items: z
        .array(
          z.object({
            quantity: z
              .number()
              .int()
              .min(1)
              .describe("The full replacement quantity for this line item."),
            item: z.object({
              id: z
                .string()
                .describe("The full Shopify product variant GID (e.g., gid://shopify/ProductVariant/12345) for this line item.")
            })
          })
        )
        .describe("Full replacement array of items."),
      context: z
        .object({
          address_country: z.string().optional().describe("Localization signal for the buyer country."),
          address_region: z.string().optional().describe("Localization signal for the buyer region."),
          postal_code: z.string().optional().describe("Localization signal for the buyer postal code.")
        })
        .describe(
          "Localization signals. Context is a hint for pricing, availability, and currency and is not used as the shipping address at checkout."
        )
        .optional(),
      attribution: z
        .object({
          referring_domain: z.string().optional(),
          click_id_tag: z.string().optional(),
          click_id_value: z.string().optional(),
          activity_id_tag: z.string().optional(),
          activity_id_value: z.string().optional(),
          utm_campaign: z.string().optional(),
          utm_source: z.string().optional(),
          utm_medium: z.string().optional(),
          utm_content: z.string().optional(),
          utm_term: z.string().optional()
        })
        .describe(
          "Attribution metadata. Because the cart object is replaced, resend attribution if you want to preserve it."
        )
        .optional(),
      buyer: z
        .object({})
        .passthrough()
        .describe("Optional buyer information.")
        .optional(),
      signals: z
        .object({})
        .passthrough()
        .describe("Optional platform signals.")
        .optional()
    })
    .describe(
      "The cart object containing the full desired cart state. Any field you omit is removed from the cart. update_cart uses PUT semantics and does not merge partial updates."
    )
});

function createServer() {
  const server = new McpServer({
    name: "carts",
    version: "1.0.0"
  });

  server.registerTool(
    "create_cart",
    {
      description: "Create a new cart with line items and optional buyer context. Use this tool when the buyer has selected products from the Catalog and you want to build a cart before starting checkout. The response includes a cart object with the merchant-assigned id, validated line items, estimated totals, and a continue_url that the buyer can use to pick up the cart on the merchant's storefront. If you require sales channel attribution and plan to convert the cart into a checkout with create_checkout, set attribution on the cart before conversion.",
      inputSchema: createCartInputSchema
    },
    async ({ shop_domain, cart }: z.infer<typeof createCartInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: {
            name: "create_cart",
            arguments: {
              meta: {
                "ucp-agent": {
                  profile: UCP_AGENT_PROFILE
                }
              },
              cart
            }
          }
        })
      });
      const result = await response.json() as {
        error?: unknown;
        result?: {
          content?: Array<{ type: "text"; text: string }>;
          structuredContent?: Record<string, unknown>;
          isError?: boolean;
        };
      };
      if ("error" in result) {
        return {
          content: [{ text: JSON.stringify(result.error), type: "text" as const }],
          structuredContent: { error: result.error },
          isError: true
        };
      }
      return {
        content: result.result?.content ?? [{ text: JSON.stringify(result.result?.structuredContent ?? {}), type: "text" as const }],
        structuredContent: result.result?.structuredContent ?? {},
        ...(result.result?.isError !== undefined ? { isError: result.result.isError } : {})
      };
    }
  );

  server.registerTool(
    "update_cart",
    {
      description: "Replace the contents of an existing cart. Caution: update_cart uses PUT semantics. Each request replaces the cart's full state with the payload you send. Omit a field (for example line_items or context) and it's removed from the cart. This differs from Storefront API and AJAX cart mutations. Preserve all existing state that the user has not asked to change.",
      inputSchema: updateCartInputSchema
    },
    async ({ shop_domain, id, cart }: z.infer<typeof updateCartInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 2,
          params: {
            name: "update_cart",
            arguments: {
              meta: {
                "ucp-agent": {
                  profile: UCP_AGENT_PROFILE
                }
              },
              id,
              cart
            }
          }
        })
      });
      const result = await response.json() as {
        error?: unknown;
        result?: {
          content?: Array<{ type: "text"; text: string }>;
          structuredContent?: Record<string, unknown>;
          isError?: boolean;
        };
      };
      if ("error" in result) {
        return {
          content: [{ text: JSON.stringify(result.error), type: "text" as const }],
          structuredContent: { error: result.error },
          isError: true
        };
      }
      return {
        content: result.result?.content ?? [{ text: JSON.stringify(result.result?.structuredContent ?? {}), type: "text" as const }],
        structuredContent: result.result?.structuredContent ?? {},
        ...(result.result?.isError !== undefined ? { isError: result.result.isError } : {})
      };
    }
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer, {
      allowedOriginHostnames: "*",
    })(request, env, ctx);
  },
} satisfies ExportedHandler;
