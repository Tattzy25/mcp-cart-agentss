import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const helloInputSchema = z.object({
  name: z.string().optional()
});

const createCartInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  meta: z
    .object({
      "ucp-agent": z.object({
        profile: z
          .string()
          .url()
          .describe("The URI to your agent's UCP profile for capability negotiation.")
      })
    })
    .describe("Request metadata. You must include ucp-agent.profile."),
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
                .describe("The product variant id for this line item.")
            })
          })
        )
        .describe(
          "Array of items to add to the cart. Each item must include quantity and an item object with the product variant id."
        ),
    context: z
      .object({
        address_country: z.string().optional().describe("Localization hint for the buyer country."),
        address_region: z.string().optional().describe("Localization hint for the buyer region."),
        postal_code: z.string().optional().describe("Localization hint for the buyer postal code.")
      })
      .describe(
        "Localization hints including address_country, address_region, and postal_code. Merchants may use these as a signal for pricing, availability, and currency estimates, but context is not authoritative for shipping. If omitted, the merchant falls back to geo-IP."
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

function createServer() {
  const server = new McpServer({
    name: "carts",
    version: "1.0.0"
  });

  server.registerTool(
    "hello",
    {
      description: "Returns a greeting message",
      inputSchema: helloInputSchema
    },
    async ({ name }: z.infer<typeof helloInputSchema>) => {
      return {
        content: [
          {
            text: `Hello, ${name ?? "World"}!`,
            type: "text"
          }
        ]
      };
    }
  );

  server.registerTool(
    "create_cart",
    {
      description: "Create a new cart with line items and optional buyer context.",
      inputSchema: createCartInputSchema
    },
    async ({ shop_domain, meta, cart }: z.infer<typeof createCartInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: {
            name: "create_cart",
            arguments: {
              meta,
              cart
            }
          }
        })
      });

      const result = await response.json();

      return {
        content: [
          {
            text: JSON.stringify(result),
            type: "text"
          }
        ]
      };
    }
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer)(request, env, ctx);
  }
} satisfies ExportedHandler;
